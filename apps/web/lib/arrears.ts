import {
  DEFAULT_EXTERNAL_MAX,
  externalMinimum,
  passTotal,
  type ExamResult,
  type SemesterResult,
} from "@usp/core";

/**
 * Arrears: papers the student failed and has not yet cleared.
 *
 * Works on `data.results`, so it covers published grades (grade-based portals) and
 * marks-only results (live ERP, with grades estimated by the official rules). A paper
 * is identified by its code. Attempts are ordered by semester, then by position in
 * the list; the paper is an arrear only if its latest attempt with a known outcome is
 * a fail. A later pass clears it.
 *
 * The marks a re-exam needs follow the official pass rule (Regulations 2019 cl. 15,
 * 2023 cl. 22.1): 50% of the course total and 30% of the end-semester maximum, with
 * the internal marks of the first attempt carried over.
 */

/** Highest mark the semester exam carries when the paper's own maximum is unknown. */
export const EXTERNAL_MAX = DEFAULT_EXTERNAL_MAX;

/** Letter grades that mean "not passed". */
const FAIL_GRADES = new Set(["U", "RA", "F", "FAIL", "AAA", "W", "ABS"]);

export type AttemptOutcome = "passed" | "failed" | "unknown";

/** Outcome of one result row: the ERP's own `passed` flag wins, then the grade. */
export function attemptOutcome(r: ExamResult): AttemptOutcome {
  if (r.passed === false) return "failed";
  if (r.passed === true) return "passed";
  const grade = r.grade?.trim().toUpperCase();
  if (grade) {
    if (FAIL_GRADES.has(grade)) return "failed";
    if (r.gradePoint === 0) return "failed";
    return "passed";
  }
  return "unknown";
}

export interface Arrear {
  code: string;
  title: string;
  /** Semester of the latest failed attempt. */
  semester: number;
  /** How many attempts failed so far. */
  failedAttempts: number;
  /** Internal marks of the latest failed attempt, when the ERP published them. */
  internal: number | null;
  /** Total marks of the latest failed attempt, when known. */
  lastTotal: number | null;
  /** The course maximum (100, or 50 for a one-credit lab). */
  maxTotal: number;
  /** End-semester exam maximum; 0 for an audit course. */
  externalMax: number;
  /** Total needed to pass: 50% of `maxTotal`. */
  passTotal: number;
  /** Whole exam marks needed to meet the 30% exam minimum. */
  externalMin: number;
  /** Exam marks needed to pass: the larger of the exam minimum and what the total needs. Null when internal marks are unknown. */
  externalNeeded: number | null;
  /** True when even full marks in the exam would not be enough. */
  outOfReach: boolean;
  /** Zero-credit audit course, cleared through internal assessment, not an exam. */
  audit: boolean;
}

interface Attempt {
  semester: number;
  order: number;
  result: ExamResult;
  outcome: AttemptOutcome;
}

/** Marks are whole numbers, so a fractional requirement rounds up. */
const ceilMark = (n: number) => Math.max(0, Math.ceil(n - 1e-9));

export function computeArrears(semesters: SemesterResult[]): Arrear[] {
  const byCode = new Map<string, Attempt[]>();
  let order = 0;
  for (const sem of semesters) {
    for (const result of sem.results) {
      const outcome = attemptOutcome(result);
      if (outcome === "unknown") {
        order++;
        continue;
      }
      const list = byCode.get(result.code) ?? [];
      list.push({ semester: sem.semester, order: order++, result, outcome });
      byCode.set(result.code, list);
    }
  }

  const out: Arrear[] = [];
  for (const attempts of byCode.values()) {
    attempts.sort((a, b) => a.semester - b.semester || a.order - b.order);
    const latest = attempts[attempts.length - 1]!;
    if (latest.outcome !== "failed") continue;
    const failed = attempts.filter((a) => a.outcome === "failed");
    const r = latest.result;
    const externalMax = r.externalMax ?? EXTERNAL_MAX;
    const maxTotal = r.maxTotal ?? (r.internalMax ?? 50) + externalMax;
    const audit = r.audit === true || externalMax <= 0;
    const course = { maxTotal, externalMax };
    const total = passTotal(course);
    const externalMin = ceilMark(externalMinimum(course));
    const internal = r.internal ?? null;
    const needed =
      internal == null || audit ? null : Math.max(externalMin, ceilMark(total - internal));
    out.push({
      code: r.code,
      title: r.title,
      semester: latest.semester,
      failedAttempts: failed.length,
      internal,
      lastTotal: r.total ?? null,
      maxTotal,
      externalMax,
      passTotal: total,
      externalMin,
      externalNeeded: needed,
      outOfReach: needed != null && needed > externalMax,
      audit,
    });
  }
  return out.sort((a, b) => a.semester - b.semester || a.code.localeCompare(b.code));
}

/** "1 paper to clear", "2 papers to clear". */
export function arrearsLabel(count: number): string {
  return `${count} ${count === 1 ? "paper" : "papers"} to clear`;
}
