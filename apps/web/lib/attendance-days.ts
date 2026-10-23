import {
  addDays,
  campusNow,
  monthEnd,
  weekdayOf,
  type AttendanceDay,
  type AttendanceDayStatus,
  type DailyAttendance,
  type DashboardData,
  type HourlyDay,
  type TimetableSlot,
} from "@usp/core";
import { isStaleIssue } from "./issues";

/**
 * View helpers for the ERP's day-wise and hour-wise attendance. The ERP decides
 * both; nothing here guesses. Pure, so the server renders it and tests run it.
 *
 * Two separate verdicts:
 *  - day-wise: absent days are listed by the ERP; any other working day counts as
 *    present from 3 pm (see `buildDailyAttendance` in @usp/core);
 *  - hour-wise: per date, hours present, absent and not entered yet by faculty.
 */

export const DAILY_RULE = "The ERP counts a day as present from 3 pm unless you are marked absent.";
export const HOURLY_NOT_POSTED = "Not posted yet";
export const HOURLY_POSTS_AFTER = "Hour-wise attendance usually appears after 7 pm.";

export type Tone = "success" | "danger" | "warning" | "muted";

export interface DailyVerdict {
  kind: AttendanceDayStatus | "no-day" | "outdated" | "unavailable";
  tone: Tone;
  title: string;
  detail?: string;
}

/** Today's day-wise verdict. `daily` is null when the section did not load. */
export function todayDailyVerdict(daily: DailyAttendance | null, today: string): DailyVerdict {
  if (!daily) {
    return {
      kind: "unavailable",
      tone: "warning",
      title: "Not available",
      detail: "The ERP's day-wise attendance did not load. Check again in a minute.",
    };
  }
  const day = daily.days.find((d) => d.date === today);
  if (!day) {
    return daily.window.to < today
      ? {
          kind: "outdated",
          tone: "warning",
          title: "Not loaded for today",
          detail: "This copy is from an earlier day. Check again to load today.",
        }
      : {
          kind: "no-day",
          tone: "muted",
          title: "No attendance today",
          detail: "The ERP does not count today as a working day.",
        };
  }
  switch (day.status) {
    case "present":
      return { kind: "present", tone: "success", title: "Present", detail: "No absence is marked for today." };
    case "absent":
      return { kind: "absent", tone: "danger", title: "Absent", detail: "The ERP marks you absent for today." };
    case "holiday":
      return { kind: "holiday", tone: "muted", title: "Holiday", detail: day.label };
    case "pending":
      return { kind: "pending", tone: "muted", title: "Not marked yet" };
    case "upcoming":
      return { kind: "upcoming", tone: "muted", title: "Not marked yet" };
  }
}

/* ------------------------------ hour-wise ------------------------------ */

export type HourStatus = "present" | "absent" | "not-given";

export interface HourChip {
  hour: number;
  status: HourStatus;
  /** subject in that hour on the timetable, when it can be matched */
  subject?: string;
}

const hoursWord = (n: number) => (n === 1 ? "hour" : "hours");

/** "4 of 6 hours present, 1 absent, 1 not entered yet" */
export function hourlySummaryText(day: HourlyDay): string {
  const parts = [`${day.present} of ${day.totalHours} ${hoursWord(day.totalHours)} present`];
  if (day.absent > 0) parts.push(`${day.absent} absent`);
  if (day.notGiven > 0) parts.push(`${day.notGiven} not entered yet`);
  return parts.join(", ");
}

export function hourlyTone(day: HourlyDay): Tone {
  if (day.absent > 0) return "danger";
  if (day.notGiven > 0 || day.present === 0) return "muted";
  return "success";
}

/**
 * The timetable's period grid: every distinct start time in the week, in order.
 * Hour n of a day is the n-th period, so a free hour on one day does not shift
 * the subjects after it.
 */
