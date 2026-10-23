import {
  DEFAULT_ASSIGNMENT_ATTENDANCE,
  DEFAULT_EXTERNAL_MAX,
  DEFAULT_GRADE_SCALE,
  DEFAULT_INTERNAL_SETTINGS,
  LEGACY_GRADE_SCALE,
  cgpaStanding,
  externalMinimum,
  failingBand,
  gradeFor,
  internalMarks,
  passes,
  percentOf,
  projectedCgpa,
  requiredExternal,
  semesterGpa,
  sortScale,
  type CreditSource,
  type GradeBand,
  type ResolvedCourse,
  type SemesterResult,
  type SubjectMarks,
} from "@usp/core";

/** Credits for a subject with no course facts (the official theory default). */
export const DEFAULT_CREDITS = 3;

/** The grade the planner aims for by default: A+ (80% or more). */
export const DEFAULT_TARGET_GRADE = "A+";

export interface PlannerSettings {
  caeWeight: number;
  internalMax: number;
  externalMax: number;
  defaultOther: number;
  targetGrade: string;
  scale: GradeBand[];
  /**
   * True once the student edited the grade bands here. Until then the bands follow the
   * grading preset chosen in Settings. Absent in states saved before presets existed.
   */
  scaleEdited?: boolean;
}

/** What the student typed for one subject. Blank string = use the default. */
export interface SubjectInput {
  cae1?: string;
  cae2?: string;
  other?: string;
  external?: string;
  credits?: string;
  include?: boolean;
  /** Grade to aim for in this subject; blank means the semester target. */
  target?: string;
}

export interface PlannerState {
  v: 1;
  settings: PlannerSettings;
  previous: { cgpa: string; credits: string };
  subjects: Record<string, SubjectInput>;
}

export const DEFAULT_SETTINGS: PlannerSettings = {
  caeWeight: DEFAULT_INTERNAL_SETTINGS.caeWeight,
  internalMax: DEFAULT_INTERNAL_SETTINGS.internalMax,
  externalMax: DEFAULT_EXTERNAL_MAX,
  defaultOther: DEFAULT_ASSIGNMENT_ATTENDANCE,
  targetGrade: DEFAULT_TARGET_GRADE,
  scale: DEFAULT_GRADE_SCALE,
};

export function defaultState(): PlannerState {
  return { v: 1, settings: DEFAULT_SETTINGS, previous: { cgpa: "", credits: "" }, subjects: {} };
}

/** The grade to aim for when none is chosen: "A+" (or "A") where the scale has it, else the second band. */
export function defaultTargetFor(scale: GradeBand[]): string {
  const sorted = sortScale(scale);
  return (
    sorted.find((b) => b.grade === DEFAULT_TARGET_GRADE) ??
    sorted.find((b) => b.grade === "A") ??
    sorted[1] ??
    sorted[0]!
  ).grade;
}

function sameScale(a: GradeBand[], b: GradeBand[]): boolean {
  if (a.length !== b.length) return false;
  const sa = sortScale(a);
  const sb = sortScale(b);
  return sa.every((x, i) => x.grade === sb[i]!.grade && x.min === sb[i]!.min && x.points === sb[i]!.points);
}

/**
 * Use the student's grading preset for the grade bands unless they edited the bands here.
 * Their chosen target grade survives when the new scale still has it.
 */
export function withPresetScale(
  state: PlannerState,
  presetScale: GradeBand[] | null | undefined,
): PlannerState {
  if (!presetScale || presetScale.length < 2 || state.settings.scaleEdited) return state;
  const scale = sortScale(presetScale);
  const kept = scale.some((b) => b.grade === state.settings.targetGrade);
  return {
    ...state,
    settings: {
      ...state.settings,
      scale,
      scaleEdited: false,
      targetGrade: kept ? state.settings.targetGrade : defaultTargetFor(scale),
    },
  };
}

export interface PreviousStanding {
  cgpa: string;
  credits: string;
}

/**
 * CGPA and credits so far, taken from estimated results, as the strings the planner
 * fields hold. Passed credit courses only (official rule). null when nothing was
 * estimated (published grades are left to the student).
 */
