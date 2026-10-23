"use client";

import * as React from "react";
import { DEFAULT_GRADE_SCALE, type CreditSource, type GradeBand } from "@usp/core";
import { Section } from "@/components/ui/Section";
import { fieldClass, labelClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CREDITS,
  computePlan,
  defaultState,
  findGradeForGpa,
  gpaForTargetCgpa,
  parseNumber,
  parseState,
  sanitizeNumber,
  summaryGuidance,
  withPreviousFallback,
  withPresetScale,
  type PlannerResult,
  type PlannerSettings,
  type PlannerState,
  type PlannerSubject,
  type PreviousStanding,
  type SubjectInput,
  type SubjectPlan,
} from "@/lib/planner";

const KEY = "usp-planner-v1";

// Inputs live in this browser only. A module-level copy keeps edits working
// when storage is blocked (private windows, cleared site data).
let memory: string | null = null;
const listeners = new Set<() => void>();

function readStorage(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}
const getSnapshot = () => memory ?? readStorage();
const getServerSnapshot = () => "";
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      memory = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
function save(next: PlannerState) {
  const json = JSON.stringify(next);
  memory = json;
  try {
    localStorage.setItem(KEY, json);
  } catch {
    /* kept in memory for this visit */
  }
  listeners.forEach((l) => l());
}

const COLUMNS =
  "lg:grid-cols-[minmax(0,1.6fr)_4.25rem_4.25rem_4.75rem_3.75rem_4.75rem_3.25rem_3.25rem_3.75rem_2.75rem]";

const gradeOption = (b: GradeBand) => `${b.grade} (${b.min}% or more)`;
/** Only passing bands make sense as a target. */
const targetBands = (scale: GradeBand[]) => scale.filter((b) => b.points > 0);
const SOURCE_LABEL: Record<CreditSource, string> = {
  official: "official",
  estimated: "estimated",
  custom: "edited",
};

