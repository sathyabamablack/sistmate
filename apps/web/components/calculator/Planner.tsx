"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, ChevronDown } from "lucide-react";
import { DEFAULT_GRADE_SCALE, type CreditSource, type GradeBand } from "@usp/core";
import { Section } from "@/components/ui/Section";
import { fieldClass, labelClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CREDITS,
  defaultState,
  goalStatus,
  parseNumber,
  parseState,
  resolveGoal,
  sanitizeNumber,
  withPreviousFallback,
  withPresetScale,
  type GoalStatus,
  type NumberGoal,
  type PaperGroup,
  type PlannerResult,
  type PlannerSettings,
  type PlannerState,
  type PlannerSubject,
  type PreviousStanding,
  type ResolvedGoal,
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

/**
 * One subject per row. On phones the row stacks: name and result, then the internal
 * marks, then the exam. From lg up the groups dissolve (`lg:contents`) into one grid row
 * under the column headings.
 */
const COLUMNS =
  "lg:grid-cols-[1.5rem_minmax(0,1.6fr)_4.25rem_4.25rem_4.75rem_3.5rem_minmax(11rem,1fr)_4.5rem]";

const gradeOption = (b: GradeBand) => `${b.grade} (${b.min}% or more)`;
/** Only passing bands make sense as a target. */
const targetBands = (scale: GradeBand[]) => scale.filter((b) => b.points > 0);
const SOURCE_LABEL: Record<CreditSource, string> = {
  official: "official",
  estimated: "estimated",
  custom: "edited",
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type AimKind = "grade" | NumberGoal["kind"];
const AIMS: { kind: AimKind; label: string }[] = [
  { kind: "grade", label: "Grade" },
  { kind: "gpa", label: "Semester GPA" },
  { kind: "cgpa", label: "CGPA" },
];

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
  const resolved = React.useMemo(() => resolveGoal(state, subjects), [state, subjects]);
  const plan = resolved.plan;
  // While aiming for a number, one grade is worked out for every subject.
  const aimingForNumber = !!resolved.number;

  const patchSubject = (code: string, patch: Partial<SubjectInput>) =>
    save({ ...base, subjects: { ...base.subjects, [code]: { ...base.subjects[code], ...patch } } });
  const patchSettings = (patch: Partial<PlannerSettings>) =>
    save({ ...base, settings: { ...base.settings, ...patch } });
  const setAim = (kind: AimKind) => {
    const current = base.settings.goal;
    if (kind === "grade") {
      // Keep the grade the number worked out to, so switching back shows the same plan.
      const settings: PlannerSettings = {
        ...base.settings,
        targetGrade: resolved.number?.grade ?? base.settings.targetGrade,
      };
      delete settings.goal;
      save({ ...base, settings });
    } else if (current?.kind !== kind) {
      patchSettings({ goal: { kind, value: current?.value ?? "" } });
    }
  };
  const setPrevious = (patch: Partial<PlannerState["previous"]>) =>
    save({ ...base, previous: { ...base.previous, ...patch } });

  const fromEstimate = {
    cgpa: !!estimatedPrevious && base.previous.cgpa.trim() === "",
    credits: !!estimatedPrevious && base.previous.credits.trim() === "",
  };

  return (
    <div className="space-y-10">
      <section aria-label="Semester summary" className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
        <Goal
          settings={state.settings}
          resolved={resolved}
          onAim={setAim}
          onGrade={(grade) => patchSettings({ targetGrade: grade })}
          onNumber={(value) => patchSettings({ goal: { kind: base.settings.goal?.kind ?? "gpa", value } })}
        />
        <Outcome
          plan={plan}
          previous={state.previous}
          fromEstimate={fromEstimate}
          onPrevious={setPrevious}
        />
      </section>

      <Section
        title="Your subjects"
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
            ? "CAE marks are filled in from your ERP. Change any of them to see what you need in the exam."
            : "Type your CAE marks to see what you need in the exam."}
        </p>

        <div
          className={cn(
            "hidden gap-x-3 border-b border-border pb-2 text-xs font-medium text-muted-foreground lg:grid",
            COLUMNS,
          )}
          aria-hidden
        >
          <span title="Count in GPA">✓</span>
          <span>Subject</span>
          <span>CAE 1</span>
          <span>CAE 2</span>
          <span>Assign. + att.</span>
          <span>Internal</span>
          <span>Exam marks needed</span>
          <span>Grade</span>
        </div>

        <ul className="divide-y divide-border">
          {plan.subjects.map((p) => (
            <SubjectRow
              key={p.code}
              plan={p}
              input={base.subjects[p.code] ?? {}}
              erp={subjects.find((s) => s.code === p.code)}
              settings={state.settings}
              aimingForNumber={aimingForNumber}
              onChange={(patch) => patchSubject(p.code, patch)}
            />
          ))}
        </ul>
      </Section>

      <Settings
        settings={state.settings}
        defaultScale={presetScale ?? DEFAULT_GRADE_SCALE}
        onChange={patchSettings}
      />
    </div>
  );
}

