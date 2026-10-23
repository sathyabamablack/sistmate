import "server-only";

import { z } from "zod";
import {
  DailyAttendanceSchema,
  HourlyDaySchema,
  SessionExpiredError,
  type DailyAttendance,
  type ErpAdapter,
  type HourlyDay,
} from "@usp/core";
import { periodErpContext } from "./data";
import { SectionShapeError, SectionTimeoutError, raceDeadline } from "./deadline";
import { staleIssueMessage } from "./issues";
import {
  ACADEMIC_WINDOW_SECTION,
  DEFAULT_DAILY_PERIOD,
  DEFAULT_HOURLY_PERIOD,
  campusToday,
  chunkRange,
  dailyPeriodSection,
  fitToWindow,
  hourlyPeriodSection,
  mergeHourly,
  periodRange,
  type DailyPeriodId,
  type DailyPeriodView,
  type DateRange,
  type HourlyPeriodId,
  type HourlyPeriodView,
} from "./attendance-range";

/**
 * The Attendance page's period picker. The default periods (this month by day,
 * the last 14 days by hour) come from the dashboard's cached sections; any other
 * period is read here, straight from the ERP, with its own cache entry per student
 * and period (same 3-minute TTL, last good copy served when the ERP fails, same
 * time budget).
 *
 * ERP calls per period:
 *  - day-wise, academic window known: 1 (0 when the period is entirely before it);
 *  - day-wise, window not known yet: the adapter's 1-2, plus 1 when "This semester"
 *    turns out to start earlier than the 6-month fallback;
 *  - hour-wise: one per 31 days, at most 4 (the newest 124 days).
 */

const DateRangeSchema = z.object({ from: z.string(), to: z.string() });

const StoredDailySchema = z.object({
  range: DateRangeSchema,
  daily: DailyAttendanceSchema.nullable(),
  windowStart: z.string().nullable(),
  semesterUnknown: z.boolean(),
});
type StoredDaily = z.infer<typeof StoredDailySchema>;

const StoredHourlySchema = z.object({
  range: DateRangeSchema,
  days: z.array(HourlyDaySchema),
  trimmedFrom: z.string().nullable(),
  semesterUnknown: z.boolean(),
});
type StoredHourly = z.infer<typeof StoredHourlySchema>;

/** The academic window is remembered for this long (it changes once a semester). */
const WINDOW_TTL_MS = 12 * 60 * 60 * 1000;

type Context = Awaited<ReturnType<typeof periodErpContext>>;

