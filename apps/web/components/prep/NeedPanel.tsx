"use client";

import { AlertCircle, ArrowRight } from "lucide-react";
import Link from "@/components/ui/IntentLink";
import { goalNote, needFor, needSentence, planFor, type PlannerInputs } from "@/lib/prep";
import { usePlannerPlan } from "./store";

const figure = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));

/**
 * The semester exam marks this subject's target takes, from the student's saved CGPA planner.
 * Worked out with the planner's own functions, so it always says what the planner says.
 */
export function NeedPanel({ code, planner }: { code: string; planner: PlannerInputs }) {
  const resolved = usePlannerPlan(planner);
  const plan = planFor(resolved, code);
  const need = plan ? needFor(plan) : null;
  const note = goalNote(resolved);

  return (
    <section aria-labelledby="need-heading" className="rounded-xl bg-accent/45 p-4 sm:p-5">
      <h2 id="need-heading" className="text-heading font-semibold text-foreground">
        What you need
      </h2>

      <div aria-live="polite" className="mt-3">
        {!plan || !need ? (
          <p className="text-body text-foreground">This subject isn&apos;t in the CGPA planner.</p>
        ) : need.kind === "need" ? (
          <>
            <p className="sr-only">{needSentence(need)}</p>
            <div aria-hidden>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-5xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
                  {need.paper}
                  <span className="text-heading font-semibold text-muted-foreground">/{need.paperMax}</span>
                </span>
                <span className="text-body text-foreground">in the exam</span>
              </p>
              <p className="mt-2 text-body text-foreground">
                {need.converted ? `${need.converted.marks}/${need.converted.max} after conversion, ` : ""}for{" "}
                <strong className="font-semibold">{need.target}</strong>
                {need.passOnly ? ", just the pass mark" : ""}
              </p>
            </div>
          </>
        ) : need.kind === "out-of-reach" ? (
          <p className="flex gap-2 text-body">
            <AlertCircle className="mt-1 h-4 w-4 shrink-0 text-danger" aria-hidden />
            <span>
              <span className="font-semibold text-danger">{need.target} is out of reach.</span>{" "}
              <span className="text-foreground">
                The best you can get is <strong className="font-semibold">{need.best}</strong>, with full marks in the
                exam.
              </span>
            </span>
          </p>
        ) : (
          <p className="text-body text-foreground">{needSentence(need)}</p>
        )}
      </div>

      {plan ? (
        <p className="mt-3 text-small text-muted-foreground">
          Internal marks {figure(plan.internal)}/{plan.internalMax}.
          {plan.externalEntered !== null && plan.externalMax > 0
            ? ` You expect ${figure((plan.externalEntered * plan.paperMax) / plan.externalMax)}/${plan.paperMax}, which gives ${plan.grade}.`
            : ""}
          {note ? ` ${note}` : ""}
          {!plan.included ? " Not counted in your GPA." : ""}
        </p>
      ) : null}

      <Link
        href="/calculator"
        className="focusable mt-3 inline-flex min-h-11 items-center gap-1 rounded-md text-small font-semibold text-primary underline-offset-4 hover:underline lg:min-h-0"
      >
        Change in CGPA planner
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </section>
  );
}
