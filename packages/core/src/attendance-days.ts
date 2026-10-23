import type { AttendanceDay, DailyAttendance } from "./types";

/**
 * Day-wise attendance, decided exactly the way the ERP's own student page does it.
 *
 * The ERP's StudentWiseAttendance reply lists ABSENT days only, plus holidays, the
 * weekdays the timetable runs on and the dates that were actual working days. Its
 * page then walks the requested range and, for each date:
 *
 *   1. skips it unless its weekday is a timetable day AND it is an actual working day;
 *   2. absent  if the date is in the absent list;
 *   3. holiday if it is a Sunday (labelled "Sunday");
 *   4. holiday if it is in the holiday list (labelled with the ERP's comment);
 *   5. today:  present from 3 pm campus time, otherwise "Not marked yet";
 *   6. upcoming if it is in the future;
 *   7. present otherwise.
 *
 * Pure: the clock comes in as `now`. All dates are campus dates, "YYYY-MM-DD".
 */

/** The ERP's cut-off: from 3 pm campus time, a day with no absence counts as present. */
export const DAILY_MARK_HOUR = 15;

export const CAMPUS_TIME_ZONE = "Asia/Kolkata";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
/** A runaway range (bad input) never walks more than this many days. */
const MAX_DAYS = 400;

const CAMPUS_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: CAMPUS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Campus calendar date ("YYYY-MM-DD") and minutes since campus midnight. */
export function campusNow(now: Date = new Date()): { date: string; minutes: number } {
  const p = Object.fromEntries(CAMPUS_FMT.formatToParts(now).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_KEY.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  // Round-trip so "2026-02-31" is rejected instead of rolling over into March.
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value;
}

/** `date` moved by `days` calendar days. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday (the ERP's numbering, moment's format("d")). */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** First day of the month `date` falls in. */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Last day of the month `date` falls in. */
export function monthEnd(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export interface ErpDailyInput {
  /** first and last date to decide, inclusive */
  from: string;
  to: string;
  /** dates the ERP lists in AttendanceDetails (absent days) */
  absentDates: readonly string[];
  /** HolidayList, with the ERP's comment as the label */
  holidays: readonly { date: string; label?: string }[];
  /** TimeSetDays as weekday numbers, 0 = Sunday; null when the ERP sent none (every weekday counts) */
  timeSetDays: readonly number[] | null;
  /** ActualWorkingDays; null when the ERP sent none (every date counts) */
  workingDays: readonly string[] | null;
}

/** The ERP's verdict for one date, or null when the date is not considered at all. */
export function decideDay(
  date: string,
  input: {
    absent: ReadonlySet<string>;
    holidays: ReadonlyMap<string, string>;
    timeSetDays: ReadonlySet<number> | null;
    workingDays: ReadonlySet<string> | null;
  },
  today: string,
  minutes: number,
): AttendanceDay | null {
  const weekday = weekdayOf(date);
  if (input.timeSetDays && !input.timeSetDays.has(weekday)) return null;
  if (input.workingDays && !input.workingDays.has(date)) return null;

  if (input.absent.has(date)) return { date, status: "absent" };
  if (weekday === 0) return { date, status: "holiday", label: "Sunday" };
  const holiday = input.holidays.get(date);
  if (holiday !== undefined) return { date, status: "holiday", label: holiday || "Holiday" };
  if (date === today) {
    return minutes >= DAILY_MARK_HOUR * 60
      ? { date, status: "present" }
      : { date, status: "pending", label: "Not marked yet" };
  }
  if (date > today) return { date, status: "upcoming" };
  return { date, status: "present" };
}

/** Present / (present + absent), two decimals; null when nothing is decided. */
export function dailyPercentage(present: number, absent: number): number | null {
  const decided = present + absent;
  return decided > 0 ? Math.round((present / decided) * 10_000) / 100 : null;
}

export function summarizeDays(days: readonly AttendanceDay[]): DailyAttendance["summary"] {
  let present = 0;
  let absent = 0;
  let holidays = 0;
  for (const d of days) {
    if (d.status === "present") present += 1;
    else if (d.status === "absent") absent += 1;
    else if (d.status === "holiday") holidays += 1;
  }
  return { present, absent, holidays, percentage: dailyPercentage(present, absent) };
}

/** Every date from `from` to `to`, inclusive, oldest first. */
export function dateRange(from: string, to: string): string[] {
  if (!isDateKey(from) || !isDateKey(to) || from > to) return [];
  const out: string[] = [];
  for (let d = from; d <= to && out.length < MAX_DAYS; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Apply the ERP's daily rule to every date in the range. */
export function buildDailyAttendance(input: ErpDailyInput, now: Date = new Date()): DailyAttendance {
  const { date: today, minutes } = campusNow(now);
  const sets = {
    absent: new Set(input.absentDates),
    holidays: new Map(input.holidays.map((h) => [h.date, h.label ?? ""])),
    timeSetDays: input.timeSetDays ? new Set(input.timeSetDays) : null,
    workingDays: input.workingDays ? new Set(input.workingDays) : null,
  };
  const days: AttendanceDay[] = [];
  for (const date of dateRange(input.from, input.to)) {
    const day = decideDay(date, sets, today, minutes);
    if (day) days.push(day);
  }
  return { days, summary: summarizeDays(days), window: { from: input.from, to: input.to } };
}
