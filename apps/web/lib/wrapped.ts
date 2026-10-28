import {
  computeCgpa,
  hasGrades,
  overallAttendance,
  percentOf,
  type AttendanceSubject,
  type ExamResult,
  type SemesterResult,
} from "@usp/core";
import { attemptOutcome, standingArrearsCount } from "./arrears";
import { DEFAULT_THRESHOLD } from "./attendance";

/**
 * "Semester wrapped": a short, shareable recap of the latest semester's results.
 *
 * Pure: it reads the same `data.results` the Results page does (grades published by a
 * grade-based portal, or estimated from ERP marks by the official rules in lib/data.ts) and
 * picks semesters, CGPA and credits exactly as app/(app)/results/page.tsx and GradedResults
 * do, so the numbers here always match that page. Attendance is the current semester only.
 */

/** Grade points at or above this are a "top grade": A++ and A+ on the official scale (O and A+ on a 10-point published one). */
export const TOP_GRADE_POINTS = 9;

/** Grades on zero-credit audit courses: pass or fail, never a band. */
const AUDIT_GRADES = new Set(["PASS", "FAIL"]);

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface WrappedPaper {
  code: string;
  title: string;
  grade: string | null;
  gradePoint: number | null;
  /** Total marks, when the portal published them. */
  total: number | null;
  /** Course maximum the total is out of (100, or 50 for a one-credit lab). */
  maxTotal: number | null;
  /** Total as a percentage of the course maximum, 2 decimals. */
  percent: number | null;
}

export interface WrappedAttendanceSubject {
  code: string;
  title: string;
  percentage: number;
}

export interface Wrapped {
  /** The semester being wrapped: the latest one with results. */
  semester: number;
  /** True when there are grades and a GPA (published or estimated), not just marks. */
  graded: boolean;
  /** Grades, GPA and CGPA were worked out from marks rather than published. */
  estimated: boolean;
  /** GPA of the wrapped semester; null when it has none (marks only, or every paper to reappear). */
  gpa: number | null;
  /** The semester before it that has a GPA, for the change. */
  previous: { semester: number; gpa: number } | null;
  /** gpa minus the previous GPA, each rounded to 2 decimals first so it matches what is shown. */
  gpaDelta: number | null;
  /** CGPA over every semester so far; null without grades. */
  cgpa: number | null;
  /** Semesters with a GPA so far, the wrapped one included. */
  semesterCount: number;
  /** GPA of every semester up to the wrapped one, oldest first. */
  history: { semester: number; gpa: number }[];
  /** Credits earned in the wrapped semester, and in total (as the Results page adds them up). */
  credits: { semester: number | null; total: number | null };
  /** Every graded paper of the semester (audit courses left out), best first. */
  papers: WrappedPaper[];
  /** The best paper, or every paper tied for best. Empty when nothing was scored. */
  best: WrappedPaper[];
  /** Papers at a top grade (see TOP_GRADE_POINTS), grouped by grade, highest first. Null without grades. */
  topGrades: { count: number; outOf: number; byGrade: { grade: string; count: number }[] } | null;
  arrears: {
    /** Papers still to clear; null when nothing says (no pass/fail published, no profile figure). */
    standing: number | null;
    /** Papers failed earlier and passed in the wrapped semester. */
    clearedThisSemester: { code: string; title: string }[];
    /** Every paper ever failed and since passed. */
    clearedTotal: number;
  };
  /** Attendance of the current semester so far; null when no classes are recorded. */
  attendance: {
    semester: number | null;
    percentage: number;
    /** Highest-percentage subject; the one with more classes attended wins a tie. */
    best: WrappedAttendanceSubject | null;
    subjects: number;
    /** The student's attendance threshold (Settings), marked on the ring. */
    threshold: number;
  } | null;
}

export interface WrappedInput {
  results: SemesterResult[];
  attendance: AttendanceSubject[];
  /** The student's current semester (profile), for the attendance label. */
  currentSemester?: number | null;
  /** Standing arrears the ERP profile reports, when it does. */
  profileArrears?: number;
  /** The student's attendance threshold; the default when absent. */
  threshold?: number;
}

/** Total as a percentage of the course maximum, when it can be known. */
export function paperPercent(r: ExamResult): number | null {
  if (r.percent != null) return round2(r.percent);
  if (r.total != null && r.maxTotal != null && r.maxTotal > 0) return round2(percentOf(r.total, r.maxTotal));
  return null;
}

/** True for a semester with anything scored: a GPA, a grade or a total. */
function hasScores(s: SemesterResult): boolean {
  return s.gpa != null || s.results.some((r) => r.grade != null || r.total != null);
}

