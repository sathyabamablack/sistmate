import {
  addDays,
  campusNow,
  monthEnd,
  monthStart,
  type DailyAttendance,
  type DashboardData,
  type HourlyDay,
} from "@usp/core";
import { isStaleIssue } from "./issues";

/**
 * The periods a student can pick for day-wise and hour-wise attendance, and the
 * campus-date ranges they stand for. Pure, so the server renders it and tests run it.
 *
 * Every range is in campus dates ("YYYY-MM-DD", Asia/Kolkata) and never ends after
 * today. "This semester" is the ERP's academic window, which only the ERP knows
 * (its day-wise reply carries it); until then it falls back to the last 6 months.
 */

export interface DateRange {
  /** inclusive campus dates */
  from: string;
  to: string;
}

export const DAILY_PERIOD_IDS = ["this-month", "last-month", "past-3-months", "this-semester"] as const;
export const HOURLY_PERIOD_IDS = [
  "last-7-days",
  "last-14-days",
  "last-30-days",
  "this-month",
  "last-month",
  "past-3-months",
  "this-semester",
] as const;

export type DailyPeriodId = (typeof DAILY_PERIOD_IDS)[number];
export type HourlyPeriodId = (typeof HOURLY_PERIOD_IDS)[number];
export type PeriodId = DailyPeriodId | HourlyPeriodId;

/** The dashboard's own ranges: they come from its cached sections, so they cost nothing extra. */
export const DEFAULT_DAILY_PERIOD: DailyPeriodId = "this-month";
export const DEFAULT_HOURLY_PERIOD: HourlyPeriodId = "last-14-days";

/** URL search params: `?days=<period>&hours=<period>`. */
export const DAILY_PARAM = "days";
export const HOURLY_PARAM = "hours";

/** Without the ERP's academic window, "This semester" shows this many calendar months. */
export const SEMESTER_FALLBACK_MONTHS = 6;

/** Hour-wise requests are split into pieces of at most this many days... */
export const HOURLY_CHUNK_DAYS = 31;
/** ...and at most this many pieces per period. */
export const HOURLY_MAX_CHUNKS = 4;

/** Hour-wise lists longer than this many days are grouped by month. */
export const GROUP_BY_MONTH_AFTER_DAYS = 14;

const LABELS: Record<PeriodId, string> = {
  "last-7-days": "Last 7 days",
  "last-14-days": "Last 14 days",
  "last-30-days": "Last 30 days",
  "this-month": "This month",
  "last-month": "Last month",
  "past-3-months": "Past 3 months",
  "this-semester": "This semester",
};

export const periodLabel = (id: PeriodId): string => LABELS[id];

export const DAILY_PERIOD_OPTIONS = DAILY_PERIOD_IDS.map((id) => ({ value: id, label: LABELS[id] }));
export const HOURLY_PERIOD_OPTIONS = HOURLY_PERIOD_IDS.map((id) => ({ value: id, label: LABELS[id] }));

function pick<T extends string>(ids: readonly T[], fallback: T, raw: string | string[] | undefined): T {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return ids.includes(value as T) ? (value as T) : fallback;
}

/** `?days=` as a period; anything unknown means the default. */
export const parseDailyPeriod = (raw: string | string[] | undefined): DailyPeriodId =>
  pick(DAILY_PERIOD_IDS, DEFAULT_DAILY_PERIOD, raw);

/** `?hours=` as a period; anything unknown means the default. */
export const parseHourlyPeriod = (raw: string | string[] | undefined): HourlyPeriodId =>
  pick(HOURLY_PERIOD_IDS, DEFAULT_HOURLY_PERIOD, raw);

/** First day of the month `months` calendar months away from `date`'s month. */
export function shiftMonth(date: string, months: number): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - 1 + months;
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

const minDate = (a: string, b: string) => (a < b ? a : b);
const maxDate = (a: string, b: string) => (a > b ? a : b);

/** Today in campus time. */
export const campusToday = (now: Date = new Date()): string => campusNow(now).date;

export interface PeriodRange extends DateRange {
  /** "This semester" without a known academic window: the last 6 months instead */
  semesterUnknown: boolean;
}

/**
 * The campus-date range a period stands for, never after `today`.
 *
 *  - Last 7 / 14 / 30 days: that many days, today included;
 *  - This month: the 1st to today; Last month: the whole previous month;
 *  - Past 3 months: the 1st of the month two months back to today (three calendar months);
 *  - This semester: the academic window's first day to today (or to the window's
 *    last day once it has passed); unknown window: the last 6 calendar months.
 */
