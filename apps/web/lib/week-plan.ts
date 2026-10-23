import { assignCategories } from "./week";
import type { TimetableSlot } from "@usp/core";
import { timeToMinutes } from "./utils";

/**
 * Turns the timetable into the classes a student can still choose to skip this
 * week. Pure; the clock is passed in so the server and tests agree.
 */

export interface PlanSlot {
  /** unique within the plan */
  id: string;
  /** 0 = Monday */
  day: number;
  start: string;
  end: string;
  code: string;
  title: string;
  /** 0-based categorical colour slot, same as the timetable page */
  cat: number;
  /** false for classes that have already started today */
  upcoming: boolean;
}

export interface WeekPlan {
  slots: PlanSlot[];
  /** days that have classes, in order */
  days: number[];
  /** true when this week is over and the plan shows the coming one */
  nextWeek: boolean;
}

export function buildWeekPlan(
  timetable: TimetableSlot[],
  clock: { dayIndex: number; minutes: number },
): WeekPlan {
  const cats = assignCategories([...new Set(timetable.map((s) => s.courseCode))]);
  const sorted = [...timetable].sort(
    (a, b) => a.day - b.day || timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
  );

  const seen = new Map<string, number>();
  const slots: PlanSlot[] = sorted.map((s) => {
    const base = `${s.day}-${s.startTime}-${s.courseCode}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const started =
      s.day < clock.dayIndex ||
      (s.day === clock.dayIndex && timeToMinutes(s.startTime) <= clock.minutes);
    return {
      id: n === 1 ? base : `${base}-${n}`,
      day: s.day,
      start: s.startTime,
      end: s.endTime,
      code: s.courseCode,
      title: s.courseTitle,
      cat: cats.get(s.courseCode) ?? 0,
      upcoming: !started,
    };
  });

  const nextWeek = slots.length > 0 && !slots.some((s) => s.upcoming);
  const out = nextWeek ? slots.map((s) => ({ ...s, upcoming: true })) : slots;
  const days = [...new Set(out.map((s) => s.day))];
  return { slots: out, days, nextWeek };
}

/** Hours of upcoming classes per subject code. */
export function upcomingHours(slots: PlanSlot[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of slots) if (s.upcoming) out.set(s.code, (out.get(s.code) ?? 0) + 1);
  return out;
}