function toPaper(r: ExamResult): WrappedPaper {
  return {
    code: r.code,
    title: r.title,
    grade: r.grade ?? null,
    gradePoint: r.gradePoint ?? null,
    total: r.total ?? null,
    maxTotal: r.maxTotal ?? null,
    percent: paperPercent(r),
  };
}

/** Highest grade point first, then highest percentage; papers missing both sort last. */
function compareBest(a: WrappedPaper, b: WrappedPaper): number {
  return (b.gradePoint ?? -1) - (a.gradePoint ?? -1) || (b.percent ?? -1) - (a.percent ?? -1);
}

/**
 * The best paper of a semester: highest grade, then highest marks as a percentage of the
 * course maximum. Every paper equal on both is returned (a tie), in the semester's order.
 * Failed and audit papers never count.
 */
export function bestPapers(papers: WrappedPaper[]): WrappedPaper[] {
  const ranked = papers.filter((p) => p.gradePoint != null || p.percent != null).sort(compareBest);
  const top = ranked[0];
  if (!top) return [];
  return ranked.filter((p) => compareBest(p, top) === 0);
}

/** Papers failed in an earlier attempt whose latest attempt passed, with the semester they were cleared in. */
export function clearedArrears(
  semesters: SemesterResult[],
): { code: string; title: string; semester: number }[] {
  const byCode = new Map<string, { semester: number; title: string; outcome: "passed" | "failed" }[]>();
  for (const sem of [...semesters].sort((a, b) => a.semester - b.semester)) {
    for (const r of sem.results) {
      const outcome = attemptOutcome(r);
      if (outcome === "unknown") continue;
      const list = byCode.get(r.code) ?? [];
      list.push({ semester: sem.semester, title: r.title, outcome });
      byCode.set(r.code, list);
    }
  }
  const out: { code: string; title: string; semester: number }[] = [];
  for (const [code, attempts] of byCode) {
    const latest = attempts[attempts.length - 1]!;
    if (latest.outcome === "passed" && attempts.some((a) => a.outcome === "failed")) {
      out.push({ code, title: latest.title, semester: latest.semester });
    }
  }
  return out;
}

/** Everything the slides and the share image show, or null when there are no results to wrap. */
export function buildWrapped(input: WrappedInput): Wrapped | null {
  const semesters = [...input.results].sort((a, b) => a.semester - b.semester);
  const graded = hasGrades(semesters);
  const estimated = graded && semesters.some((s) => s.estimated === true);
  // The Results page's own choice of semesters: in estimated mode, the ones with scored papers.
  const shown = estimated ? semesters.filter((s) => s.gpa != null || s.estimated === true) : semesters;
  const scored = shown.filter(hasScores);
  const latest = scored[scored.length - 1];
  if (!latest) return null;

  const gpa = latest.gpa != null ? round2(latest.gpa) : null;
  const before = scored.filter((s) => s.semester < latest.semester && s.gpa != null);
  const prev = before[before.length - 1];
  const previous = prev ? { semester: prev.semester, gpa: round2(prev.gpa!) } : null;
  const gpaDelta = gpa != null && previous ? round2(gpa - previous.gpa) : null;

  const gradedResults = latest.results.filter(
    (r) =>
      r.audit !== true &&
      !AUDIT_GRADES.has((r.grade ?? "").toUpperCase()) &&
      (r.grade != null || r.total != null),
  );
  const papers = gradedResults.map(toPaper).sort(compareBest);
  // A failed paper is never the best one, whatever its marks.
  const best = bestPapers(
    gradedResults.filter((r) => attemptOutcome(r) !== "failed").map(toPaper),
  );

  let topGrades: Wrapped["topGrades"] = null;
  if (graded) {
    const withGrade = papers.filter((p) => p.grade != null && p.gradePoint != null);
    const top = withGrade.filter((p) => p.gradePoint! >= TOP_GRADE_POINTS);
    const groups = new Map<string, { grade: string; count: number; points: number }>();
    for (const p of top) {
      const g = groups.get(p.grade!) ?? { grade: p.grade!, count: 0, points: p.gradePoint! };
      g.count++;
      groups.set(p.grade!, g);
    }
    topGrades = {
      count: top.length,
      outOf: withGrade.length,
      byGrade: [...groups.values()]
        .sort((a, b) => b.points - a.points)
        .map(({ grade, count }) => ({ grade, count })),
    };
  }

  const cleared = clearedArrears(semesters);
  const standing = standingArrearsCount(semesters, input.profileArrears);

  const subjects = input.attendance.filter((a) => a.totalClasses > 0);
  let attendance: Wrapped["attendance"] = null;
  if (subjects.length > 0) {
    const bestSubject = [...subjects].sort(
      (a, b) => b.percentage - a.percentage || b.attended - a.attended,
    )[0]!;
    attendance = {
      semester: input.currentSemester ?? null,
      percentage: overallAttendance(subjects).percentage,
      best: { code: bestSubject.code, title: bestSubject.title, percentage: bestSubject.percentage },
      subjects: subjects.length,
      threshold: input.threshold ?? DEFAULT_THRESHOLD,
    };
  }

  return {
    semester: latest.semester,
    graded,
    estimated,
    gpa,
    previous,
    gpaDelta,
    cgpa: graded ? round2(computeCgpa(shown)) : null,
    semesterCount: scored.filter((s) => s.gpa != null).length,
    history: scored.filter((s) => s.gpa != null).map((s) => ({ semester: s.semester, gpa: round2(s.gpa!) })),
    credits: {
      semester: graded ? latest.credits : null,
      total: graded ? shown.reduce((sum, s) => sum + (s.credits ?? 0), 0) : null,
    },
    papers,
    best,
    topGrades,
    arrears: {
      standing: standing ?? null,
      clearedThisSemester: cleared
        .filter((c) => c.semester === latest.semester)
        .map(({ code, title }) => ({ code, title })),
      clearedTotal: cleared.length,
    },
    attendance,
  };
}