/** Validate what the adapter returned, the same way the dashboard sections are. */
function check<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown, what: string): T {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const where = parsed.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "(root)"}:${i.code}`)
    .join(", ");
  console.error(`[data] erp/${what}: unexpected shape (${where})`);
  throw new SectionShapeError("erp");
}

/** One ERP call under the shared deadline; a timeout reads as the usual message. */
async function ask<T>(ctx: Context, work: () => Promise<T>): Promise<T> {
  try {
    return await raceDeadline(work(), ctx.deadline, "erp");
  } catch (err) {
    if (ctx.deadline.aborted && !(err instanceof SessionExpiredError)) throw new SectionTimeoutError("erp");
    throw err;
  }
}

/** The ERP's academic window, from this period loader's memory or the dashboard's day-wise copy. */
async function knownWindow(ctx: Context): Promise<DateRange | null> {
  const saved = await ctx.cache.get<DateRange>(`${ctx.scope}:${ACADEMIC_WINDOW_SECTION}`);
  if (saved) return saved;
  const dashboard = await ctx.cache.get<DailyAttendance | null>(`${ctx.scope}:daily-attendance`);
  return dashboard?.academicWindow ?? null;
}

async function rememberWindow(ctx: Context, window: DateRange | undefined): Promise<void> {
  if (window) await ctx.cache.set(`${ctx.scope}:${ACADEMIC_WINDOW_SECTION}`, window, WINDOW_TTL_MS);
}

/** Cached load with stale-while-error, shaped like lib/data.ts's sections. */
async function cached<T>(
  ctx: Context,
  section: string,
  fetch: () => Promise<T>,
): Promise<{ value: T; staleNotice: string | null } | { error: string }> {
  let staleNotice: string | null = null;
  try {
    const value = await ctx.cache.wrap<T>(`${ctx.scope}:${section}`, ctx.ttlMs, fetch, {
      onStale: ({ storedAt }) => {
        staleNotice = staleIssueMessage(storedAt);
      },
      serveStaleOn: (err) => !(err instanceof SessionExpiredError),
    });
    return { value, staleNotice };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load.";
    // The section and message only: never request bodies or credentials.
    console.error(`[data] erp/${section}: ${message}`);
    return { error: message };
  }
}

async function loadDaily(ctx: Context, erp: ErpAdapter, period: DailyPeriodId, today: string): Promise<StoredDaily> {
  const getDaily = erp.getDailyAttendance?.bind(erp);
  let window = await knownWindow(ctx);
  let range = periodRange(period, today, window);
  let fit = fitToWindow(range, window);
  const result = (daily: DailyAttendance | null): StoredDaily => ({
    range: { from: range.from, to: range.to },
    daily,
    windowStart: window && fit.startsBefore ? window.from : null,
    semesterUnknown: period === "this-semester" && !window,
  });
  if (!getDaily) throw new Error("This ERP does not offer day-wise attendance.");
  // Entirely before the academic window: the ERP has no day-wise records for it.
  if (!fit.range) return result(null);

  const read = async (r: DateRange) =>
    check(DailyAttendanceSchema, await ask(ctx, () => getDaily(r.from, r.to)), dailyPeriodSection(period));

  let daily = await read(fit.range);
  if (!window && daily.academicWindow) {
    // Learned the window just now: recompute the period with it ("This semester"
    // starts at the window's first day) and ask again only if that changes the range.
    window = daily.academicWindow;
    range = periodRange(period, today, window);
    fit = fitToWindow(range, window);
    if (!fit.range) return result(null);
    if (fit.range.from !== daily.window.from || fit.range.to !== daily.window.to) daily = await read(fit.range);
  }
  await rememberWindow(ctx, daily.academicWindow);
  return result(daily);
}

async function loadHourly(
  ctx: Context,
  erp: ErpAdapter,
  period: HourlyPeriodId,
  today: string,
): Promise<StoredHourly> {
  const getHourly = erp.getHourlyAttendance?.bind(erp);
  if (!getHourly) throw new Error("This ERP does not offer hour-wise attendance.");
  const window = await knownWindow(ctx);
  const range = periodRange(period, today, window);
  // The ERP is asked at most 31 days at a time; long periods keep their newest part.
  const { chunks, trimmedFrom } = chunkRange(range);
  const pieces = await Promise.all(
    chunks.map(async (c) =>
      check(z.array(HourlyDaySchema), await ask(ctx, () => getHourly(c.from, c.to)), hourlyPeriodSection(period)),
    ),
  );
  const from = trimmedFrom ?? range.from;
  const days: HourlyDay[] = mergeHourly(pieces).filter((d) => d.date >= from && d.date <= range.to);
  return {
    range: { from, to: range.to },
    days,
    trimmedFrom,
    semesterUnknown: period === "this-semester" && !window,
  };
}

/**
 * Day-wise and hour-wise attendance for the chosen periods. `null` for a default
 * period: the page uses the dashboard's cached section for it. Never throws; a
 * failure comes back as `error` in that period's view.
 */
export async function getAttendancePeriod(
  daily: DailyPeriodId,
  hourly: HourlyPeriodId,
): Promise<{ daily: DailyPeriodView | null; hourly: HourlyPeriodView | null }> {
  const wantDaily = daily !== DEFAULT_DAILY_PERIOD;
  const wantHourly = hourly !== DEFAULT_HOURLY_PERIOD;
  if (!wantDaily && !wantHourly) return { daily: null, hourly: null };

  const today = campusToday();
  let ctx: Context;
  try {
    ctx = await periodErpContext();
  } catch (err) {
    const error = err instanceof Error ? err.message : "Not signed in.";
    return {
      daily: wantDaily ? failedDaily(daily, today, error) : null,
      hourly: wantHourly ? failedHourly(hourly, today, error) : null,
    };
  }

  const [d, h] = await Promise.all([
    wantDaily ? cached(ctx, dailyPeriodSection(daily), async () =>
      check(StoredDailySchema, await loadDaily(ctx, ctx.erp, daily, today), dailyPeriodSection(daily)),
    ) : null,
    wantHourly ? cached(ctx, hourlyPeriodSection(hourly), async () =>
      check(StoredHourlySchema, await loadHourly(ctx, ctx.erp, hourly, today), hourlyPeriodSection(hourly)),
    ) : null,
  ]);

  return {
    daily: !d ? null : "error" in d ? failedDaily(daily, today, d.error) : { period: daily, ...d.value, error: null, staleNotice: d.staleNotice },
    hourly: !h ? null : "error" in h ? failedHourly(hourly, today, h.error) : { period: hourly, ...h.value, error: null, staleNotice: h.staleNotice },
  };
}

function failedDaily(period: DailyPeriodId, today: string, error: string): DailyPeriodView {
  const { from, to } = periodRange(period, today);
  return { period, range: { from, to }, daily: null, windowStart: null, semesterUnknown: false, error, staleNotice: null };
}

function failedHourly(period: HourlyPeriodId, today: string, error: string): HourlyPeriodView {
  const { from, to } = periodRange(period, today);
  return { period, range: { from, to }, days: [], trimmedFrom: null, semesterUnknown: false, error, staleNotice: null };
}