export function Planner({
  subjects,
  fromErp,
  presetScale,
  estimatedPrevious,
}: {
  subjects: PlannerSubject[];
  fromErp: boolean;
  /** Grade bands from the student's grading preset; used until they edit bands here. */
  presetScale?: GradeBand[];
  /** CGPA and credits estimated from ERP marks; typed values win over these. */
  estimatedPrevious?: PreviousStanding | null;
}) {
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // `base` is what gets saved; `state` also has the estimated CGPA filled in for blank fields.
  const base = React.useMemo(
    () => withPresetScale(parseState(snapshot), presetScale),
    [snapshot, presetScale],
  );
  const state = React.useMemo(
    () => withPreviousFallback(base, estimatedPrevious),
    [base, estimatedPrevious],
  );
  const plan = React.useMemo(() => computePlan(state, subjects), [state, subjects]);

  const patchSubject = (code: string, patch: Partial<SubjectInput>) =>
    save({ ...base, subjects: { ...base.subjects, [code]: { ...base.subjects[code], ...patch } } });
  const patchSettings = (patch: Partial<PlannerSettings>) =>
    save({ ...base, settings: { ...base.settings, ...patch } });
  /** Make one grade everyone's target, dropping per-subject choices. */
  const useSemesterTarget = (grade: string) =>
    save({
      ...base,
      settings: { ...base.settings, targetGrade: grade },
      subjects: Object.fromEntries(
        Object.entries(base.subjects).map(([code, input]) => [code, { ...input, target: undefined }]),
      ),
    });

  const target = state.settings.targetGrade;
  const fromEstimate = {
    cgpa: !!estimatedPrevious && base.previous.cgpa.trim() === "",
    credits: !!estimatedPrevious && base.previous.credits.trim() === "",
  };

  return (
    <div className="space-y-10">
      <Summary
        plan={plan}
        state={state}
        subjects={subjects}
        hasPrevious={parseNumber(state.previous.cgpa) !== null}
        onTarget={useSemesterTarget}
      />

      <Section
        title="Subjects"
        action={
          <button
            type="button"
            onClick={() => save(defaultState())}
            className="focusable min-h-11 text-sm font-medium text-primary underline-offset-4 hover:underline lg:min-h-0"
          >
            Reset
          </button>
        }
      >
        <p className="mb-4 max-w-2xl text-body text-muted-foreground">
          {fromErp
            ? `Filled in from your ERP. Type over anything to try a different score. Leave External empty to see what grade ${target} needs.`
            : `Enter your CAE marks. Leave External empty to see what grade ${target} needs.`}
        </p>

        <div
          className={cn(
            "hidden gap-x-3 border-b border-border pb-2 text-xs font-medium text-muted-foreground lg:grid",
            COLUMNS,
          )}
          aria-hidden
        >
          <span>Subject</span>
          <span>CAE 1</span>
          <span>CAE 2</span>
          <span>Assign. + att.</span>
          <span>Internal</span>
          <span>External</span>
          <span>Total</span>
          <span>Grade</span>
          <span>Credits</span>
          <span>Count</span>
        </div>

        <ul className="divide-y divide-border">
          {plan.subjects.map((p) => (
            <SubjectRow
              key={p.code}
              plan={p}
              input={base.subjects[p.code] ?? {}}
              erp={subjects.find((s) => s.code === p.code)}
              settings={state.settings}
              onChange={(patch) => patchSubject(p.code, patch)}
            />
          ))}
        </ul>
      </Section>

      <Section title="Before this semester">
        <p className="mb-4 max-w-2xl text-body text-muted-foreground">
          {estimatedPrevious
            ? "Estimated from your ERP marks. Type the figures from your grade sheet to be exact."
            : "From your last grade sheet, to project your CGPA."}
        </p>
        <div className="grid max-w-md grid-cols-2 gap-4">
          <LabeledField
            id="prev-cgpa"
            label="CGPA so far"
            value={state.previous.cgpa}
            placeholder="8.25"
            hint={fromEstimate.cgpa ? "Estimated" : undefined}
            onChange={(v) => save({ ...base, previous: { ...base.previous, cgpa: v } })}
          />
          <LabeledField
            id="prev-credits"
            label="Credits completed"
            value={state.previous.credits}
            placeholder="60"
            hint={fromEstimate.credits ? "Estimated" : undefined}
            onChange={(v) => save({ ...base, previous: { ...base.previous, credits: v } })}
          />
        </div>
      </Section>

      <Settings
        settings={state.settings}
        defaultScale={presetScale ?? DEFAULT_GRADE_SCALE}
        onChange={patchSettings}
      />
    </div>
  );
}