export function periodStarts(timetable: readonly TimetableSlot[]): string[] {
  return [...new Set(timetable.map((s) => s.startTime))].sort();
}

/** Subject title for hour `hour` on `date`, from the weekly timetable. */
export function subjectForHour(
  timetable: readonly TimetableSlot[],
  date: string,
  hour: number,
  periods: readonly string[] = periodStarts(timetable),
): string | undefined {
  const start = periods[hour - 1];
  if (!start) return undefined;
  const weekday = weekdayOf(date);
  const day = weekday === 0 ? 6 : weekday - 1; // timetable: 0 = Monday
  return timetable.find((s) => s.day === day && s.startTime === start)?.courseTitle;
}

/** Per-hour chips, only when the ERP named the hours. */
export function hourChips(day: HourlyDay, timetable: readonly TimetableSlot[]): HourChip[] {
  if (!day.presentHours && !day.absentHours && !day.notGivenHours) return [];
  const periods = periodStarts(timetable);
  const present = new Set(day.presentHours ?? []);
  const absent = new Set(day.absentHours ?? []);
  const notGiven = new Set(day.notGivenHours ?? []);
  const hours = [...new Set([...present, ...absent, ...notGiven])].sort((a, b) => a - b);
  return hours.map((hour) => ({
    hour,
    status: present.has(hour) ? "present" : absent.has(hour) ? "absent" : "not-given",
    subject: subjectForHour(timetable, day.date, hour, periods),
  }));
}

export interface HourlyVerdict {
  kind: "posted" | "not-posted" | "no-classes" | "unavailable";
  tone: Tone;
  title: string;
  detail?: string;
  day?: HourlyDay;
  chips: HourChip[];
}

/** Today's hour-wise verdict. `failed`: the section did not load and nothing was saved. */
export function todayHourlyVerdict(
  hourly: readonly HourlyDay[],
  today: string,
  timetable: readonly TimetableSlot[],
  failed: boolean,
): HourlyVerdict {
  const day = hourly.find((d) => d.date === today);
  if (!day && failed) {
    return {
      kind: "unavailable",
      tone: "warning",
      title: "Not available",
      detail: "The ERP's hour-wise attendance did not load. Check again in a minute.",
      chips: [],
    };
  }
  const chips = day ? hourChips(day, timetable) : [];
  if (!day || day.present + day.absent === 0) {
    const weekday = weekdayOf(today);
    const classesToday = timetable.some((s) => s.day === (weekday === 0 ? 6 : weekday - 1));
    if (!day && !classesToday) {
      return { kind: "no-classes", tone: "muted", title: "No classes today", chips: [] };
    }
    return {
      kind: "not-posted",
      tone: "muted",
      title: HOURLY_NOT_POSTED,
      detail: HOURLY_POSTS_AFTER,
      day,
      chips,
    };
  }
  return { kind: "posted", tone: hourlyTone(day), title: hourlySummaryText(day), day, chips };
}

/** Both of today's verdicts from one dashboard snapshot. */
export function todayVerdicts(
  data: Pick<DashboardData, "dailyAttendance" | "hourlyAttendance" | "timetable" | "issues">,
  now: Date = new Date(),
): { today: string; daily: DailyVerdict; hourly: HourlyVerdict } {
  const today = campusNow(now).date;
  const hourlyFailed = data.issues.some((i) => i.section === "hourly-attendance" && !isStaleIssue(i));
  const daily = todayDailyVerdict(data.dailyAttendance, today);
  let hourly = todayHourlyVerdict(data.hourlyAttendance, today, data.timetable, hourlyFailed);
  // On a holiday the timetable still lists classes, but no hours will be posted.
  if (daily.kind === "holiday" && hourly.kind === "not-posted" && !hourly.day) {
    hourly = { kind: "no-classes", tone: "muted", title: "No classes today", detail: "Today is a holiday.", chips: [] };
  }
  return { today, daily, hourly };
}

/* ------------------------------ dashboard ------------------------------ */

