/**
 * Sathyabama course rules that need no catalog: the grade scale, the pass rule and
 * the fallback used for course codes the official catalog does not list. Pure and
 * small, so it is safe in client bundles. The catalog lookup itself lives in
 * `./sathyabama` (server-only, it carries ~380 KB of curriculum data).
 *
 * Sources: Academic Regulations 2023 cl. 22.1 and 24, Regulations 2019 cl. 15 and 16.
 * See docs/SATHYABAMA-GRADING.md.
 */

export type CourseType =
  | "theory"
  | "practical"
  | "integrated"
  | "project"
  | "noncredit"
  | "skillEnhancement";

/** Where a course's credits and maxima came from. */
export type CourseSource = "official" | "fallback";

/** How a result's credits were decided: the curriculum, a code-pattern guess, or the student. */
export type CreditSource = "official" | "estimated" | "custom";

export type Regulation = "2019" | "2023";

export interface CourseInfo {
  /** Credits from the curriculum (or the fallback guess). 0 for audit courses. */
  credits: number;
  type: CourseType;
  /** Finer kind from the catalog: "lab", "practical-heavy", "project-based-learning"... */
  subtype?: string;
  /** Course maximum: 100 for most courses, 50 for one-credit labs and audit courses. */
  maxTotal: number;
  internalMax: number;
  /** End-semester exam maximum; 0 when there is no exam (audit courses). */
  externalMax: number;
  /** Zero-credit mandatory course: PASS/FAIL, never in GPA. */
  audit: boolean;
  source: CourseSource;
  regulation: Regulation | null;
}

/** A course with the credits actually used (the student's correction wins). */
export interface ResolvedCourse extends CourseInfo {
  creditSource: CreditSource;
}

/** Total needed to pass, as a percentage of the course maximum. */
export const PASS_PERCENT = 50;
/** End-semester minimum, as a percentage of the exam maximum. */
export const EXTERNAL_MIN_PERCENT = 30;

const EPS = 1e-9;

/** Percentage of the course maximum, capped at 100. */
export function percentOf(total: number, maxTotal: number): number {
  if (!(maxTotal > 0)) return 0;
  return Math.min(100, Math.max(0, (total / maxTotal) * 100));
}

/** The end-semester minimum: 30% of the exam maximum (15 of 50, 7.5 of 25). */
export function externalMinimum(info: Pick<CourseInfo, "externalMax">): number {
  return (info.externalMax * EXTERNAL_MIN_PERCENT) / 100;
}

/** Total needed to pass: 50% of the course maximum (50 of 100, 25 of 50). */
export function passTotal(info: Pick<CourseInfo, "maxTotal">): number {
  return (info.maxTotal * PASS_PERCENT) / 100;
}

/**
 * The official pass rule: at least 50% of the course total AND at least 30% of the
 * end-semester maximum. Courses without an exam (externalMax 0) only need the total.
 * When the external mark is unknown only the total can be checked.
 */
export function passes(
  total: number,
  external: number | null | undefined,
  info: Pick<CourseInfo, "maxTotal" | "externalMax">,
): boolean {
  if (total + EPS < passTotal(info)) return false;
  if (info.externalMax <= 0 || external == null) return true;
  return external + EPS >= externalMinimum(info);
}

/** Regulation from the letter after the programme code: A = 2019, B = 2023. */
export function regulationFromCode(code: string): Regulation | null {
  const m = /^S(?:[A-Z]{2}|\d{2,3})([AB])/.exec(normalizeCode(code));
  if (!m) return null;
  return m[1] === "A" ? "2019" : "2023";
}

/** "scsb 1303 " -> "SCSB1303". */
export function normalizeCode(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

const ONE_CREDIT_LAB = /physics\s+lab|chemistry\s+lab|code\s+optimi[sz]ation|business\s+communication/i;
const LAB_TITLE = /\blab(oratory)?\b/i;
const AUDIT_TITLE = /\(mandatory\)|\baudit\s+course\b|\bnon[- ]?credit\b/i;

function info(
  type: CourseType,
  credits: number,
  maxTotal: number,
  internalMax: number,
  externalMax: number,
  regulation: Regulation | null,
  subtype?: string,
): CourseInfo {
  return {
    credits,
    type,
    ...(subtype ? { subtype } : {}),
    maxTotal,
    internalMax,
    externalMax,
    audit: type === "noncredit" || credits === 0,
    source: "fallback",
    regulation,
  };
}

/**
 * Best guess for a code the catalog does not list (docs/SATHYABAMA-GRADING.md section 7).
 * Order: audit codes, LH (practical-heavy, 4 cr), PB (project-based, 3 cr), project and
 * training codes, labs (by title, or the 2xxx / M.E. 6xxx pattern, or an ERP "Practical"
 * with no other marker), else theory (3 cr). The ERP's "Practical" label alone never
 * overrides a code marker: it also tags LH and Theory+Project courses.
 */
export function fallbackCourseInfo(
  code: string,
  title = "",
  erpSubjectType?: string | null,
): CourseInfo {
  const c = normalizeCode(code);
  const reg = regulationFromCode(c);

  if (/^SISB415/.test(c) || c === "SBTA1101" || AUDIT_TITLE.test(title)) {
    return info("noncredit", 0, 50, 50, 0, reg, "mandatory-audit");
  }
  if (/LH\d/.test(c)) return info("integrated", 4, 100, 50, 50, reg, "practical-heavy");
  if (/PB\d/.test(c)) return info("integrated", 3, 100, 50, 50, reg, "project-based-learning");
  if (/PROJ1$/.test(c)) return info("project", 3, 100, 50, 50, reg, "project");
  if (/PROJ2$/.test(c)) return info("project", 7, 100, 50, 50, reg, "project");
  const training2023 = reg === "2023";
  if (/PT1$/.test(c)) {
    return training2023
      ? info("project", 2, 100, 0, 100, reg, "professional-training")
      : info("project", 2, 100, 50, 50, reg, "professional-training");
  }
  if (/(PT2|IPROJ|CPROJ)$/.test(c)) {
    return training2023
      ? info("project", 3, 100, 0, 100, reg, "professional-training")
      : info("project", 3, 100, 50, 50, reg, "professional-training");
  }
  if (/skill\s+enhancement/i.test(title)) return info("skillEnhancement", 1, 100, 0, 100, reg);

  const labByCode = /^S[A-Z]{2}[AB][26]\d{3}$/.test(c);
  const labByErp = (erpSubjectType ?? "").trim().toLowerCase().startsWith("practical");
  if (LAB_TITLE.test(title) || /\bLAB\b/.test(c) || labByCode || labByErp) {
    return ONE_CREDIT_LAB.test(title)
      ? info("practical", 1, 50, 25, 25, reg, "lab")
      : info("practical", 2, 100, 50, 50, reg, "lab");
  }
  return info("theory", 3, 100, 50, 50, reg, "theory");
}

/**
 * Apply the student's credit correction, if any, and label where the credits came from.
 * Giving an audit course credits makes it count like any other course.
 */
export function resolveCourse(course: CourseInfo, override?: number | null): ResolvedCourse {
  if (override != null && Number.isFinite(override) && override >= 0) {
    return { ...course, credits: override, audit: override > 0 ? false : course.audit, creditSource: "custom" };
  }
  return { ...course, creditSource: course.source === "official" ? "official" : "estimated" };
}
