import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "@/components/ui/IntentLink";
import { requireDashboardData } from "@/lib/data";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";

export const metadata: Metadata = { title: "Marks" };
export const dynamic = "force-dynamic";

export default async function MarksPage() {
  const data = await requireDashboardData();
  const subjects = data.marks;
  const hasPastResults = data.results.some((s) => s.results.length > 0);
  const marksIssue = data.issues.some((i) => i.section === "marks");

  return (
    <div>
      <PageHeader
        title="Marks"
        description="Continuous assessment (CAE) marks for the current term, subject by subject."
      />

      {subjects.length > 0 ? (
        <div className="grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-2">
          {subjects.map((s, i) => {
            const pct =
              s.total !== null && s.maxTotal ? (s.total / s.maxTotal) * 100 : null;
            return (
              <section
                key={s.code}
                aria-labelledby={`m-${s.code}`}
                className="enter"
                style={{ "--i": Math.min(i, 5) } as CSSProperties}
              >
                <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
                  <div className="min-w-0">
                    <h2 id={`m-${s.code}`} className="text-subheading font-semibold text-foreground">
                      {s.title}
                    </h2>
                    <p className="text-small tabular-nums text-muted-foreground">{s.code}</p>
                  </div>
                  {s.total !== null && s.maxTotal !== null ? (
                    <p className="shrink-0 text-right font-display text-heading font-semibold leading-none tabular-nums text-foreground">
                      {s.total}
                      <span className="text-body font-normal text-muted-foreground"> / {s.maxTotal}</span>
                      {pct !== null ? (
                        <span className="mt-1.5 block font-sans text-small font-normal text-muted-foreground">
                          {pct.toFixed(0)}%
                        </span>
                      ) : null}
                    </p>
                  ) : (
                    <p className="shrink-0 text-small text-muted-foreground">Not totalled yet</p>
                  )}
                </div>
                {s.components.length > 0 ? (
                  <ul className="divide-y divide-border">
                    {s.components.map((c) => {
                      const cpct =
                        c.scored !== null && c.max > 0 ? (c.scored / c.max) * 100 : null;
                      return (
                        <li
                          key={c.name}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_5.5rem]"
                        >
                          <span className="text-body text-foreground">{c.name}</span>
                          <div className="order-last col-span-2 sm:order-none sm:col-span-1">
                            {cpct !== null ? (
                              <ProgressBar
                                value={cpct}
                                tone={toneFor(cpct)}
                                aria-label={`${c.name} score`}
                              />
                            ) : (
                              <div className="h-2 rounded-full bg-muted/60" aria-hidden />
                            )}
                          </div>
                          <span className="text-right text-body tabular-nums">
                            {c.scored === null ? (
                              <span className="text-muted-foreground">
                                Pending{c.max > 0 ? ` / ${c.max}` : ""}
                              </span>
                            ) : (
                              <>
                                <span className="font-semibold text-foreground">{c.scored}</span>
                                {c.max > 0 ? (
                                  <span className="text-muted-foreground"> / {c.max}</span>
                                ) : null}
                              </>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="py-3 text-body text-muted-foreground">
                    No components yet.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={
            marksIssue
              ? "Couldn't load CAE marks"
              : "CAE marks haven't been published for this term"
          }
          description={
            marksIssue
              ? "The ERP did not answer the internal-assessment request. Use Refresh in the top bar to try again."
              : "Nothing published for this semester yet."
          }
        >
          <p className="text-body text-muted-foreground">
            {hasPastResults ? (
              <>
                End-semester marks for earlier terms are under{" "}
                <Link href="/results" className="font-semibold text-primary underline underline-offset-4 focusable rounded-sm">
                  Results
                </Link>
                . Meanwhile, check{" "}
              </>
            ) : (
              <>Meanwhile, check </>
            )}
            <Link href="/attendance" className="font-semibold text-primary underline underline-offset-4 focusable rounded-sm">
              attendance
            </Link>
            .
          </p>
        </EmptyState>
      )}
    </div>
  );
}

function toneFor(pct: number | null): "primary" | "success" | "warning" | "danger" {
  if (pct === null) return "primary";
  if (pct >= 75) return "success";
  if (pct >= 50) return "warning";
  return "danger";
}