/** What the student aims for: a grade, or a semester GPA / CGPA worked back to one. */
function Goal({
  settings,
  resolved,
  onAim,
  onGrade,
  onNumber,
}: {
  settings: PlannerSettings;
  resolved: ResolvedGoal;
  onAim: (kind: AimKind) => void;
  onGrade: (grade: string) => void;
  onNumber: (value: string) => void;
}) {
  const aim: AimKind = settings.goal?.kind ?? "grade";
  const status = goalStatus(resolved.plan);

  return (
    <div className="rounded-xl bg-accent/45 p-4 sm:p-5">
      <h2 className="text-heading font-semibold text-foreground">What are you aiming for?</h2>
      <div role="radiogroup" aria-label="Aim for" className="mt-3 flex flex-wrap gap-1.5">
        {AIMS.map((a) => (
          <button
            key={a.kind}
            type="button"
            role="radio"
            aria-checked={aim === a.kind}
            onClick={() => onAim(a.kind)}
            className={cn(
              "focusable min-h-11 rounded-full px-4 text-small font-semibold transition-colors lg:min-h-9",
              aim === a.kind
                ? "bg-primary text-primary-foreground"
                : "bg-surface text-foreground ring-1 ring-border hover:bg-muted",
            )}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="mt-4 max-w-sm">
        {aim === "grade" ? (
          <>
            <label htmlFor="target-grade" className={cn(labelClass, "block")}>
              Target grade
            </label>
            <select
              id="target-grade"
              value={settings.targetGrade}
              onChange={(e) => onGrade(e.target.value)}
              className={cn(fieldClass, "mt-1.5")}
            >
              {targetBands(settings.scale).map((b) => (
                <option key={b.grade} value={b.grade}>
                  {gradeOption(b)}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label htmlFor="goal-value" className={cn(labelClass, "block")}>
              {aim === "gpa" ? "Target semester GPA" : "Target CGPA"}
            </label>
            <input
              id="goal-value"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={settings.goal?.value ?? ""}
              placeholder="8.5"
              onChange={(e) => onNumber(sanitizeNumber(e.target.value))}
              className={cn(fieldClass, "mt-1.5 tabular-nums")}
            />
          </>
        )}
      </div>

      <div aria-live="polite" className="mt-4 space-y-2 text-body leading-relaxed">
        {aim !== "grade" ? <NumberAnswer resolved={resolved} /> : null}
        {status && !(resolved.number && !resolved.number.grade) ? <StatusLines status={status} /> : null}
      </div>
    </div>
  );
}

/** The grade a typed semester GPA or CGPA works out to, or why it doesn't. */
function NumberAnswer({ resolved }: { resolved: ResolvedGoal }) {
  const n = resolved.number;
  if (!n) return <p className="text-muted-foreground">Type a number to see the grade it takes.</p>;
  if (n.issue === "no-credits") return <p className="text-foreground">Count at least one subject to work this out.</p>;
  if (n.issue === "needs-previous") {
    return <p className="text-foreground">Add your CGPA so far and credits completed, under Projected CGPA, first.</p>;
  }
  const need = n.needGpa!;
  if (n.issue === "out-of-reach") {
    return (
      <p className="font-semibold text-danger">
        {n.kind === "cgpa"
          ? `That takes a semester GPA of ${need.toFixed(2)}, but the most your marks allow is ${n.bestGpa!.toFixed(2)}.`
          : `${n.target} is out of reach this semester. The most your marks allow is ${n.bestGpa!.toFixed(2)}.`}{" "}
        <span className="font-normal text-muted-foreground">Below is the best you can do.</span>
      </p>
    );
  }
  if (need <= 0) {
    return <p className="text-foreground">Your CGPA stays at {n.target} or more as long as you pass every subject.</p>;
  }
  return (
    <p className="text-foreground">
      {n.kind === "cgpa" ? <>That takes a semester GPA of {need.toFixed(2)}. </> : null}
      Get <strong className="font-semibold">{n.grade}</strong> in every subject for a semester GPA of{" "}
      {resolved.plan.gpa.toFixed(2)}.
    </p>
  );
}

/** Two plain lines: what the exams need on average, and which targets can't be reached. */
function StatusLines({ status }: { status: GoalStatus }) {
  const which = status.sharedTarget ?? "your target";
  if (status.allSecured) {
    return (
      <p className="flex gap-2 text-foreground">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
        <span>Your internal marks already secure {which}. You still need 30% of each exam to pass.</span>
      </p>
    );
  }
  const out = status.outOfReach;
  const bests = new Set(out.map((p) => p.bestGrade));
  // Lead with marks on the paper (theory is written for 100 and converted to 50).
  const groups = status.papers;
  const others = groups.filter((g) => !g.converted).length;
  const where = (g: PaperGroup) =>
    g.converted ? "on theory papers" : others === 1 ? "on the other exams" : `on ${g.paperMax}-mark exams`;
  return (
    <>
      {status.needing > 0 ? (
        <p className="flex gap-2 text-foreground">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
          <span>
            {out.length > 0 ? `In ${plural(status.needing, "subject")}, you` : "You"} need about{" "}
            {groups.length === 1 ? (
              <>
                <strong className="font-semibold tabular-nums">
                  {groups[0]!.averagePaperNeeded}/{groups[0]!.paperMax}
                </strong>{" "}
                in each exam
                {groups[0]!.converted ? ` (${groups[0]!.averageNeeded}/${groups[0]!.externalMax} after conversion)` : ""}
              </>
            ) : (
              groups.map((g, i) => (
                <React.Fragment key={`${g.paperMax}/${g.externalMax}`}>
                  {i > 0 ? (i === groups.length - 1 ? " and " : ", ") : null}
                  <strong className="font-semibold tabular-nums">
                    {g.averagePaperNeeded}/{g.paperMax}
                  </strong>{" "}
                  {where(g)}
                </React.Fragment>
              ))
            )}{" "}
            for {which}.
          </span>
        </p>
      ) : null}
      {out.length > 0 ? (
        <p className="flex gap-2 text-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
          <span>
            {plural(out.length, "subject")} can&apos;t reach {status.sharedTarget ?? "their target"} even with full exam
            marks{bests.size === 1 ? `; the best there is ${[...bests][0]}` : ""}.
          </span>
        </p>
      ) : null}
    </>
  );
}

/** The two numbers the plan leads to, with the standing the CGPA builds on right beside it. */
function Outcome({
  plan,
  previous,
  fromEstimate,
  onPrevious,
}: {
  plan: PlannerResult;
  previous: PlannerState["previous"];
  fromEstimate: { cgpa: boolean; credits: boolean };
  onPrevious: (patch: Partial<PlannerState["previous"]>) => void;
}) {
  const counted = plan.subjects.filter((s) => s.included && s.credits > 0).length;
  const hasPrevious = parseNumber(previous.cgpa) !== null && parseNumber(previous.credits) !== null;
  return (
    <div className="grid grid-cols-2 content-start gap-x-6 gap-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Semester GPA</p>
        <p className="mt-1 text-5xl font-semibold leading-none tracking-tight tabular-nums">
          {plan.credits > 0 ? plan.gpa.toFixed(2) : "–"}
        </p>
        <p className="mt-2 text-body text-muted-foreground">
          {plan.credits > 0
            ? `${plural(counted, "subject")}, ${plural(plan.credits, "credit")}.`
            : "Tick a subject to count it."}
        </p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Projected CGPA</p>
        <p className="mt-1 text-5xl font-semibold leading-none tracking-tight tabular-nums">
          {plan.cgpa !== null ? plan.cgpa.toFixed(2) : "–"}
        </p>
        <p className="mt-2 text-body text-muted-foreground">
          {hasPrevious ? "With this semester added." : "Add your CGPA so far below."}
        </p>
      </div>

      <div className="col-span-2 border-t border-border pt-4">
        <p className="text-small font-semibold text-foreground">Before this semester</p>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <SmallField
            id="prev-cgpa"
            label="CGPA so far"
            value={previous.cgpa}
            placeholder="8.25"
            onChange={(v) => onPrevious({ cgpa: v })}
          />
          <SmallField
            id="prev-credits"
            label="Credits completed"
            value={previous.credits}
            placeholder="60"
            onChange={(v) => onPrevious({ credits: v })}
          />
        </div>
        <p className="mt-2 text-small text-muted-foreground">
          {fromEstimate.cgpa || fromEstimate.credits
            ? "Estimated from your ERP marks. Type the figures on your grade sheet to be exact."
            : "From your last grade sheet."}
        </p>
      </div>
    </div>
  );
}

function SubjectRow({
  plan,
  input,
  erp,
  settings,
  aimingForNumber,
  onChange,
}: {
  plan: SubjectPlan;
  input: SubjectInput;
  erp: PlannerSubject | undefined;
  settings: PlannerSettings;
  aimingForNumber: boolean;
  onChange: (patch: Partial<SubjectInput>) => void;
}) {
  const id = `s-${plan.code}`;
  const [open, setOpen] = React.useState(false);
  // ERP scores and defaults show as real values; clearing a field falls back to them.
  const shown = (typed: string | undefined, fallback: string | number | null | undefined) =>
    typed ?? (fallback == null ? undefined : String(fallback));
  const creditsTyped = (input.credits ?? "").trim() !== "";
  const ownTarget =
    !aimingForNumber && settings.scale.some((b) => b.grade === input.target) ? input.target! : "";

  return (
    <li className={cn("py-5 lg:py-3", !plan.included && "opacity-55")}>
      <div className={cn("grid grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-x-3 gap-y-3 lg:items-start lg:gap-y-0", COLUMNS)}>
        <div className="col-start-1 row-start-1 pt-0.5 lg:col-auto lg:row-auto lg:pt-2.5">
          <input
            id={`${id}-include`}
            type="checkbox"
            checked={plan.included}
            onChange={(e) => onChange({ include: e.target.checked })}
            aria-label={`Count ${plan.title} in GPA`}
            className="h-5 w-5 accent-[hsl(var(--primary))]"
          />
        </div>

        <div className="col-start-2 row-start-1 min-w-0 lg:col-auto lg:row-auto lg:pt-1.5">
          <p className="text-base font-medium leading-snug text-foreground lg:text-sm">{plan.title}</p>
          <p className="text-xs text-muted-foreground">
            {plan.code}
            {plan.audit ? ", audit course" : `, ${plural(plan.credits, "credit")}`}
            {plan.maxTotal !== 100 ? `, out of ${plan.maxTotal}` : ""}
            {ownTarget ? `, aiming for ${ownTarget}` : ""}
            {plan.externalEntered !== null
              ? `, expecting ${figure(onPaper(plan.externalEntered, plan))}/${plan.paperMax}`
              : ""}
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`${id}-more`}
              onClick={() => setOpen((o) => !o)}
              className="focusable ml-1.5 inline-flex min-h-6 items-center gap-0.5 rounded-sm align-middle font-medium text-primary underline-offset-2 hover:underline"
            >
              Change<span className="sr-only"> credits, target and expected marks for {plan.title}</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
            </button>
          </p>
        </div>

        {/* Internal marks: three inputs and what they add up to. */}
        <div className="col-span-2 col-start-2 row-start-2 grid grid-cols-4 gap-2 lg:contents">
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
          <Cell label="Assign. + att." htmlFor={`${id}-other`}>
            <NumberInput
              id={`${id}-other`}
              label={`${plan.title} assignment and attendance marks`}
              value={shown(input.other, settings.defaultOther)}
              placeholder="0"
              onChange={(v) => onChange({ other: v })}
            />
          </Cell>
          <Cell label="Internal">
            <p className="pt-2.5 text-base tabular-nums lg:text-sm">
              <span className="font-semibold text-foreground">{figure(plan.internal)}</span>
              <span className="text-muted-foreground">/{plan.internalMax}</span>
            </p>
          </Cell>
        </div>

        {/* The semester exam: what the target needs. */}
        <div className="col-span-2 col-start-2 row-start-3 lg:contents">
          <Cell label="Exam marks needed">
            <Needed plan={plan} />
          </Cell>
        </div>

        <div className="col-start-3 row-start-1 text-right lg:col-auto lg:row-auto lg:pt-1.5 lg:text-left">
          <p className={cn("text-xl font-semibold leading-tight lg:text-base", plan.points === 0 && "text-danger")}>
            <span className="sr-only">Grade </span>
            {plan.grade}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {figure(plan.total)} of {plan.maxTotal}
          </p>
        </div>

        {open ? (
          <div
            id={`${id}-more`}
            className="col-span-2 col-start-2 row-start-4 flex flex-wrap items-start gap-x-6 gap-y-3 rounded-lg bg-muted/50 p-3 lg:col-span-7 lg:col-start-2 lg:row-auto lg:mt-3"
          >
            <div className="w-24">
              <label htmlFor={`${id}-credits`} className="mb-1 block text-xs text-muted-foreground">
                Credits
              </label>
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
            </div>
            <div className="min-w-0 max-w-64 flex-1">
              <label htmlFor={`${id}-target`} className="mb-1 block text-xs text-muted-foreground">
                Aim for in this subject
              </label>
              <select
                id={`${id}-target`}
                aria-label={`${plan.title} target grade`}
                value={ownTarget}
                disabled={aimingForNumber}
                onChange={(e) => onChange({ target: e.target.value || undefined })}
                className={cn(fieldClass, "px-2.5 disabled:opacity-60")}
              >
                <option value="">Same as above ({aimingForNumber ? plan.target : settings.targetGrade})</option>
                {targetBands(settings.scale).map((b) => (
                  <option key={b.grade} value={b.grade}>
                    {gradeOption(b)}
                  </option>
                ))}
              </select>
              {aimingForNumber ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  While you aim for a GPA, every subject gets the same grade.
                </p>
              ) : null}
            </div>
            {plan.externalMax > 0 ? (
              <div className="w-44">
                <label htmlFor={`${id}-ext`} className="mb-1 block text-xs text-muted-foreground">
                  Exam marks you expect (of {plan.paperMax})
                </label>
                <PaperInput
                  id={`${id}-ext`}
                  label={`${plan.title} expected exam marks`}
                  stored={input.external}
                  plan={plan}
                  onChange={(v) => onChange({ external: v })}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {plan.externalEntered === null
                    ? "Leave empty to see what you need."
                    : plan.paperMax !== plan.externalMax
                      ? `${figure(plan.externalEntered)}/${plan.externalMax} after conversion.`
                      : "Clear it to see what you need."}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** The answer for one subject: exam marks the target needs, or that it can't be reached. */
function Needed({ plan }: { plan: SubjectPlan }) {
  if (plan.externalMax <= 0) {
    return <p className="pt-2.5 text-small text-muted-foreground">No semester exam</p>;
  }
  if (!plan.reachable) {
    return (
      <p className="pt-2 text-small leading-snug">
        <span className="font-semibold text-danger">{plan.target} is out of reach</span>{" "}
        <span className="text-muted-foreground">(best is {plan.bestGrade})</span>
      </p>
    );
  }
  const passOnly = plan.secured && plan.needed === plan.externalMin;
  // A theory paper is written for 100 and converted to 50: lead with the mark on the paper.
  const converted = plan.paperMax !== plan.externalMax;
  return (
    <div className="pt-1.5 leading-snug">
      <p>
        <span className="sr-only">Need </span>
        <span className="text-xl font-semibold tabular-nums text-foreground lg:text-lg">{plan.paperNeeded}</span>
        <span className="text-small text-muted-foreground">/{plan.paperMax} in the exam</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {converted ? `${plan.needed}/${plan.externalMax} after conversion, ` : ""}for {plan.target}
        {passOnly ? ", just the pass mark" : ""}
      </p>
    </div>
  );
}

/** Exam marks as the student would see them on the paper (out of 100 for a converted theory exam). */
const onPaper = (marks: number, plan: SubjectPlan) =>
  plan.externalMax > 0 ? (marks * plan.paperMax) / plan.externalMax : marks;

/**
 * Exam marks typed on the paper's scale, saved on the converted scale (`SubjectInput.external`)
 * so earlier saves keep their meaning. Holds its own text so "7." survives while typing.
 */
function PaperInput({
  id,
  label,
  stored,
  plan,
  onChange,
}: {
  id: string;
  label: string;
  stored: string | undefined;
  plan: SubjectPlan;
  onChange: (v: string) => void;
}) {
  const shown = (v: string | undefined) => {
    const n = parseNumber(v);
    return n === null ? "" : figure(onPaper(n, plan));
  };
  const toStored = (t: string) => {
    const n = parseNumber(t);
    return n === null ? null : plan.paperMax > 0 ? (n * plan.externalMax) / plan.paperMax : n;
  };
  const [text, setText] = React.useState(() => shown(stored));
  // Follow changes made elsewhere (Reset, another tab) without fighting the typing. Compared as
  // displayed, so the check settles after one update ("7." and "7" both show as 7).
  const typed = parseNumber(text);
  if ((typed === null ? "" : figure(typed)) !== shown(stored)) setText(shown(stored));

  return (
    <input
      id={id}
      aria-label={label}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      placeholder={`of ${plan.paperMax}`}
      onChange={(e) => {
        const v = sanitizeNumber(e.target.value);
        setText(v);
        const n = toStored(v);
        onChange(n === null ? "" : String(n));
      }}
      className={cn(fieldClass, "px-2.5 tabular-nums")}
    />
  );
}

function Cell({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="mb-1 block truncate text-xs text-muted-foreground lg:sr-only">
          {label}
        </label>
      ) : (
        <p aria-hidden className="mb-1 truncate text-xs text-muted-foreground lg:hidden">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

const figure = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));

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

function SmallField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="w-32">
      <label htmlFor={id} className="mb-1 block text-xs text-muted-foreground">
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
        className={cn(fieldClass, "tabular-nums")}
      />
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
        How marks are worked out
        <span className="text-sm font-normal text-primary group-open:hidden">Show</span>
        <span className="hidden text-sm font-normal text-primary group-open:inline">Hide</span>
      </summary>

      <div className="mt-4 space-y-8">
        <p className="max-w-2xl text-body leading-relaxed text-muted-foreground">
          Internal = (CAE 1 + CAE 2) × weight + assignment and attendance, capped at the
          subject&apos;s internal maximum. Total = internal + exam. You also need 30% of the exam to
          pass. Maxima and credits come from the official curriculum. Editing the bands here never
          changes your Results page.
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
