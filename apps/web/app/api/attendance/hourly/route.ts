import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { HourlyDaySchema, SessionExpiredError, isDateKey, type HourlyDay } from "@usp/core";
import { NotSignedInError, periodErpContext } from "@/lib/data";
import { SectionShapeError, SectionTimeoutError, raceDeadline } from "@/lib/deadline";
import { staleIssueMessage } from "@/lib/issues";
import { erpSessionExpiry } from "@/lib/jwt";
import { dataSource, getSession } from "@/lib/session";
import { campusToday, chunkRange, mergeHourly, rangeDays, type DateRange } from "@/lib/attendance-range";

// Portal round-trips can be slow; stay within the free plan's limits.
export const maxDuration = 30;

/**
 * The signed-in student's hour-wise attendance for a date range, for the OD tracker
 * (the dashboard only carries the last 14 days).
 *
 *   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *     200 { from, to, days: HourlyDay[] (oldest first), staleNotice: string | null }
 *         `to` is clamped to today; a range entirely after today returns no days
 *     400 { error }  missing or invalid dates, from after to, or more than 120 days
 *     401 { error }  signed out, or the portal session has expired
 *     502 { error }  the ERP did not answer and nothing was saved
 *
 * Same adapter, deadline, per-student cache scope and 3-minute TTL as the dashboard
 * and the period picker. One cache entry per student (OD_HOURLY_SECTION) holds the
 * last range read; a request inside it is answered from it, anything else reads again.
 * The ERP is asked at most 31 days at a time (4 requests for 120 days).
 */

const NO_STORE = { "Cache-Control": "private, no-store" };

// Same values as OD_FETCH_MAX_DAYS and OD_HOURLY_SECTION in lib/od.ts. That module also holds the
// client hook, so it stays out of the server bundle; e2e/od.spec.ts checks the day limit.
const OD_FETCH_MAX_DAYS = 120;
const OD_HOURLY_SECTION = "hourly-attendance@od";

const StoredSchema = z.object({
  range: z.object({ from: z.string(), to: z.string() }),
  days: z.array(HourlyDaySchema),
});
type Stored = z.infer<typeof StoredSchema>;

const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: NO_STORE });

/** The range asked for, or why it cannot be read. */
function parseRange(params: URLSearchParams, today: string): DateRange | string {
  const from = params.get("from");
  const to = params.get("to");
  if (!isDateKey(from) || !isDateKey(to)) return "Give from and to as YYYY-MM-DD.";
  if (from > to) return "from must not be after to.";
  if (rangeDays({ from, to }) > OD_FETCH_MAX_DAYS) return `At most ${OD_FETCH_MAX_DAYS} days at a time.`;
  return { from, to: to < today ? to : today };
}

const covers = (outer: DateRange, inner: DateRange) => outer.from <= inner.from && outer.to >= inner.to;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.username) return fail(401, "Unauthorized");
  if (dataSource() === "live") {
    const expiresAt = erpSessionExpiry(session.erpSession);
    if (expiresAt !== null && expiresAt <= Date.now()) return fail(401, "Session expired. Sign in again.");
  }

  const today = campusToday();
  const range = parseRange(req.nextUrl.searchParams, today);
  if (typeof range === "string") return fail(400, range);
  if (range.from > range.to) {
    return NextResponse.json({ ...range, days: [], staleNotice: null }, { headers: NO_STORE });
  }

  let ctx: Awaited<ReturnType<typeof periodErpContext>>;
  try {
    ctx = await periodErpContext();
  } catch (err) {
    if (err instanceof NotSignedInError) return fail(401, "Unauthorized");
    throw err;
  }
  const getHourly = ctx.erp.getHourlyAttendance?.bind(ctx.erp);
  if (!getHourly) return fail(502, "This ERP does not offer hour-wise attendance.");

  const read = async (): Promise<Stored> => {
    const pieces = await Promise.all(
      chunkRange(range).chunks.map(async (c) => {
        let raw: unknown;
        try {
          raw = await raceDeadline(getHourly(c.from, c.to), ctx.deadline, "erp");
        } catch (err) {
          if (ctx.deadline.aborted && !(err instanceof SessionExpiredError)) throw new SectionTimeoutError("erp");
          throw err;
        }
        const parsed = z.array(HourlyDaySchema).safeParse(raw);
        if (!parsed.success) {
          // Field paths and codes only: the values are the student's data.
          const where = parsed.error.issues
            .slice(0, 5)
            .map((i) => `${i.path.join(".") || "(root)"}:${i.code}`)
            .join(", ");
          console.error(`[data] erp/${OD_HOURLY_SECTION}: unexpected shape (${where})`);
          throw new SectionShapeError("erp");
        }
        return parsed.data;
      }),
    );
    return StoredSchema.parse({ range, days: mergeHourly(pieces) });
  };

  const key = `${ctx.scope}:${OD_HOURLY_SECTION}`;
  let staleNotice: string | null = null;
  const load = () =>
    ctx.cache.wrap<Stored>(key, ctx.ttlMs, read, {
      onStale: ({ storedAt }) => {
        staleNotice = staleIssueMessage(storedAt);
      },
      serveStaleOn: (err) => !(err instanceof SessionExpiredError),
    });

  let stored: Stored;
  try {
    stored = await load();
    if (!covers(stored.range, range)) {
      // The saved copy is for other dates: read this range instead.
      await ctx.cache.expire(key);
      staleNotice = null;
      stored = await load();
      if (!covers(stored.range, range)) throw new Error("The ERP did not answer.");
    }
  } catch (err) {
    if (err instanceof SessionExpiredError) return fail(401, "Session expired. Sign in again.");
    const message = err instanceof Error ? err.message : "Failed to load.";
    // The section and message only: never request bodies or credentials.
    console.error(`[data] erp/${OD_HOURLY_SECTION}: ${message}`);
    return fail(502, message);
  }

  const days: HourlyDay[] = stored.days.filter((d) => d.date >= range.from && d.date <= range.to);
  return NextResponse.json({ ...range, days, staleNotice }, { headers: NO_STORE });
}