const DAILY_WORD: Record<DailyVerdict["kind"], string> = {
  present: "present",
  absent: "absent",
  pending: "not marked yet",
  upcoming: "not marked yet",
  holiday: "holiday",
  "no-day": "no attendance day",
  outdated: "not loaded",
  unavailable: "not loaded",
};

/** "Today: present (daily), 4 of 6 hours so far" */
export function todayChipText(daily: DailyVerdict, hourly: HourlyVerdict): { text: string; tone: Tone } {
  let hours: string;
  if (hourly.kind === "posted" && hourly.day) {
    const d = hourly.day;
    hours = `${d.present} of ${d.totalHours} ${hoursWord(d.totalHours)}${d.notGiven > 0 ? " so far" : ""}`;
  } else if (hourly.kind === "unavailable") {
    hours = "hours not loaded";
  } else if (hourly.kind === "no-classes") {
    hours = "no classes";
  } else {
    hours = "hours not posted yet";
  }
  const absentHours = hourly.day?.absent ?? 0;
  const tone: Tone =
    daily.kind === "absent" || absentHours > 0
      ? "danger"
      : daily.kind === "present" && hourly.kind === "posted" && hourly.tone === "success"
        ? "success"
        : daily.kind === "unavailable" || hourly.kind === "unavailable"
          ? "warning"
          : "muted";
  return { text: `Today: ${DAILY_WORD[daily.kind]} (daily), ${hours}`, tone };
}

/* ------------------------------ calendar ------------------------------- */

export interface CalendarCell {
  date: string;
  /** day of the month */
  day: number;
  /** "none": counted out by the ERP (no classes); "later": after the window */
  status: AttendanceDayStatus | "none" | "later";
  label?: string;
  isToday: boolean;
}

export interface MonthGrid {
  /** "YYYY-MM" */
  month: string;
  /** Monday-first weeks; null pads the days outside the month */
  weeks: (CalendarCell | null)[][];
}

/** One month ("YYYY-MM", default: the month of the window's last day), laid out Monday to Sunday. */
export function monthGrid(daily: DailyAttendance, today: string, month: string = daily.window.to.slice(0, 7)): MonthGrid {
  const byDate = new Map<string, AttendanceDay>(daily.days.map((d) => [d.date, d]));
  const first = `${month}-01`;
  const end = monthEnd(first);
  const lead = (weekdayOf(first) + 6) % 7; // Monday = 0
  const cells: (CalendarCell | null)[] = Array.from({ length: lead }, () => null);
  for (let date = first; date <= end; date = addDays(date, 1)) {
    const entry = byDate.get(date);
    const inWindow = date >= daily.window.from && date <= daily.window.to;
    cells.push({
      date,
      day: Number(date.slice(8)),
      status: entry ? entry.status : inWindow || date < daily.window.from ? "none" : "later",
      label: entry?.label,
      isToday: date === today,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (CalendarCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return { month, weeks };
}

/** Absent days and holidays, oldest first: the days that need a second look. */
export function notableDays(daily: DailyAttendance): AttendanceDay[] {
  return daily.days.filter((d) => d.status === "absent" || d.status === "holiday");
}

const MONTH_FMT = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY_FMT = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const LONG_DAY_FMT = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** "October 2026" */
export const formatMonth = (month: string) => MONTH_FMT.format(new Date(`${month}-01T00:00:00Z`));
/** "Mon, 12 Oct" */
export const formatDay = (date: string) => DAY_FMT.format(new Date(`${date}T00:00:00Z`));
/** "Monday, 12 October" */
export const formatLongDay = (date: string) => LONG_DAY_FMT.format(new Date(`${date}T00:00:00Z`));

/** Hour-wise days newest first. */
export function newestFirst(hourly: readonly HourlyDay[]): HourlyDay[] {
  return [...hourly].sort((a, b) => b.date.localeCompare(a.date));
}
