import {
  addDays,
  dateRange,
  isDateKey,
  projectAttendance,
  weekdayOf,
  type PlanSubject,
  type Projection,
} from "@usp/core";
import type { PlanSlot } from "./week-plan";
import { timeToMinutes } from "./utils";

/**
 * A leave (going home for a festival, a trip): the classes the weekly timetable
 * holds between two dates, and where each subject would stand after missing them.
 * Pure; the campus date and clock are passed in so the server, the browser and
 * the tests agree.
 *
 * Model, as in the week planner: every class held while you are away adds one
 * hour to the total and none to hours attended. Classes before the leave are not
 * counted, so attending them leaves you a little higher than shown. The app
 * cannot know holidays, so the student ticks those days off.
 *
 * When the ERP gives the semester's last day, days after it are not classes at all,
 * and getting back to the threshold is checked against the classes actually left:
 * "attend the next 7" is no use with 5 to go.
 */

/** A leave longer than this is not planned day by day. */
export const MAX_LEAVE_DAYS = 31;

/** The timetable's weekday of a "YYYY-MM-DD" date: 0 = Monday ... 6 = Sunday. */
export const timetableDay = (date: string): number => (weekdayOf(date) + 6) % 7;

/** The leave the planner opens with: tomorrow to the day after next. */
export function defaultLeave(today: string): { from: string; to: string } {
  return { from: addDays(today, 1), to: addDays(today, 3) };
}

export interface LeaveDay {
  date: string;
  /** 0 = Monday */
  day: number;
  /** the timetable's classes that day; today, only the ones that have not started */
  classes: PlanSlot[];
}

export type LeaveRangeError = "invalid" | "reversed" | "past" | "too-long";

export interface LeaveRange {
  /** days with at least one class, oldest first; days without classes are left out */
  days: LeaveDay[];
  /** the leave began before today, so the days already gone are not counted */
  clamped: boolean;
  /** the leave runs past the semester's last day, so the days after it are not counted */
  pastEnd: boolean;
  error: LeaveRangeError | null;
}

/** The class days from `from` to `to`, inclusive, read off the weekly timetable. */
export function leaveDays(
  slots: readonly PlanSlot[],
  from: string,
  to: string,
  now: { date: string; minutes: number },
  semesterEnd?: string | null,
): LeaveRange {
  const none = (error: LeaveRangeError): LeaveRange => ({ days: [], clamped: false, pastEnd: false, error });
  if (!isDateKey(from) || !isDateKey(to)) return none("invalid");
  if (to < from) return none("reversed");
  if (to < now.date) return none("past");
  // Days already gone are in the ERP (or will be), whatever the plan says.
  const clamped = from < now.date;
  const start = clamped ? now.date : from;
  const span = dateRange(start, to);
  if (span.length > MAX_LEAVE_DAYS) return none("too-long");

  const byDay = new Map<number, PlanSlot[]>();
  for (const s of slots) {
    const list = byDay.get(s.day);
    if (list) list.push(s);
    else byDay.set(s.day, [s]);
  }

  const end = semesterEnd && isDateKey(semesterEnd) ? semesterEnd : null;
  const pastEnd = end !== null && to > end;
  const days: LeaveDay[] = [];
  for (const date of span) {
    if (end !== null && date > end) break;
    const day = timetableDay(date);
    const classes = (byDay.get(day) ?? []).filter(
      (s) => date !== now.date || timeToMinutes(s.start) > now.minutes,
    );
    if (classes.length > 0) days.push({ date, day, classes });
  }
  return { days, clamped, pastEnd, error: null };
}

/** Classes held per subject from `from` to `to`, inclusive, read off the weekly timetable. */
export function classesBetween(slots: readonly PlanSlot[], from: string, to: string): Map<string, number> {
  const out = new Map<string, number>();
  if (!isDateKey(from) || !isDateKey(to) || to < from) return out;
  const perDay = new Map<number, PlanSlot[]>();
  for (const s of slots) perDay.set(s.day, [...(perDay.get(s.day) ?? []), s]);
  // A semester is a few months; the cap only guards against a bad date.
  for (const date of dateRange(from, to).slice(0, 400)) {
    for (const c of perDay.get(timetableDay(date)) ?? []) out.set(c.code, (out.get(c.code) ?? 0) + 1);
  }
  return out;
}

export interface LeaveOutcome {
  code: string;
  /** classes of this subject while away */
  missed: number;
  now: Projection;
  after: Projection;
  /** classes in a row to attend once back to reach the threshold again; 0 when it stays at or above */
  attendAfter: number;
  /** classes of this subject left after the leave until the semester ends; null when the end is unknown */
  left: number | null;
  /** false when even every class left can't bring it back to the threshold this semester */
  recoverable: boolean;
  /** the highest it can end the semester at, attending every class left; null when the end is unknown */
  best: number | null;
}

export interface LeavePlan {
  /** class days counted (the ones not ticked off as holidays) */
  days: number;
  /** classes missed in all, including subjects with no attendance record */
  missed: number;
  /** subjects with a class while away, lowest figure after the leave first */
  subjects: LeaveOutcome[];
  /** how many of them end below the threshold */
  below: number;
  /** of those, how many can't get back to it before the semester ends */
  stuck: number;
}

/**
 * Where each subject stands after the leave. `off` holds the dates the student
 * ticked off (holidays): their classes are not held, so they are not missed.
 */
export function planLeave(
  subjects: readonly PlanSubject[],
  days: readonly LeaveDay[],
  off: ReadonlySet<string>,
  threshold: number,
  /** classes per subject between the day after the leave and the semester's last day */
  remaining?: ReadonlyMap<string, number> | null,
): LeavePlan {
  const missedBy = new Map<string, number>();
  let counted = 0;
  let missed = 0;
  for (const d of days) {
    if (off.has(d.date)) continue;
    counted++;
    for (const c of d.classes) {
      missed++;
      missedBy.set(c.code, (missedBy.get(c.code) ?? 0) + 1);
    }
  }

  const out: LeaveOutcome[] = [];
  for (const s of subjects) {
    const n = missedBy.get(s.code) ?? 0;
    if (n === 0) continue;
    const after = projectAttendance(s, n, 0, threshold);
    const attendAfter = after.safe ? 0 : -after.margin;
    const left = remaining ? (remaining.get(s.code) ?? 0) : null;
    const best =
      left === null ? null : after.total + left > 0 ? ((after.attended + left) / (after.total + left)) * 100 : 0;
    out.push({
      code: s.code,
      missed: n,
      now: projectAttendance(s, 0, 0, threshold),
      after,
      attendAfter,
      left,
      recoverable: left === null || attendAfter <= left,
      best,
    });
  }
  out.sort((a, b) => a.after.percentage - b.after.percentage || a.code.localeCompare(b.code));

  return {
    days: counted,
    missed,
    subjects: out,
    below: out.filter((o) => !o.after.safe).length,
    stuck: out.filter((o) => !o.recoverable).length,
  };
}