export function estimatedPrevious(semesters: SemesterResult[]): PreviousStanding | null {
  const standing = cgpaStanding(semesters.filter((s) => s.estimated));
  if (standing.credits <= 0) return null;
  return { cgpa: standing.cgpa.toFixed(2), credits: String(standing.credits) };
}

/**
 * The state with blank "before this semester" fields filled from `fallback`. Anything the
 * student typed wins; clearing a field falls back, like the ERP-supplied CAE marks.
 */
export function withPreviousFallback(
  state: PlannerState,
  fallback: PreviousStanding | null | undefined,
): PlannerState {
  if (!fallback) return state;
  return {
    ...state,
    previous: {
      cgpa: state.previous.cgpa.trim() === "" ? fallback.cgpa : state.previous.cgpa,
      credits: state.previous.credits.trim() === "" ? fallback.credits : state.previous.credits,
    },
  };
}

/** "34", "34.5" and " 34 " parse; blank, junk and negatives do not. */
export function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Keep digits and at most one dot, so a text input behaves like a number input. */
export function sanitizeNumber(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  const joined = dot === -1 ? cleaned : cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
  return joined.slice(0, 6);
}

const finite = (v: unknown, fallback: number, lo: number, hi: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

function validScale(v: unknown): GradeBand[] | null {
  if (!Array.isArray(v) || v.length < 2 || v.length > 12) return null;
  const bands: GradeBand[] = [];
  for (const b of v) {
    if (
      !b || typeof b !== "object" ||
      typeof b.grade !== "string" || b.grade.length === 0 || b.grade.length > 4 ||
      typeof b.min !== "number" || typeof b.points !== "number" ||
      !Number.isFinite(b.min) || !Number.isFinite(b.points)
    ) {
      return null;
    }
    bands.push({ grade: b.grade, min: b.min, points: b.points });
  }
  return sortScale(bands);
}

/** Read stored JSON defensively: anything wrong falls back to the defaults. */
export function parseState(json: string | null | undefined): PlannerState {
  const base = defaultState();
  if (!json) return base;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return base;
  }
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const s = (r.settings ?? {}) as Record<string, unknown>;
  const scale = validScale(s.scale) ?? DEFAULT_GRADE_SCALE;
  const targetGrade =
    typeof s.targetGrade === "string" && scale.some((b) => b.grade === s.targetGrade)
      ? s.targetGrade
      : defaultTargetFor(scale);
  // States saved before presets existed have no flag: a scale that is neither the official
  // one nor the old default (S to U) means the student edited it.
  const scaleEdited =
    typeof s.scaleEdited === "boolean"
      ? s.scaleEdited
      : sameScale(scale, DEFAULT_GRADE_SCALE) || sameScale(scale, LEGACY_GRADE_SCALE)
        ? undefined
        : true;

  const subjects: Record<string, SubjectInput> = {};
  if (r.subjects && typeof r.subjects === "object") {
    for (const [code, v] of Object.entries(r.subjects as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const o = v as Record<string, unknown>;
      const text = (x: unknown) => (typeof x === "string" ? x.slice(0, 8) : undefined);
      subjects[code] = {
        cae1: text(o.cae1), cae2: text(o.cae2), other: text(o.other),
        external: text(o.external), credits: text(o.credits),
        include: typeof o.include === "boolean" ? o.include : undefined,
        target:
          typeof o.target === "string" && o.target.length > 0 && o.target.length <= 4
            ? o.target
            : undefined,
      };
    }
  }

  const p = (r.previous ?? {}) as Record<string, unknown>;
  return {
    v: 1,
    settings: {
      caeWeight: finite(s.caeWeight, base.settings.caeWeight, 0, 5),
      internalMax: finite(s.internalMax, base.settings.internalMax, 1, 1000),
      externalMax: finite(s.externalMax, base.settings.externalMax, 1, 1000),
      defaultOther: finite(s.defaultOther, base.settings.defaultOther, 0, 1000),
      targetGrade,
      scale,
      ...(scaleEdited === undefined ? {} : { scaleEdited }),
    },
    previous: {
      cgpa: typeof p.cgpa === "string" ? p.cgpa.slice(0, 6) : "",
      credits: typeof p.credits === "string" ? p.credits.slice(0, 6) : "",
    },
    subjects,
  };
}

/** Pull CAE 1 and CAE 2 out of an ERP subject's mark components ("CAE 1", "CIA-2"...). */
export function caeScores(components: SubjectMarks["components"]): { cae1: number | null; cae2: number | null } {
  const pick = (n: 1 | 2) => {
    const c = components.find((x) => new RegExp(`(?:cae|cia|internal)\\D*${n}\\b`, "i").test(x.name));
    return c?.scored ?? null;
  };
  return { cae1: pick(1), cae2: pick(2) };
}

/** Official facts about a subject, from the course catalog on the server. */
export interface PlannerCourse {
  credits: number;
  internalMax: number;
  externalMax: number;
  maxTotal: number;
  /** Zero-credit audit course: left out of the GPA by default. */
  audit: boolean;
  /** official = curriculum, estimated = code-pattern guess, custom = the student's correction */
  source: CreditSource;
}

export interface PlannerSubject {
  code: string;
  title: string;
  /** From the ERP when published; null when not (the student types it). */
  cae1: number | null;
  cae2: number | null;
  /** Credits and mark maxima; without it the planner settings (50 + 50, 3 credits) apply. */
  course?: PlannerCourse;
}

/** Current-term subjects: the attendance list names them, marks supply the CAE scores. */
export function plannerSubjects(
  names: { code: string; title: string }[],
  marks: SubjectMarks[],
): PlannerSubject[] {
  const byCode = new Map(marks.map((m) => [m.code, m]));
  const merged = new Map<string, PlannerSubject>();
  for (const n of names) {
    const { cae1, cae2 } = caeScores(byCode.get(n.code)?.components ?? []);
    merged.set(n.code, { code: n.code, title: n.title, cae1, cae2 });
  }
  for (const m of marks) {
    if (merged.has(m.code)) continue;
    merged.set(m.code, { code: m.code, title: m.title, ...caeScores(m.components) });
  }
  return [...merged.values()];
}

/** Attach official course facts (credits, maxima, audit) to each subject. Run on the server. */
export function withCourses(
  subjects: PlannerSubject[],
  resolve: (code: string, title: string) => ResolvedCourse,
): PlannerSubject[] {
  return subjects.map((s) => {
    const c = resolve(s.code, s.title);
    return {
      ...s,
      course: {
        credits: c.credits,
        internalMax: c.internalMax,
        externalMax: c.externalMax,
        maxTotal: c.maxTotal,
        audit: c.audit,
        source: c.creditSource,
      },
    };
  });
}

export interface SubjectPlan {
  code: string;
  title: string;
  included: boolean;
  cae1: number | null;
  cae2: number | null;
  other: number;
  credits: number;
  /** Where the default credits came from; undefined without course facts. */
  creditSource?: CreditSource;
  audit: boolean;
  internalMax: number;
  externalMax: number;
  maxTotal: number;
  /** Whole exam marks needed to pass (30% of the exam maximum, rounded up). */
  externalMin: number;
  internal: number;
  /** External the student typed, or null when they haven't. */
  externalEntered: number | null;
  /** External used for the total: the typed value, else what the target grade needs. */
  external: number;
  /** True when `external` was assumed (nothing typed). */
  planned: boolean;
  needed: number;
  reachable: boolean;
  secured: boolean;
  /** Grade this subject aims for: its own choice, else the semester target. */
  target: string;
  /** Lowest percentage that earns `target`. */
  targetMin: number;
  /** Lowest total (out of `maxTotal`) that earns `target`. */
  targetTotal: number;
  /** Best grade possible with a full external, for when `target` is out of reach. */
  bestGrade: string;
  total: number;
  /** Total as a percentage of `maxTotal`. */
  percent: number;
  grade: string;
  points: number;
}

export interface PlannerResult {
  subjects: SubjectPlan[];
  gpa: number;
  credits: number;
  cgpa: number | null;
  targetMin: number;
}

/**
 * Grade for a planned total by the official rules: the percentage of the subject's maximum
 * picks the band, and a total under 50% or an exam under 30% of its maximum is a fail.
 */
function plannedGrade(
  total: number,
  external: number,
  course: { maxTotal: number; externalMax: number },
  scale: GradeBand[],
): GradeBand {
  return passes(total, external, course)
    ? gradeFor(percentOf(total, course.maxTotal), scale)
    : failingBand(scale);
}

export function computePlan(
  state: PlannerState,
  subjects: PlannerSubject[],
): PlannerResult {
  const { settings } = state;
  const semesterTarget =
    settings.scale.find((b) => b.grade === settings.targetGrade) ?? settings.scale[0]!;

  const plans: SubjectPlan[] = subjects.map((s) => {
    const input = state.subjects[s.code] ?? {};
    const course = s.course;
    const internalMax = course?.internalMax ?? settings.internalMax;
    const externalMax = course?.externalMax ?? settings.externalMax;
    const maxTotal = course?.maxTotal ?? internalMax + externalMax;
    const maxima = { maxTotal, externalMax };
    const target = settings.scale.find((b) => b.grade === input.target) ?? semesterTarget;
    const cae1 = parseNumber(input.cae1) ?? s.cae1;
    const cae2 = parseNumber(input.cae2) ?? s.cae2;
    const other = parseNumber(input.other) ?? settings.defaultOther;
    const credits = parseNumber(input.credits) ?? course?.credits ?? DEFAULT_CREDITS;
    const internal = internalMarks(cae1, cae2, other, { caeWeight: settings.caeWeight, internalMax });
    // The band threshold scales with the subject's maximum: A+ is 40 of 50 in a one-credit lab.
    const targetTotal = (target.min * maxTotal) / 100;
    const externalMin = externalMax > 0 ? Math.ceil(externalMinimum({ externalMax }) - 1e-9) : 0;
    const req = requiredExternal(internal, targetTotal, externalMax);
    // A passing target also needs the exam minimum, however strong the internal marks are.
    const needed = target.points > 0 ? Math.max(req.needed, externalMin) : req.needed;
    const reachable = needed <= externalMax;
    const entered = parseNumber(input.external);
    const external = Math.min(externalMax, entered ?? (reachable ? needed : externalMax));
    // Whole marks only: the total is rounded to the nearest mark, like the mark sheet.
    const total = Math.round(internal + external);
    const band = plannedGrade(total, external, maxima, settings.scale);
    const best = Math.round(internal + externalMax);
    return {
      code: s.code, title: s.title,
      included: input.include ?? !(course?.audit ?? false),
      cae1, cae2, other, credits,
      ...(course ? { creditSource: course.source } : {}),
      audit: course?.audit ?? false,
      internalMax, externalMax, maxTotal, externalMin, internal,
      externalEntered: entered, external, planned: entered === null,
      needed, reachable, secured: req.secured,
      target: target.grade, targetMin: target.min, targetTotal,
      bestGrade: plannedGrade(best, externalMax, maxima, settings.scale).grade,
      total, percent: percentOf(total, maxTotal), grade: band.grade, points: band.points,
    };
  });

  const counted = plans.filter((p) => p.included && p.credits > 0);
  const gpa = semesterGpa(counted.map((p) => ({ credits: p.credits, points: p.points })));
  const credits = counted.reduce((sum, p) => sum + p.credits, 0);

  const prevCgpa = parseNumber(state.previous.cgpa);
  const prevCredits = parseNumber(state.previous.credits);
  const cgpa =
    prevCgpa !== null && prevCredits !== null && prevCredits > 0 && credits > 0
      ? projectedCgpa({ cgpa: prevCgpa, credits: prevCredits }, { cgpa: gpa, credits })
      : null;

  return { subjects: plans, gpa, credits, cgpa, targetMin: semesterTarget.min };
}

const oneDecimal = (n: number) => String(Math.round(n * 10) / 10);

/**
 * Short plain sentences about the external marks the semester needs: the average and the
 * hardest subject, which targets are out of reach, or that everything is already secured.
 * Only subjects counted in the GPA take part. When their exams share one maximum it is
 * named ("out of 50"); `externalMax` is the fallback name for it.
 */
export function summaryGuidance(plan: PlannerResult, externalMax: number): string[] {
  const counted = plan.subjects.filter((p) => p.included);
  if (counted.length === 0) return [];
  const maxima = new Set(counted.map((p) => p.externalMax));
  const outOf = maxima.size <= 1 ? ` out of ${[...maxima][0] ?? externalMax}` : "";
  const targets = new Set(counted.map((p) => p.target));
  const which = targets.size === 1 ? `${[...targets][0]} in every subject` : "your target grades";
  const lines: string[] = [];

  const out = counted.filter((p) => !p.reachable);
  const needing = counted.filter((p) => p.reachable && !p.secured);
  if (needing.length > 0) {
    const avg = needing.reduce((sum, p) => sum + p.needed, 0) / needing.length;
    const hardest = needing.reduce((a, b) => (b.needed > a.needed ? b : a));
    lines.push(
      out.length === 0
        ? `To get ${which} you need ${oneDecimal(avg)} external marks on average${outOf}; the hardest is ${hardest.title} (${hardest.needed}).`
        : `In the other ${needing.length === 1 ? "subject" : `${needing.length} subjects`} you need ${oneDecimal(avg)} external marks on average${outOf}; the hardest is ${hardest.title} (${hardest.needed}).`,
    );
  }
  if (out.length > 0) {
    lines.push(
      `Out of reach: ${out.map((p) => `${p.title} for ${p.target} (best possible ${p.bestGrade})`).join(", ")}.`,
    );
  }
  if (out.length === 0 && needing.length === 0) {
    lines.push(`Your internal marks already secure ${which}. You still need 30% of each exam to pass.`);
  }
  return lines;
}

/** The plan with one grade as everyone's target and no per-subject overrides. */
export function planForGrade(
  state: PlannerState,
  subjects: PlannerSubject[],
  grade: string,
): PlannerResult {
  const uniform: Record<string, SubjectInput> = {};
  for (const [code, input] of Object.entries(state.subjects)) uniform[code] = { ...input, target: undefined };
  return computePlan(
    { ...state, subjects: uniform, settings: { ...state.settings, targetGrade: grade } },
    subjects,
  );
}

export interface GpaGoal {
  /** Lowest grade, taken in every subject, that reaches the target GPA. Null when none does. */
  grade: string | null;
  plan: PlannerResult | null;
  /** Highest semester GPA the scale allows with the current marks. */
  bestGpa: number;
}

/**
 * Tries each passing grade from best to worst as everyone's target and keeps the lowest
 * one whose semester GPA still reaches `targetGpa`.
 */
export function findGradeForGpa(
  state: PlannerState,
  subjects: PlannerSubject[],
  targetGpa: number,
): GpaGoal {
  const grades = sortScale(state.settings.scale).filter((b) => b.points > 0);
  let found: { grade: string; plan: PlannerResult } | null = null;
  let bestGpa = 0;
  for (const [i, band] of grades.entries()) {
    const plan = planForGrade(state, subjects, band.grade);
    if (i === 0) bestGpa = plan.gpa;
    if (plan.gpa + 1e-9 < targetGpa) break;
    found = { grade: band.grade, plan };
  }
  return { grade: found?.grade ?? null, plan: found?.plan ?? null, bestGpa };
}

/**
 * The semester GPA that lifts a CGPA of `prevCgpa` over `prevCredits` to `targetCgpa` once
 * `credits` more are added, rounded up to two places. Null without credits to add.
 */
export function gpaForTargetCgpa(
  targetCgpa: number,
  prevCgpa: number,
  prevCredits: number,
  credits: number,
): number | null {
  if (credits <= 0) return null;
  const gpa = (targetCgpa * (prevCredits + credits) - prevCgpa * prevCredits) / credits;
  return Math.max(0, Math.ceil(gpa * 100 - 1e-9) / 100);
}