export function periodRange(id: PeriodId, today: string, academicWindow?: DateRange | null): PeriodRange {
  const plain = (from: string, to: string = today): PeriodRange => ({
    from: minDate(from, today),
    to: minDate(to, today),
    semesterUnknown: false,
  });
  switch (id) {
    case "last-7-days":
      return plain(addDays(today, -6));
    case "last-14-days":
      return plain(addDays(today, -13));
    case "last-30-days":
      return plain(addDays(today, -29));
    case "this-month":
      return plain(monthStart(today));
    case "last-month": {
      const first = shiftMonth(today, -1);
      return plain(first, monthEnd(first));
    }
    case "past-3-months":
      return plain(shiftMonth(today, -2));
    case "this-semester":
      if (academicWindow) return plain(academicWindow.from, academicWindow.to);
      return { ...plain(shiftMonth(today, -(SEMESTER_FALLBACK_MONTHS - 1))), semesterUnknown: true };
  }
}

/** Number of days in a range, both ends included (0 when it is empty). */
export function rangeDays(range: DateRange): number {
  if (range.from > range.to) return 0;
  return Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000) + 1;
}

export interface WindowFit {
  /** the part of the range the ERP keeps day-wise records for; null when none of it */
  range: DateRange | null;
  /** the range starts before the academic window: the ERP has nothing for those days */
  startsBefore: boolean;
}

/**
 * Trim a range to the ERP's academic window. The ERP refuses day-wise ranges
 * outside it, so anything before the window has no day-wise records.
 */
export function fitToWindow(range: DateRange, window: DateRange | null | undefined): WindowFit {
  if (!window) return { range, startsBefore: false };
  const from = maxDate(range.from, window.from);
  const to = minDate(range.to, window.to);
  return { range: from <= to ? { from, to } : null, startsBefore: range.from < window.from };
}

/**
 * Split a range into pieces of at most `maxDays`, newest first. With more than
 * `maxChunks` pieces only the newest are kept and `trimmedFrom` says where the
 * kept part now starts.
 */
export function chunkRange(
  range: DateRange,
  maxDays = HOURLY_CHUNK_DAYS,
  maxChunks = HOURLY_MAX_CHUNKS,
): { chunks: DateRange[]; trimmedFrom: string | null } {
  const chunks: DateRange[] = [];
  let to = range.to;
  while (to >= range.from) {
    const from = maxDate(addDays(to, -(maxDays - 1)), range.from);
    if (chunks.length === maxChunks) return { chunks, trimmedFrom: chunks.at(-1)!.from };
    chunks.push({ from, to });
    to = addDays(from, -1);
  }
  return { chunks, trimmedFrom: null };
}

/** Months ("YYYY-MM") a range touches, newest first. */
export function monthsInRange(range: DateRange): string[] {
  const out: string[] = [];
  if (range.from > range.to) return out;
  for (let m = monthStart(range.to); m >= monthStart(range.from); m = shiftMonth(m, -1)) out.push(m.slice(0, 7));
  return out;
}

/** Hour-wise days (any order) grouped by month, both newest first. */
export function groupByMonth(days: readonly HourlyDay[]): { month: string; days: HourlyDay[] }[] {
  const groups = new Map<string, HourlyDay[]>();
  for (const d of [...days].sort((a, b) => b.date.localeCompare(a.date))) {
    const month = d.date.slice(0, 7);
    groups.set(month, [...(groups.get(month) ?? []), d]);
  }
  return [...groups].map(([month, list]) => ({ month, days: list }));
}

