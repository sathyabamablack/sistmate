import { attendanceStats } from "@usp/core";
import type { AttendanceSubject, CalendarEvent } from "@usp/core";
import { DEFAULT_THRESHOLD } from "./attendance";
import { daysUntil } from "./utils";

/**
 * Dashboard alerts: subjects close to (or under) the attendance threshold, and
 * a countdown to the next exam. Pure functions, no I/O.
 */

/** A subject within this many percentage points above the threshold counts as at risk. */
export const NEAR_MARGIN = 5;

export type RiskLevel = "below" | "near";

export interface AttendanceRisk {
  code: string;
  title: string;
  level: RiskLevel;
  percentage: number;
  attended: number;
  total: number;
  /** One plain sentence saying what to do. */
  action: string;
}

const classes = (n: number) => (n === 1 ? "1 class" : `${n} classes`);

/**
 * Subjects under the threshold, then subjects within `margin` points of it.
 * Lowest percentage first inside each group. Subjects with no hours recorded
 * are never flagged.
 */
export function attendanceRisks(
  subjects: AttendanceSubject[],
  threshold = DEFAULT_THRESHOLD,
  margin = NEAR_MARGIN,
): AttendanceRisk[] {
  const out: AttendanceRisk[] = [];
  for (const s of subjects) {
    if (s.totalClasses <= 0) continue;
    const stats = attendanceStats(s.attended, s.totalClasses, threshold);
    const pct = (s.attended / s.totalClasses) * 100;
    const base = {
      code: s.code,
      title: s.title,
      percentage: pct,
      attended: s.attended,
      total: s.totalClasses,
    };
    if (!stats.safe) {
      out.push({
        ...base,
        level: "below",
        action: `Attend the next ${classes(stats.needed)} in ${s.title} to get back to ${threshold}%`,
      });
    } else if (pct < threshold + margin) {
      out.push({
        ...base,
        level: "near",
        action:
          stats.canSkip === 0
            ? `Missing the next class in ${s.title} takes you below ${threshold}%`
            : `You can miss only ${classes(stats.canSkip)} in ${s.title} before dropping below ${threshold}%`,
      });
    }
  }
  return out.sort(
    (a, b) =>
      (a.level === b.level ? 0 : a.level === "below" ? -1 : 1) || a.percentage - b.percentage,
  );
}

export interface Countdown {
  id: string;
  title: string;
  /** Whole campus days from today; 0 = today. */
  days: number;
  /** "today", "tomorrow", "in 11 days". */
  when: string;
  /** "CIA-2 Examination in 11 days". */
  text: string;
  url?: string;
}

export function whenLabel(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

const hasClockTime = (iso: string) => /T\d{2}:\d{2}/.test(iso);

export interface Countdowns {
  exam: Countdown | null;
}

/**
 * The soonest upcoming exam. Past events and today's events whose time has gone
 * are skipped. Assignment deadlines are deliberately not counted down: students
 * told us they are noise on the dashboard.
 */
export function nextCountdowns(events: CalendarEvent[], now: Date = new Date()): Countdowns {
  const hit = events
    .filter((e) => e.type === "exam")
    .map((e) => ({ e, days: daysUntil(e.date, now) }))
    .filter((x): x is { e: CalendarEvent; days: number } => {
      if (x.days === null || x.days < 0) return false;
      return !(x.days === 0 && hasClockTime(x.e.date) && new Date(x.e.date).getTime() < now.getTime());
    })
    .sort((a, b) => new Date(a.e.date).getTime() - new Date(b.e.date).getTime())[0];
  if (!hit) return { exam: null };
  const when = whenLabel(hit.days);
  return {
    exam: { id: hit.e.id, title: hit.e.title, days: hit.days, when, text: `${hit.e.title} ${when}`, url: hit.e.url },
  };
}
