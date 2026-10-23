/**
 * Official Sathyabama course catalog lookup (Regulations 2019 and 2023).
 *
 * SERVER-SIDE ONLY: this module imports the ~380 KB curriculum catalog. It is not
 * re-exported from the package root; import it as "@usp/core/sathyabama" from server
 * code and hand per-subject facts (credits, maxima) to client components as props.
 */

import catalog from "./sathyabama-catalog.json";
import {
  fallbackCourseInfo,
  normalizeCode,
  resolveCourse,
  type CourseInfo,
  type CourseType,
  type Regulation,
  type ResolvedCourse,
} from "./course-rules";

interface CatalogCourse {
  title: string;
  credits: number;
  type: string;
  subtype?: string;
  maxTotal: number;
  internalMax: number;
  externalMax: number;
  regulation: string;
  source: string;
}

const COURSES = (catalog as unknown as { courses: Record<string, CatalogCourse> }).courses;

/** When the catalog was compiled from the institute's PDFs. */
export const CATALOG_GENERATED_AT: string = (catalog as unknown as { generatedAt: string }).generatedAt;

const COURSE_TYPES: readonly CourseType[] = [
  "theory",
  "practical",
  "integrated",
  "project",
  "noncredit",
  "skillEnhancement",
];

/** The raw catalog entry for a code, or undefined. */
export function catalogCourse(code: string): (CatalogCourse & { code: string }) | undefined {
  const c = normalizeCode(code);
  const entry = COURSES[c];
  return entry ? { ...entry, code: c } : undefined;
}

/**
 * Credits, course type and mark maxima for one course. The catalog wins; codes it does
 * not list fall back to the code-pattern rules (marked `source: "fallback"`). The ERP's
 * "Practical" SubjectType is only consulted by the fallback, never over the catalog.
 */
export function courseInfo(code: string, title?: string, erpSubjectType?: string | null): CourseInfo {
  const entry = catalogCourse(code);
  if (!entry) return fallbackCourseInfo(code, title ?? "", erpSubjectType);
  const type = (COURSE_TYPES as readonly string[]).includes(entry.type)
    ? (entry.type as CourseType)
    : "theory";
  const regulation: Regulation | null =
    entry.regulation === "2019" || entry.regulation === "2023" ? entry.regulation : null;
  return {
    credits: entry.credits,
    type,
    ...(entry.subtype ? { subtype: entry.subtype } : {}),
    maxTotal: entry.maxTotal,
    internalMax: entry.internalMax,
    externalMax: entry.externalMax,
    audit: type === "noncredit" || entry.credits === 0,
    source: "official",
    regulation,
  };
}

/**
 * A resolver for `estimateGrades`: catalog (or fallback) facts with the student's
 * per-code credit corrections applied on top.
 */
export function courseResolver(overrides: Record<string, number> = {}) {
  return (code: string, title: string): ResolvedCourse =>
    resolveCourse(courseInfo(code, title), overrides[code] ?? overrides[normalizeCode(code)]);
}
