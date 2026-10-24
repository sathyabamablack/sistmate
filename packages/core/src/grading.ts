/**
 * Marks and grade planning. Pure functions, no I/O.
 *
 * The ERP publishes marks only (no grades or credits). Grades follow the official
 * Sathyabama rules (see ./course-rules and docs/SATHYABAMA-GRADING.md): each course's
 * total as a percentage of its maximum, the 50% total + 30% exam pass rule, and
 * credit-weighted GPA over passed credit courses only.
 */

import type { ExamResult, SemesterResult } from "./types";
import {
  fallbackCourseInfo,
  passes,
  percentOf,
  resolveCourse,
  type ResolvedCourse,
} from "./course-rules";

export interface InternalSettings {
  /** Weight applied to the sum of the CAE tests (0.3 means 30%). */
  caeWeight: number;
  /** Highest internal mark a subject can carry. */
  internalMax: number;
}

export const DEFAULT_INTERNAL_SETTINGS: InternalSettings = { caeWeight: 0.3, internalMax: 50 };

/** Default marks for assignment + attendance, which the student can change per subject. */
export const DEFAULT_ASSIGNMENT_ATTENDANCE = 20;

/** Highest mark the semester exam carries. */
export const DEFAULT_EXTERNAL_MAX = 50;

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Internal = (CAE 1 + CAE 2) × weight + assignment/attendance, capped at the
 * internal maximum. A missing CAE counts as 0 so partial data still plans.
 */
export function internalMarks(
  cae1: number | null,
  cae2: number | null,
  assignmentAttendance: number,
  settings: InternalSettings = DEFAULT_INTERNAL_SETTINGS,
): number {
  const raw = ((cae1 ?? 0) + (cae2 ?? 0)) * settings.caeWeight + assignmentAttendance;
  // Marks are whole numbers on the ERP and mark sheets, so round to the nearest mark.
  return Math.round(clamp(raw, 0, settings.internalMax));
}

export interface GradeBand {
  /** Lowest total, as a percentage of the course maximum, that earns this grade. */
  min: number;
  grade: string;
  points: number;
}

/**
 * The official Sathyabama grade scale (Regulations 2019 cl. 16 and 2023 cl. 24), on the
 * course total as a percentage of its maximum, listed highest first. RA = reappear.
 */
export const SATHYABAMA_GRADE_SCALE: GradeBand[] = [
  { min: 90, grade: "A++", points: 10 },
  { min: 80, grade: "A+", points: 9 },
  { min: 70, grade: "B++", points: 8 },
  { min: 60, grade: "B+", points: 7 },
  { min: 50, grade: "C", points: 6 },
  { min: 0, grade: "RA", points: 0 },
];

/** The default everywhere: the official scale. */
export const DEFAULT_GRADE_SCALE: GradeBand[] = SATHYABAMA_GRADE_SCALE;

/**
 * The scale this app assumed before the official rules were researched. Kept only so
 * planner states saved with it are recognised as "not edited" and move to the official one.
 */
export const LEGACY_GRADE_SCALE: GradeBand[] = [
  { min: 90, grade: "S", points: 10 },
  { min: 80, grade: "A", points: 9 },
  { min: 70, grade: "B", points: 8 },
  { min: 60, grade: "C", points: 7 },
  { min: 55, grade: "D", points: 6 },
  { min: 50, grade: "E", points: 5 },
  { min: 0, grade: "U", points: 0 },
];

/** Grades that score nothing and are left out of GPA: reappear, absent, withdrawn, break of study. */
export const NON_COUNTING_GRADES = new Set(["RA", "AAA", "W", "ABS"]);

/** Bands sorted highest first, so callers can pass them in any order. */
export function sortScale(scale: GradeBand[]): GradeBand[] {
  return [...scale].sort((a, b) => b.min - a.min);
}

export function gradeFor(total: number, scale: GradeBand[] = DEFAULT_GRADE_SCALE): GradeBand {
  const sorted = sortScale(scale);
  return sorted.find((b) => total >= b.min) ?? sorted[sorted.length - 1]!;
}

/**
 * Grade for a percentage of the course maximum. Bands are whole numbers and a
 * fractional percent is never rounded up: 89.5 is A+, not A++ (documented assumption).
 */
export function gradeForPercent(percent: number, scale: GradeBand[] = SATHYABAMA_GRADE_SCALE): GradeBand {
  return gradeFor(percent, scale);
}

/** The lowest band that still scores points (C on the official scale). */
export function lowestPassingBand(scale: GradeBand[] = SATHYABAMA_GRADE_SCALE): GradeBand {
  const passing = sortScale(scale).filter((b) => b.points > 0);
  return passing[passing.length - 1] ?? sortScale(scale)[0]!;
}

/** The failing band (RA on the official scale): the lowest one. */
export function failingBand(scale: GradeBand[] = SATHYABAMA_GRADE_SCALE): GradeBand {
  const sorted = sortScale(scale);
  return sorted[sorted.length - 1]!;
}

export interface RequiredExternal {
  /** External marks needed for the target (never below 0). */
  needed: number;
  /** False when even a full-marks external falls short. */
  reachable: boolean;
  /** True when the internal marks alone already reach the target. */
  secured: boolean;
}

export function requiredExternal(
  internal: number,
  targetTotal: number,
  externalMax: number = DEFAULT_EXTERNAL_MAX,
): RequiredExternal {
  const gap = targetTotal - internal;
  const needed = Math.max(0, Math.ceil(gap - 1e-9));
  return { needed, reachable: needed <= externalMax, secured: gap <= 0 };
}

export interface CreditPoints {
  credits: number;
  points: number;
}