/** Merge hour-wise pieces: one entry per date (a later piece wins), oldest first. */
export function mergeHourly(pieces: readonly (readonly HourlyDay[])[]): HourlyDay[] {
  const byDate = new Map<string, HourlyDay>();
  for (const piece of pieces) for (const d of piece) byDate.set(d.date, d);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface HourTotals {
  present: number;
  absent: number;
  notGiven: number;
  /** present / (present + absent), 0..100; null when nothing is entered yet */
  percentage: number | null;
}

/** Hours present, absent and not entered yet across a list of days. */
export function hourTotals(days: readonly HourlyDay[]): HourTotals {
  let present = 0;
  let absent = 0;
  let notGiven = 0;
  for (const d of days) {
    present += d.present;
    absent += d.absent;
    notGiven += d.notGiven;
  }
  const entered = present + absent;
  return { present, absent, notGiven, percentage: entered > 0 ? (present / entered) * 100 : null };
}

/** The days of a daily reply that fall in one month ("YYYY-MM"). */
export function daysInMonth(daily: DailyAttendance, month: string): DailyAttendance["days"] {
  return daily.days.filter((d) => d.date.startsWith(month));
}

/* ------------------------------ wording ------------------------------ */

const SHORT_FMT = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const SHORT_YEAR_FMT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const at = (date: string) => new Date(`${date}T00:00:00Z`);

/** "1 Aug to 12 Oct 2026", "15 Dec 2025 to 12 Jan 2026", "12 Oct 2026" */
export function formatRange(range: DateRange): string {
  if (range.from === range.to) return SHORT_YEAR_FMT.format(at(range.to));
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  return `${(sameYear ? SHORT_FMT : SHORT_YEAR_FMT).format(at(range.from))} to ${SHORT_YEAR_FMT.format(at(range.to))}`;
}

/** The period in a sentence: "the ERP has no hour-wise attendance for {phrase}". */
export function periodPhrase(id: PeriodId): string {
  switch (id) {
    case "last-7-days":
      return "the last 7 days";
    case "last-14-days":
      return "the last 14 days";
    case "last-30-days":
      return "the last 30 days";
    case "this-month":
      return "this month so far";
    case "last-month":
      return "last month";
    case "past-3-months":
      return "the past 3 months";
    case "this-semester":
      return "this semester";
  }
}

/** Plain-language notes about what a period could and could not show. */
export const SEMESTER_UNKNOWN_NOTE = `The ERP has not said when this semester began yet, so this shows the last ${SEMESTER_FALLBACK_MONTHS} months.`;
export const BEFORE_SEMESTER_NOTE = "Before this semester the ERP has no day-wise records.";

/* -------------------------------- views -------------------------------- */

/** Day-wise attendance for one period, ready to render. */
export interface DailyPeriodView {
  period: DailyPeriodId;
  /** the dates the period stands for */
  range: DateRange;
  /** the ERP's records for the part of the range inside its academic window; null when none or failed */
  daily: DailyAttendance | null;
  /** the period starts before the ERP's day-wise records do: their first day */
  windowStart: string | null;
  /** "This semester" without a known academic window (the last 6 months are shown) */
  semesterUnknown: boolean;
  /** why nothing could be shown, when the ERP did not answer and nothing was saved */
  error: string | null;
  /** "Showing data saved at 9:12 pm" when an older copy is shown */
  staleNotice: string | null;
}

/** Hour-wise attendance for one period, ready to render. */
export interface HourlyPeriodView {
  period: HourlyPeriodId;
  /** the dates that were read (the period, or its newest part when trimmed) */
  range: DateRange;
  /** oldest first */
  days: HourlyDay[];
  /** the period was longer than the app asks the ERP for at once: where the shown part starts */
  trimmedFrom: string | null;
  semesterUnknown: boolean;
  error: string | null;
  staleNotice: string | null;
}

const notLoaded = (data: Pick<DashboardData, "issues">, section: string): string | null =>
  data.issues.find((i) => i.section === section && !isStaleIssue(i))?.message ?? null;

/** The default day-wise period, from the dashboard's own section (stale notices show in the app banner). */
export function dailyViewFromDashboard(
  data: Pick<DashboardData, "dailyAttendance" | "issues">,
  today: string,
): DailyPeriodView {
  const daily = data.dailyAttendance;
  const range = periodRange(DEFAULT_DAILY_PERIOD, today);
  const window = daily?.academicWindow;
  return {
    period: DEFAULT_DAILY_PERIOD,
    range,
    daily,
    windowStart: window && range.from < window.from ? window.from : null,
    semesterUnknown: false,
    error: daily ? null : (notLoaded(data, "daily-attendance") ?? "The ERP did not answer."),
    staleNotice: null,
  };
}

/** The default hour-wise period, from the dashboard's own section. */
export function hourlyViewFromDashboard(
  data: Pick<DashboardData, "hourlyAttendance" | "issues">,
  today: string,
): HourlyPeriodView {
  const { from, to } = periodRange(DEFAULT_HOURLY_PERIOD, today);
  return {
    period: DEFAULT_HOURLY_PERIOD,
    range: { from, to },
    days: data.hourlyAttendance,
    trimmedFrom: null,
    semesterUnknown: false,
    error: notLoaded(data, "hourly-attendance"),
    staleNotice: null,
  };
}

/* ------------------------------ cache keys ----------------------------- */

/** Cache sections for the non-default periods, so Refresh data / sign-out can drop them too. */
export const dailyPeriodSection = (id: DailyPeriodId) => `daily-attendance@${id}`;
export const hourlyPeriodSection = (id: HourlyPeriodId) => `hourly-attendance@${id}`;
/** The ERP's academic window, remembered from any day-wise reply. */
export const ACADEMIC_WINDOW_SECTION = "academic-window";

export const PERIOD_CACHE_SECTIONS: readonly string[] = [
  ...DAILY_PERIOD_IDS.filter((id) => id !== DEFAULT_DAILY_PERIOD).map(dailyPeriodSection),
  ...HOURLY_PERIOD_IDS.filter((id) => id !== DEFAULT_HOURLY_PERIOD).map(hourlyPeriodSection),
  ACADEMIC_WINDOW_SECTION,
];
