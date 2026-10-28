"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import Link from "@/components/ui/IntentLink";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { listSubjects, type PapersClient } from "@/components/papers/api";
import { cn } from "@/lib/utils";
import { needFor, needShort, planFor, topicProgress, topicsFor, type Need, type PlannerInputs } from "@/lib/prep";
import { usePlannerPlan, usePrepState } from "./store";

export interface PrepRow {
  code: string;
  title: string;
  /** "CIA-2 Examination in 11 days", when an exam is clearly this subject's. */
  exam: string | null;
}

/**
 * Paper counts per subject code, from the Worker's subject list (one cached request, also
 * used by the papers search). Empty until it arrives, and on any error.
 */
function usePaperCounts(client: PapersClient | null): Map<string, number> {
  const [counts, setCounts] = React.useState<Map<string, number>>(() => new Map());
  React.useEffect(() => {
    if (!client) return;
    let live = true;
    listSubjects(client)
      .then((list) => live && setCounts(new Map(list.map((s) => [s.code.toUpperCase(), s.papers]))))
      .catch(() => {
        /* counts are a nicety; the subject page lists the papers */
      });
    return () => {
      live = false;
    };
  }, [client]);
  return counts;
}

/** This semester's subjects: what each exam needs, how far revision has got. */
export function PrepList({
  rows,
  planner,
  papers,
}: {
  rows: PrepRow[];
  planner: PlannerInputs;
  papers: PapersClient | null;
}) {
  const resolved = usePlannerPlan(planner);
  const prep = usePrepState();
  const counts = usePaperCounts(papers);

  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => {
        const plan = planFor(resolved, r.code);
        const progress = topicProgress(topicsFor(prep, r.code));
        const count = counts.get(r.code) ?? 0;
        const meta = [r.code, r.exam, count > 0 ? `${count} ${count === 1 ? "paper" : "papers"}` : null].filter(Boolean);
        return (
          <li key={r.code}>
            <Link
              href={`/prep/${r.code}`}
              className="focusable group -mx-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 rounded-lg px-2 py-3.5 transition-colors hover:bg-muted/60 sm:grid-cols-[minmax(0,1fr)_9.5rem_8rem_1rem]"
            >
              <div className="min-w-0">
                <p className="text-body font-medium text-foreground">{r.title}</p>
                <p className="text-small text-muted-foreground">{meta.join(" · ")}</p>
              </div>
              <ChevronRight
                className="col-start-2 row-start-1 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:col-start-4"
                aria-hidden
              />
              <div className="col-span-2 flex items-center justify-between gap-4 sm:contents">
                <NeedShort need={plan ? needFor(plan) : null} />
                <div className="w-32 shrink-0 sm:col-start-3 sm:row-start-1 sm:w-auto">
                  <p className="mb-1 text-right text-micro tabular-nums text-muted-foreground sm:text-left">
                    {progress.total > 0 ? `${progress.done} of ${progress.total} revised` : "No topics"}
                  </p>
                  <ProgressBar
                    value={progress.percent}
                    tone={progress.total > 0 && progress.done === progress.total ? "success" : "primary"}
                    className="h-1.5"
                    aria-label={`${r.title} revision`}
                  />
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function NeedShort({ need }: { need: Need | null }) {
  const base = "min-w-0 text-small sm:col-start-2 sm:row-start-1";
  if (!need) return <p className={cn(base, "text-muted-foreground")}>Not in the planner</p>;
  if (need.kind === "no-exam") return <p className={cn(base, "text-muted-foreground")}>{needShort(need)}</p>;
  if (need.kind === "out-of-reach") {
    return (
      <p className={base}>
        <span className="block font-semibold text-danger">{needShort(need)}</span>
        <span className="block text-micro text-muted-foreground">Best is {need.best}</span>
      </p>
    );
  }
  return (
    <p className={cn(base, "text-muted-foreground")}>
      <span className="sr-only">Need </span>
      <span className="text-subheading font-semibold tabular-nums text-foreground">
        {need.paper}/{need.paperMax}
      </span>{" "}
      for {need.target}
    </p>
  );
}