/** Credit-weighted grade point average for one semester. 0 when nothing counts. */
export function semesterGpa(courses: CreditPoints[]): number {
  const credits = courses.reduce((s, c) => s + c.credits, 0);
  if (credits <= 0) return 0;
  return round2(courses.reduce((s, c) => s + c.credits * c.points, 0) / credits);
}

export interface CgpaState {
  cgpa: number;
  credits: number;
}

/** CGPA after adding this semester to what the student already has. */
export function projectedCgpa(previous: CgpaState | null, semester: CgpaState): number {
  const prevCredits = previous?.credits ?? 0;
  const totalCredits = prevCredits + semester.credits;
  if (totalCredits <= 0) return 0;
  const points = (previous?.cgpa ?? 0) * prevCredits + semester.cgpa * semester.credits;
  return round2(points / totalCredits);
}


/**
 * Credits assumed when nothing better is known: the fallback code-pattern rules
 * (theory 3, 2-credit lab 2, one-credit lab 1, LH 4...). Prefer `courseInfo` from
 * "@usp/core/sathyabama" on the server, which uses the official catalog first.
 */
export function defaultCredits(code: string, title: string): number {
  return fallbackCourseInfo(code, title).credits;
}

/**
 * What `estimateGrades` needs per course. Returning a plain number is the legacy form
 * (credits only; maxima then come from the fallback rules).
 */
export type CourseResolver = (code: string, title: string) => number | ResolvedCourse;

const fallbackResolver: CourseResolver = (code, title) => resolveCourse(fallbackCourseInfo(code, title));

function resolveWith(resolve: CourseResolver, code: string, title: string): ResolvedCourse {
  const r = resolve(code, title);
  if (typeof r !== "number") return r;
  return { ...resolveCourse(fallbackCourseInfo(code, title)), credits: r, creditSource: "estimated" };
}

/**
 * A fallback guess whose maxima the marks disprove (a "50-mark lab" scoring 76) was
 * wrong: use the common 50 + 50 = 100 scheme instead. Catalog maxima are kept.
 */
function fitMaxima(course: ResolvedCourse, r: ExamResult): ResolvedCourse {
  if (course.source === "official") return course;
  const over =
    (r.total ?? 0) > course.maxTotal ||
    (r.internal ?? 0) > course.internalMax ||
    (r.external ?? 0) > course.externalMax;
  if (!over || course.audit) return course;
  const credits =
    course.creditSource !== "custom" && course.type === "practical" && course.credits === 1 ? 2 : course.credits;
  return { ...course, credits, maxTotal: 100, internalMax: 50, externalMax: 50 };
}

/** One paper graded by the official rules. Papers with no total keep their marks and get no grade. */
function gradeResult(r: ExamResult, resolve: CourseResolver, scale: GradeBand[]): ExamResult {
  const course = fitMaxima(resolveWith(resolve, r.code, r.title), r);
  const meta = {
    credits: course.credits,
    maxTotal: course.maxTotal,
    internalMax: course.internalMax,
    externalMax: course.externalMax,
    creditSource: course.creditSource,
    ...(course.audit ? { audit: true } : {}),
  };

  // Absent / withdrawn / break of study: published as such, 0 points, not in GPA.
  const published = r.grade?.trim().toUpperCase();
  if (published && NON_COUNTING_GRADES.has(published) && published !== "RA") {
    return { ...r, ...meta, grade: published, gradePoint: 0, counted: false, passed: false };
  }
  if (r.total == null) return { ...r, ...meta, counted: false };

  const percent = percentOf(r.total, course.maxTotal);
  // The ERP's own Pass/Fail is the official outcome; the rule decides only when it is missing.
  const passed = r.passed ?? passes(r.total, r.external, course);

  if (course.audit) {
    return {
      ...r,
      ...meta,
      percent: round2(percent),
      grade: passed ? "PASS" : "FAIL",
      counted: false,
      passed,
    };
  }

  let band = passed ? gradeForPercent(percent, scale) : failingBand(scale);
  // The ERP says pass but the percent is under 50: our maxima must be off, so give the lowest pass.
  if (passed && band.points <= 0) band = lowestPassingBand(scale);
  return {
    ...r,
    ...meta,
    percent: round2(percent),
    grade: band.grade,
    gradePoint: band.points,
    counted: passed && course.credits > 0,
    passed,
  };
}

/**
 * The live ERP publishes marks and pass/fail but no grades, credits or GPA. This derives
 * them by the official rules: each paper's total as a percentage of its course maximum
 * maps to a band on `scale`; a paper failing the 50% total or the 30% exam minimum (or
 * marked Fail by the ERP) is RA; credits come from `resolve` (catalog, fallback or the
 * student's correction). Semester GPA and credits cover passed credit courses only:
 * RA/AAA/W/ABS and audit courses are left out of both sides. Semesters that already carry
 * published grades are returned as-is.
 */
export function estimateGrades(
  semesters: SemesterResult[],
  resolve: CourseResolver = fallbackResolver,
  scale: GradeBand[] = SATHYABAMA_GRADE_SCALE,
): SemesterResult[] {
  return semesters.map((sem) => {
    if (sem.gpa != null) return sem;
    const results = sem.results.map((r) => gradeResult(r, resolve, scale));
    if (!results.some((r) => r.grade !== undefined)) return { ...sem, results };
    const counted = results.filter(
      (r): r is ExamResult & { credits: number; gradePoint: number } =>
        r.counted === true && r.credits !== undefined && r.gradePoint !== undefined,
    );
    const credits = counted.reduce((sum, r) => sum + r.credits, 0);
    return {
      ...sem,
      results,
      gpa: credits > 0 ? semesterGpa(counted.map((r) => ({ credits: r.credits, points: r.gradePoint }))) : null,
      credits,
      estimated: true,
    };
  });
}