/* ------------------------------ slides ------------------------------ */

export type WrappedSlideId =
  | "gpa"
  | "cgpa"
  | "best"
  | "top-grades"
  | "arrears"
  | "attendance"
  | "summary";

/** The slides worth showing for this recap, in order; the summary always closes it. */
export function wrappedSlides(w: Wrapped): WrappedSlideId[] {
  const slides: WrappedSlideId[] = [];
  if (w.gpa != null) slides.push("gpa");
  if (w.cgpa != null && w.cgpa > 0) slides.push("cgpa");
  if (w.best.length > 0) slides.push("best");
  if (w.topGrades && w.topGrades.outOf > 0) slides.push("top-grades");
  if (w.arrears.standing != null) slides.push("arrears");
  if (w.attendance) slides.push("attendance");
  slides.push("summary");
  return slides;
}

/* ------------------------------ wording ------------------------------ */

/** "8.12"; a dash when unknown. */
export function formatGpa(n: number | null): string {
  return n == null ? "—" : n.toFixed(2);
}

/** "+0.24", "−0.10" (a real minus sign), "0.00". */
export function formatDelta(delta: number): string {
  if (Math.abs(delta) < 0.005) return "0.00";
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(2)}`;
}

/** "Up 0.24 from semester 3", "Down 0.10 from semester 3", "Same as semester 3", or the first-GPA line. */
export function gpaChangeWords(w: Pick<Wrapped, "gpaDelta" | "previous">): string {
  if (w.gpaDelta == null || !w.previous) return "Your first GPA on record";
  const from = `semester ${w.previous.semester}`;
  if (Math.abs(w.gpaDelta) < 0.005) return `Same as ${from}`;
  return `${w.gpaDelta > 0 ? "Up" : "Down"} ${Math.abs(w.gpaDelta).toFixed(2)} from ${from}`;
}

/** "Physics", "Physics and Chemistry", "Physics, Chemistry and 2 more". */
export function listTitles(titles: string[], max = 2): string {
  if (titles.length <= 1) return titles[0] ?? "";
  if (titles.length <= max) return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
  return `${titles.slice(0, max).join(", ")} and ${titles.length - max} more`;
}

/** Marks for a paper: "88 / 100", or the percentage when the total is unknown. */
export function paperMarks(p: WrappedPaper): string | null {
  if (p.total != null && p.maxTotal != null) return `${p.total} / ${p.maxTotal}`;
  if (p.percent != null) return `${Number.isInteger(p.percent) ? p.percent : p.percent.toFixed(1)}%`;
  return null;
}

/** "1 paper", "3 papers". */
export function papersWord(n: number): string {
  return `${n} ${n === 1 ? "paper" : "papers"}`;
}

/* ------------------------------ summary card ------------------------------ */

/** One block of the closing card and the share image. Words are final; the renderers only lay them out. */
export interface SummaryTile {
  id: "cgpa" | "credits" | "best" | "top-grades" | "attendance";
  label: string;
  value: string;
  sub: string | null;
  /** A grade shown beside the value (the best subject's). */
  grade: string | null;
  /** Takes a full row. */
  wide: boolean;
}

export interface WrappedSummary {
  /** "Semester 4 wrapped" */
  title: string;
  /** The GPA up top, or null when hidden or unknown. */
  gpa: { label: string; value: string; change: string } | null;
  /** Short positive arrears line, or null (standing arrears are never put on the shared card). */
  arrears: string | null;
  tiles: SummaryTile[];
  /** Plain note when grades are worked out from marks. */
  note: string | null;
}

export const ESTIMATED_NOTE = "Estimated from marks on the official grade scale";

/** "88% each" style percentage, one decimal at most. */
const pctWords = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;

/**
 * The closing card. With `hideGpa` the GPA, the change and the CGPA are left out entirely
 * (the share image is drawn from this too, so nothing of them reaches it).
 */
export function wrappedSummary(w: Wrapped, opts: { hideGpa: boolean; attendancePct?: (n: number) => string }): WrappedSummary {
  const fmtAttendance = opts.attendancePct ?? pctWords;
  const tiles: SummaryTile[] = [];
  const showGpa = !opts.hideGpa;

  if (showGpa && w.cgpa != null && w.cgpa > 0) {
    tiles.push({
      id: "cgpa",
      label: "CGPA",
      value: formatGpa(w.cgpa),
      sub: w.credits.total != null ? `over ${w.credits.total} credits` : null,
      grade: null,
      wide: false,
    });
  }
  if (w.credits.semester != null && w.credits.semester > 0) {
    const total = w.credits.total;
    tiles.push({
      id: "credits",
      label: "Credits earned",
      value: String(w.credits.semester),
      sub: total != null && total > w.credits.semester ? `${total} so far` : "this semester",
      grade: null,
      wide: false,
    });
  }
  if (w.topGrades && w.topGrades.count > 0) {
    tiles.push({
      id: "top-grades",
      label: "Top grades",
      value: String(w.topGrades.count),
      sub: `${w.topGrades.byGrade.map((g) => `${g.count} ${g.grade}`).join(", ")} of ${w.topGrades.outOf}`,
      grade: null,
      wide: false,
    });
  }
  const first = w.best[0];
  if (first) {
    const tie = w.best.length > 1;
    tiles.push({
      id: "best",
      label: tie ? "Joint best subjects" : "Best subject",
      value: listTitles(w.best.map((p) => p.title)),
      sub: tie ? (first.percent != null ? `${pctWords(first.percent)} each` : null) : paperMarks(first),
      grade: first.grade,
      wide: true,
    });
  }
  if (w.attendance) {
    tiles.push({
      id: "attendance",
      label: "Attendance",
      value: fmtAttendance(w.attendance.percentage),
      sub: w.attendance.semester != null ? `semester ${w.attendance.semester} so far` : "this semester so far",
      grade: null,
      wide: false,
    });
  }

  let arrears: string | null = null;
  if (w.arrears.standing === 0) arrears = w.arrears.clearedThisSemester.length > 0 ? "Arrears cleared" : "No arrears";

  return {
    title: `Semester ${w.semester} wrapped`,
    gpa:
      showGpa && w.gpa != null
        ? { label: `Semester ${w.semester} GPA`, value: formatGpa(w.gpa), change: gpaChangeWords(w) }
        : null,
    arrears,
    tiles: arrangeTiles(tiles),
    note: w.estimated ? ESTIMATED_NOTE : null,
  };
}

/**
 * Two half tiles per row, wide tiles on their own. The best subject goes after the first
 * pair; a half tile left alone in its row is widened so no row has a gap.
 */
export function arrangeTiles(tiles: SummaryTile[]): SummaryTile[] {
  const halves = tiles.filter((t) => !t.wide);
  const wides = tiles.filter((t) => t.wide);
  const ordered = [...halves.slice(0, 2), ...wides, ...halves.slice(2)];
  const out: SummaryTile[] = [];
  let open = 0; // half tiles in the current row
  ordered.forEach((t, i) => {
    if (t.wide) {
      if (open === 1) out[out.length - 1] = { ...out[out.length - 1]!, wide: true };
      out.push(t);
      open = 0;
      return;
    }
    out.push({ ...t });
    open = open === 1 ? 0 : 1;
    if (i === ordered.length - 1 && open === 1) out[out.length - 1] = { ...out[out.length - 1]!, wide: true };
  });
  return out;
}

/** Rows of the arranged tiles: each row holds one wide tile or two half tiles. */
export function tileRows(tiles: SummaryTile[]): SummaryTile[][] {
  const rows: SummaryTile[][] = [];
  for (const t of tiles) {
    const row = rows[rows.length - 1];
    if (!t.wide && row && row.length === 1 && !row[0]!.wide) row.push(t);
    else rows.push([t]);
  }
  return rows;
}
