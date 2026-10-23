import type { AttendanceSubject, SemesterResult } from "./types";

/**
 * Pure domain calculations shared by UI and adapters. No I/O, fully testable.
 */

/**
 * Minimum attendance percentage the college requires. The single source of truth
 * for every `threshold` default in this package; the web app lets a student
 * override it and passes the override down explicitly.
 */
export const DEFAULT_ATTENDANCE_THRESHOLD = 80;

export interface AttendanceStats {
  percentage: number;
  /** classes you can still miss and stay >= threshold (if currently above it) */
  canSkip: number;
  /** consecutive classes you must attend to reach threshold (if currently below) */
  needed: number;
  safe: boolean;
}

/**
 * The "bunk calculator", in exact integer arithmetic (T = threshold percent):
 * canSkip solves 100·a >= T·(total + x)      =>  x <= (100·a − T·total) / T
 * needed  solves 100·(a + y) >= T·(total + y) =>  y >= (T·total − 100·a) / (100 − T)
 * Float forms like (0.6·7 − 3) / 0.4 land just above an integer and make
 * `ceil` overshoot by one class.
 */
export function attendanceStats(
  attended: number,
  total: number,
  threshold = DEFAULT_ATTENDANCE_THRESHOLD,
): AttendanceStats {
  const percentage = total === 0 ? 100 : (attended / total) * 100;
  const surplus = 100 * attended - threshold * total;
  const safe = surplus >= 0;
  const canSkip = safe ? Math.floor(surplus / threshold) : 0;
  const needed = safe || threshold >= 100 ? 0 : Math.ceil(-surplus / (100 - threshold));
  return { percentage, canSkip, needed, safe };
}

/** GPA for one semester from its graded courses. */
export function computeGpa(
  results: { credits: number; gradePoint: number }[],
): number {
  const totalCredits = results.reduce((s, r) => s + r.credits, 0);
  if (totalCredits === 0) return 0;
  const weighted = results.reduce((s, r) => s + r.credits * r.gradePoint, 0);
  return weighted / totalCredits;
}

/** True when the portal publishes grades/credits (the live ERP only publishes marks). */
export function hasGrades(semesters: SemesterResult[]): boolean {
  return semesters.some((s) => s.gpa != null && (s.credits ?? 0) > 0);
}

export interface CgpaStanding {
  /** Credit-weighted grade point average; 0 when nothing counts. */
  cgpa: number;
  /** Credits that count: passed credit courses only. */
  credits: number;
  /** Sum of credits x grade points. */
  points: number;
}

/**
 * Credits and grade points earned so far. Estimated semesters are summed course by
 * course over the papers marked `counted` (passed, credit-bearing, not audit), so a
 * failed paper never counts and a course cleared later counts once, with the latest
 * passing attempt. Semesters with published grades contribute their own GPA x credits.
 */
export function cgpaStanding(semesters: SemesterResult[]): CgpaStanding {
  const ordered = [...semesters].sort((a, b) => a.semester - b.semester);
  const courses = new Map<string, { credits: number; points: number }>();
  let credits = 0;
  let points = 0;
  for (const sem of ordered) {
    const perCourse = sem.estimated === true && sem.results.some((r) => r.counted !== undefined);
    if (perCourse) {
      for (const r of sem.results) {
        if (r.counted !== true || r.credits == null || r.gradePoint == null) continue;
        courses.set(r.code, { credits: r.credits, points: r.gradePoint });
      }
    } else if (sem.gpa != null && (sem.credits ?? 0) > 0) {
      credits += sem.credits ?? 0;
      points += sem.gpa * (sem.credits ?? 0);
    }
  }
  for (const c of courses.values()) {
    credits += c.credits;
    points += c.credits * c.points;
  }
  return { cgpa: credits > 0 ? points / credits : 0, credits, points };
}

/**
 * CGPA across semesters, credit-weighted over passed credit courses only. Semesters
 * without grades are ignored.
 */
export function computeCgpa(semesters: SemesterResult[]): number {
  return cgpaStanding(semesters).cgpa;
}

/**
 * What-if: given existing semesters and a target CGPA, what GPA is needed next
 * semester (of `nextCredits` credits) to reach the target?
 */
export function gpaNeededForTarget(
  semesters: SemesterResult[],
  targetCgpa: number,
  nextCredits: number,
): number {
  if (nextCredits <= 0) return 0;
  const { credits, points } = cgpaStanding(semesters);
  return (targetCgpa * (credits + nextCredits) - points) / nextCredits;
}

export const overallAttendance = (
  subjects: AttendanceSubject[],
  threshold = DEFAULT_ATTENDANCE_THRESHOLD,
): AttendanceStats => {
  const attended = subjects.reduce((s, x) => s + x.attended, 0);
  const total = subjects.reduce((s, x) => s + x.totalClasses, 0);
  return attendanceStats(attended, total, threshold);
};