function Summary({
  plan,
  state,
  subjects,
  hasPrevious,
  onTarget,
}: {
  plan: PlannerResult;
  state: PlannerState;
  subjects: PlannerSubject[];
  hasPrevious: boolean;
  onTarget: (grade: string) => void;
}) {
  const { settings } = state;
  const target = settings.targetGrade;
  const planned = plan.subjects.filter((s) => s.included && s.planned);
  const sharedTarget = planned.every((s) => s.target === planned[0]?.target);
  const guidance = summaryGuidance(plan, settings.externalMax);
  return (
    <section aria-label="Semester summary" className="space-y-8 border-b border-border pb-8">
      <div className="max-w-xl">
        <label htmlFor="target-grade" className={cn(labelClass, "block")}>
          Target grade for this semester
        </label>
        <select
          id="target-grade"
          value={target}
          onChange={(e) => onTarget(e.target.value)}
          className={cn(fieldClass, "mt-1.5 sm:max-w-72")}
        >
          {targetBands(settings.scale).map((b) => (
            <option key={b.grade} value={b.grade}>
              {gradeOption(b)}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-body text-muted-foreground">
          Each subject below shows the external marks this needs.
        </p>
        {guidance.length > 0 ? (
          <div className="mt-3 space-y-1 text-small leading-relaxed text-foreground">
            {guidance.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <div>
          <p className="text-sm text-muted-foreground">Semester GPA</p>
          <p className="mt-1 text-5xl font-semibold leading-none tracking-tight tabular-nums">
            {plan.credits > 0 ? plan.gpa.toFixed(2) : "–"}
          </p>
          <p className="mt-2 text-body text-muted-foreground">
            {planned.length > 0
              ? `Assuming ${sharedTarget ? `grade ${planned[0]!.target}` : "each target"} in ${planned.length} ${planned.length === 1 ? "subject" : "subjects"}.`
              : "From the marks you entered."}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Projected CGPA</p>
          <p className="mt-1 text-5xl font-semibold leading-none tracking-tight tabular-nums">
            {plan.cgpa !== null ? plan.cgpa.toFixed(2) : "–"}
          </p>
          <p className="mt-2 text-body text-muted-foreground">
            {hasPrevious ? "With this semester added." : "Add your CGPA so far, below."}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Credits counted</p>
          <p className="mt-1 text-5xl font-semibold leading-none tracking-tight tabular-nums">{plan.credits}</p>
          <p className="mt-2 text-body text-muted-foreground">Untick a subject to leave it out.</p>
        </div>
      </div>

      <GoalFinder plan={plan} state={state} subjects={subjects} onTarget={onTarget} />
    </section>
  );
}

/** Work backwards from a semester GPA or a CGPA to the grade to aim for. */
function GoalFinder({
  plan,
  state,
  subjects,
  onTarget,
}: {
  plan: PlannerResult;
  state: PlannerState;
  subjects: PlannerSubject[];
  onTarget: (grade: string) => void;
}) {
  const [mode, setMode] = React.useState<"gpa" | "cgpa">("gpa");
  const [text, setText] = React.useState("");
  const typed = parseNumber(text);
  const max = Math.max(...state.settings.scale.map((b) => b.points));

  const prevCgpa = parseNumber(state.previous.cgpa);
  const prevCredits = parseNumber(state.previous.credits);

  let needGpa: number | null = null;
  let note: string | null = null;
  if (typed === null) {
    note = null;
  } else if (plan.credits <= 0) {
    note = "Count at least one subject to work this out.";
  } else if (mode === "gpa") {
    needGpa = typed;
  } else if (prevCgpa === null || prevCredits === null || prevCredits <= 0) {
    note = "Fill in CGPA so far and Credits completed first.";
  } else {
    needGpa = gpaForTargetCgpa(typed, prevCgpa, prevCredits, plan.credits);
    if (needGpa !== null) {
      note =
        needGpa <= 0
          ? `Your CGPA stays at ${typed} or more whatever you score this semester.`
          : `You need a semester GPA of ${needGpa.toFixed(2)} to get there.`;
    }
  }

  const outOfScale = needGpa !== null && needGpa > max;
  const goal =
    needGpa !== null && needGpa > 0 && !outOfScale ? findGradeForGpa(state, subjects, needGpa) : null;
  const lines = goal?.plan ? summaryGuidance(goal.plan, state.settings.externalMax) : [];

  return (
    <section aria-labelledby="goal-heading" className="border-t border-border pt-6">
      <h3 id="goal-heading" className="text-heading font-semibold text-foreground">
        Or aim for a number
      </h3>
      <div className="mt-3 max-w-xl space-y-4">
        <p className="text-body text-muted-foreground">
          Type the result you want; the planner finds the lowest grade that gets you there.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="goal-mode" className={labelClass}>
              Aim for
            </label>
            <select
              id="goal-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value === "cgpa" ? "cgpa" : "gpa")}
              className={cn(fieldClass, "mt-1.5")}
            >
              <option value="gpa">Semester GPA</option>
              <option value="cgpa">CGPA</option>
            </select>
          </div>
          <div>
            <label htmlFor="goal-value" className={labelClass}>
              {mode === "gpa" ? "Target semester GPA" : "Target CGPA"}
            </label>
            <input
              id="goal-value"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={text}
              placeholder={mode === "gpa" ? "8.5" : "8.25"}
              onChange={(e) => setText(sanitizeNumber(e.target.value))}
              className={cn(fieldClass, "mt-1.5 tabular-nums")}
            />
          </div>
        </div>

        {note ? <p className="text-body text-foreground">{note}</p> : null}
        {outOfScale ? (
          <p className="text-body font-semibold text-danger">
            The scale tops out at {max}, so {needGpa!.toFixed(2)} is out of reach.
          </p>
        ) : goal ? (
          goal.grade ? (
            <div className="space-y-2 text-body leading-relaxed">
              <p className="font-semibold text-foreground">
                Aim for {goal.grade} in every subject. That gives a semester GPA of{" "}
                {goal.plan!.gpa.toFixed(2)}.
              </p>
              {lines.map((line) => (
                <p key={line} className="text-muted-foreground">
                  {line}
                </p>
              ))}
              {state.settings.targetGrade === goal.grade ? (
                <p className="text-muted-foreground">That is already your semester target.</p>
              ) : (
                <button
                  type="button"
                  onClick={() => onTarget(goal.grade!)}
                  className="focusable min-h-11 rounded-md text-small font-semibold text-primary underline-offset-4 hover:underline lg:min-h-0"
                >
                  Use {goal.grade} as the semester target
                </button>
              )}
            </div>
          ) : (
            <p className="text-body font-semibold text-danger">
              {needGpa!.toFixed(2)} is out of reach this semester. The most you can reach is{" "}
              {goal.bestGpa.toFixed(2)}.
            </p>
          )
        ) : null}
      </div>
    </section>
  );
}

function SubjectRow({
  plan,
  input,
  erp,
  settings,
  onChange,
}: {
  plan: SubjectPlan;
  input: SubjectInput;
  erp: PlannerSubject | undefined;
  settings: PlannerSettings;
  onChange: (patch: Partial<SubjectInput>) => void;
}) {
  const id = `s-${plan.code}`;
  const target = plan.target;
  // ERP scores and defaults show as real values; clearing a field falls back to them.
  const shown = (typed: string | undefined, fallback: string | number | null | undefined) =>
    typed ?? (fallback == null ? undefined : String(fallback));
  const needText = plan.externalMax <= 0
    ? "No end-semester exam for this course"
    : !plan.reachable
    ? `${target} is out of reach (best is ${plan.bestGrade})`
    : plan.secured && plan.needed === plan.externalMin
      ? `Need ${plan.needed} of ${plan.externalMax} (the pass minimum) for ${target}`
      : `Need ${plan.needed} of ${plan.externalMax} for ${target}`;
  const creditsTyped = (input.credits ?? "").trim() !== "";
  const ownTarget = settings.scale.some((b) => b.grade === input.target) ? input.target! : "";

  return (
    <li className={cn("py-5 lg:py-3", !plan.included && "opacity-55")}>
      <div className={cn("grid grid-cols-2 gap-x-3 gap-y-3 lg:items-start lg:gap-y-0", COLUMNS)}>
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <p className="text-base font-medium leading-snug text-foreground lg:text-sm">{plan.title}</p>
          <p className="text-xs text-muted-foreground">
            {plan.code}
            {plan.maxTotal !== 100 ? `, out of ${plan.maxTotal}` : ""}
            {plan.audit ? ", audit course with no credits" : ""}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <span aria-hidden className="text-xs text-muted-foreground">
              Aim for
            </span>
            <select
              aria-label={`${plan.title} target grade`}
              value={ownTarget}
              onChange={(e) => onChange({ target: e.target.value || undefined })}
              className="focusable h-11 max-w-44 rounded-md border border-input bg-surface px-2 text-small text-foreground lg:h-9"
            >
              <option value="">Semester target ({settings.targetGrade})</option>
              {targetBands(settings.scale).map((b) => (
                <option key={b.grade} value={b.grade}>
                  {b.grade} ({b.min}%+)
                </option>
              ))}
            </select>
          </div>
        </div>

        <Cell label="CAE 1" htmlFor={`${id}-cae1`}>
          <NumberInput
            id={`${id}-cae1`}
            label={`${plan.title} CAE 1`}
            value={shown(input.cae1, erp?.cae1)}
            placeholder="0"
            onChange={(v) => onChange({ cae1: v })}
          />
        </Cell>
        <Cell label="CAE 2" htmlFor={`${id}-cae2`}>
          <NumberInput
            id={`${id}-cae2`}
            label={`${plan.title} CAE 2`}
            value={shown(input.cae2, erp?.cae2)}
            placeholder="0"
            onChange={(v) => onChange({ cae2: v })}
          />
        </Cell>
        <Cell label="Assignment + attendance" htmlFor={`${id}-other`}>
          <NumberInput
            id={`${id}-other`}
            label={`${plan.title} assignment and attendance marks`}
            value={shown(input.other, settings.defaultOther)}
            placeholder="0"
            onChange={(v) => onChange({ other: v })}
          />
        </Cell>

        <Cell label={`Internal (of ${plan.internalMax})`} wide>
          <Figure value={plan.internal} strong />
        </Cell>

        <Cell label={`External (of ${plan.externalMax})`} htmlFor={`${id}-ext`}>
          <NumberInput
            id={`${id}-ext`}
            label={`${plan.title} external marks`}
            value={input.external}
            placeholder={plan.planned ? String(plan.reachable ? plan.needed : plan.externalMax) : ""}
            onChange={(v) => onChange({ external: v })}
          />
          <p className={cn("mt-1 text-body leading-snug lg:text-xs", plan.reachable ? "text-muted-foreground" : "text-danger")}>
            {needText}
          </p>
        </Cell>

        <Cell label="Total" wide>
          <Figure value={plan.total} />
          {plan.planned ? <p className="mt-1 text-xs text-muted-foreground">planned</p> : null}
        </Cell>
        <Cell label="Grade" wide>
          <p className={cn("text-base font-semibold tabular-nums lg:pt-2.5", plan.points === 0 && "text-danger")}>
            {plan.grade}
          </p>
        </Cell>

        {/* Phone-only: the three derived figures on one line instead of three cells. */}
        <p className="col-span-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-body text-muted-foreground lg:hidden">
          <span>
            Internal{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {figure(plan.internal)}
            </span>
            <span className="text-muted-foreground"> / {plan.internalMax}</span>
          </span>
          <span>
            Total{" "}
            <span className="font-semibold tabular-nums text-foreground">{figure(plan.total)}</span>
            {plan.planned ? " (planned)" : ""}
          </span>
          <span>
            Grade{" "}
            <span className={cn("font-semibold text-foreground", plan.points === 0 && "text-danger")}>
              {plan.grade}
            </span>
          </span>
        </p>

        <Cell label="Credits" htmlFor={`${id}-credits`}>
          <NumberInput
            id={`${id}-credits`}
            label={`${plan.title} credits`}
            value={shown(input.credits, erp?.course?.credits ?? DEFAULT_CREDITS)}
            placeholder="0"
            onChange={(v) => onChange({ credits: v })}
          />
          {plan.creditSource && !creditsTyped ? (
            <p className="mt-1 text-xs text-muted-foreground">{SOURCE_LABEL[plan.creditSource]}</p>
          ) : null}
        </Cell>
        <div className="flex items-center gap-2 lg:items-start lg:pt-2.5">
          <input
            id={`${id}-include`}
            type="checkbox"
            checked={plan.included}
            onChange={(e) => onChange({ include: e.target.checked })}
            className="h-5 w-5 accent-[hsl(var(--primary))]"
          />
          <label htmlFor={`${id}-include`} className="text-sm text-muted-foreground lg:sr-only">
            Count in GPA
          </label>
        </div>
      </div>
    </li>
  );
}

function Cell({
  label,
  htmlFor,
  wide,
  children,
}: {
  label: string;
  htmlFor?: string;
  /** Only shown in the wide (lg) grid; the phone layout states it another way. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", wide && "hidden lg:block")}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="mb-1 block text-xs text-muted-foreground lg:sr-only">
          {label}
        </label>
      ) : (
        <p className="mb-1 text-xs text-muted-foreground lg:sr-only">{label}</p>
      )}
      {children}
    </div>
  );
}

const figure = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));

function Figure({ value, strong }: { value: number; strong?: boolean }) {
  return (
    <p className={cn("text-base tabular-nums lg:pt-2.5 lg:text-sm", strong ? "font-semibold" : "font-medium")}>
      {figure(value)}
    </p>
  );
}

function NumberInput({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string | undefined;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      id={id}
      aria-label={label}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(sanitizeNumber(e.target.value))}
      className={cn(fieldClass, "px-2.5 tabular-nums")}
    />
  );
}

function LabeledField({
  id,
  label,
  value,
  placeholder,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  hint?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(sanitizeNumber(e.target.value))}
        className={cn(fieldClass, "mt-1.5 tabular-nums")}
      />
      {hint ? <p className="mt-1 text-micro text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Settings({
  settings,
  defaultScale,
  onChange,
}: {
  settings: PlannerSettings;
  defaultScale: GradeBand[];
  onChange: (patch: Partial<PlannerSettings>) => void;
}) {
  const setNumber = (key: "caeWeight" | "defaultOther", v: string) => {
    const n = parseNumber(v);
    if (n !== null) onChange({ [key]: n });
  };
  const setBand = (index: number, patch: { min?: number; points?: number }) =>
    onChange({
      scale: settings.scale.map((b, i) => (i === index ? { ...b, ...patch } : b)),
      scaleEdited: true,
    });

  return (
    <details className="group border-t border-border pt-4">
      <summary className="focusable flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-foreground marker:content-none lg:min-h-9">
        Formula and grade bands
        <span className="text-sm font-normal text-primary group-open:hidden">Edit</span>
        <span className="hidden text-sm font-normal text-primary group-open:inline">Close</span>
      </summary>

      <div className="mt-4 space-y-8">
        <p className="max-w-2xl text-body leading-relaxed text-muted-foreground">
          Internal = (CAE 1 + CAE 2) × weight + assignment and attendance, capped at the
          subject&apos;s internal maximum. Total = internal + external. Maxima and credits come
          from the official curriculum. Editing the bands here never changes your Results page.
        </p>

        <div className="grid max-w-xl grid-cols-2 gap-4">
          <SettingField id="w" label="CAE weight" value={settings.caeWeight} onChange={(v) => setNumber("caeWeight", v)} />
          <SettingField id="do" label="Assign. + att. default" value={settings.defaultOther} onChange={(v) => setNumber("defaultOther", v)} />
        </div>

        <div className="max-w-xl">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Grade bands</h3>
            <button
              type="button"
              onClick={() => onChange({ scale: defaultScale, scaleEdited: false })}
              className="focusable min-h-11 text-sm font-medium text-primary underline-offset-4 hover:underline lg:min-h-0"
            >
              Restore official bands
            </button>
          </div>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Grade</th>
                <th className="py-2 pr-3 font-medium">Lowest %</th>
                <th className="py-2 font-medium">Grade points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {settings.scale.map((b, i) => (
                <tr key={b.grade}>
                  <th scope="row" className="py-2 pr-3 text-left font-semibold">
                    {b.grade}
                  </th>
                  <td className="py-1.5 pr-3">
                    <BandInput label={`${b.grade} lowest percentage`} value={b.min} onChange={(n) => setBand(i, { min: n })} />
                  </td>
                  <td className="py-1.5">
                    <BandInput label={`${b.grade} grade points`} value={b.points} onChange={(n) => setBand(i, { points: n })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

function SettingField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: string) => void;
}) {
  const [text, setText] = React.useState(String(value));
  return (
    <div>
      <label htmlFor={`set-${id}`} className={cn(labelClass, "block leading-snug")}>
        {label}
      </label>
      <input
        id={`set-${id}`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(e) => {
          const v = sanitizeNumber(e.target.value);
          setText(v);
          onChange(v);
        }}
        onBlur={() => setText(String(value))}
        className={cn(fieldClass, "mt-1.5 tabular-nums")}
      />
    </div>
  );
}

function BandInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = React.useState(String(value));
  return (
    <input
      aria-label={label}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={(e) => {
        const v = sanitizeNumber(e.target.value);
        setText(v);
        const n = parseNumber(v);
        if (n !== null) onChange(n);
      }}
      onBlur={() => setText(String(value))}
      className={cn(fieldClass, "w-24 tabular-nums")}
    />
  );
}

