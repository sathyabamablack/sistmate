import * as React from "react";
import { AlertCircle, CheckCircle2, CircleDashed, Clock } from "lucide-react";
import { cn, daysUntil, formatCurrency, formatDate } from "@/lib/utils";
import {
  groupFees,
  shortAcademicYear,
  summarizeFees,
  type FeeRow,
  type FeeStatus,
} from "@/lib/fee-ledger";
import type { FeeRecord } from "@usp/core";
import { Panel } from "@/components/ui/Panel";
import { Stat } from "@/components/ui/Stat";

function relativeDue(iso: string, now: Date): string {
  const d = daysUntil(iso, now);
  if (d === null) return "";
  if (d === 0) return "due today";
  if (d > 0) return `in ${d} day${d === 1 ? "" : "s"}`;
  return `${-d} day${d === -1 ? "" : "s"} overdue`;
}

function detailFor(row: FeeRow, now: Date): string {
  const parts: string[] = [];
  if (row.status === "paid") {
    if (row.paidDate) parts.push(`Paid ${formatDate(row.paidDate)}`);
    if (row.receiptNo) parts.push(`Receipt ${row.receiptNo}`);
  } else if (row.status === "due") {
    parts.push(
      row.dueDate
        ? `Due ${formatDate(row.dueDate)} (${relativeDue(row.dueDate, now)})`
        : "No due date published",
    );
  } else {
    parts.push(
      row.dueDate
        ? `Scheduled for ${formatDate(row.dueDate)}`
        : "Not published yet",
    );
  }
  return parts.join(" · ");
}

/** Status is icon + text + colour, never colour alone. */
function StatusMark({ status, overdue }: { status: FeeStatus; overdue: boolean }) {
  if (status === "paid") {
    return (
      <span className="inline-flex items-center gap-1.5 text-small font-medium text-success">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        Paid in full
      </span>
    );
  }
  if (status === "due") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-small font-medium",
          overdue ? "text-danger" : "text-warning",
        )}
      >
        {overdue ? (
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <Clock className="h-4 w-4 shrink-0" aria-hidden />
        )}
        {overdue ? "Overdue" : "Due"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-small text-muted-foreground">
      <CircleDashed className="h-4 w-4 shrink-0" aria-hidden />
      Not scheduled
    </span>
  );
}

/** Paid and outstanding as one stacked bar. The legend below repeats it in words. */
function BilledBar({ paid, due }: { paid: number; due: number }) {
  const total = paid + due;
  if (total <= 0) return null;
  const paidPct = (paid / total) * 100;
  const duePct = 100 - paidPct;
  return (
    <div className="space-y-2">
      <div
        role="img"
        aria-label={`${formatCurrency(paid)} paid and ${formatCurrency(due)} outstanding, out of ${formatCurrency(total)} billed`}
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
      >
        {paid > 0 ? (
          <div
            className="h-full bg-success transition-[width] duration-700 ease-out-quint"
            style={{ width: `${paidPct}%` }}
          />
        ) : null}
        {due > 0 ? (
          <div
            className="h-full bg-danger transition-[width] duration-700 ease-out-quint"
            style={{ width: `${duePct}%` }}
          />
        ) : null}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-micro text-muted-foreground" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-success" />
          Paid {Math.round(paidPct)}%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-danger" />
          Outstanding {Math.round(duePct)}%
        </span>
      </p>
    </div>
  );
}

export function FeeLedger({ fees, now }: { fees: FeeRecord[]; now: Date }) {
  const summary = summarizeFees(fees);
  const groups = groupFees(fees);
  const allRows = groups.flatMap((g) => g.rows);
  const dueRows = allRows.filter((r) => r.status === "due");
  const upcomingRows = allRows.filter((r) => r.status === "upcoming");
  const anyOverdue = dueRows.some((r) => r.dueDate && (daysUntil(r.dueDate, now) ?? 0) < 0);
  const showAmounts = summary.hasAmounts;

  const upcomingNames = upcomingRows
    .slice(0, 2)
    .map((r) => shortAcademicYear(r.period) || r.description);

  return (
    <div className="max-w-3xl space-y-8">
      {dueRows.length > 0 ? (
        <Panel tone={anyOverdue ? "danger" : "warning"} role="status" className="flex gap-3">
          {anyOverdue ? (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
          ) : (
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
          )}
          <div className="min-w-0">
            <p className="font-display text-subheading font-semibold text-foreground">
              {summary.dueTotal > 0
                ? `${formatCurrency(summary.dueTotal)} is outstanding`
                : `${dueRows.length} ${dueRows.length === 1 ? "fee" : "fees"} due`}
            </p>
            <p className="mt-1 text-body text-muted-foreground">Pay on the ERP fee portal.</p>
          </div>
        </Panel>
      ) : (
        <Panel tone="accent" role="status" className="flex gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p className="min-w-0 text-body">
            <span className="font-display text-subheading font-semibold">Nothing is due.</span>
            {upcomingNames.length > 0 ? (
              <span>
                {" "}
                {upcomingNames.join(" and ")} {upcomingNames.length === 1 ? "isn't" : "aren't"} scheduled
                yet.
              </span>
            ) : null}
          </p>
        </Panel>
      )}

      {showAmounts ? (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Stat
              label="Outstanding"
              value={formatCurrency(summary.dueTotal)}
              className={cn(
                "col-span-2 sm:col-span-1",
                summary.dueTotal > 0 && "[&_dd>span]:text-danger",
              )}
            />
            <Stat label="Paid" value={formatCurrency(summary.paidTotal)} />
            <Stat label="Total billed" value={formatCurrency(summary.paidTotal + summary.dueTotal)} />
          </dl>
          <BilledBar paid={summary.paidTotal} due={summary.dueTotal} />
        </div>
      ) : null}

      {groups.map((g, gi) => (
        <section key={g.kind} aria-labelledby={`fee-group-${gi}`}>
          <h2 id={`fee-group-${gi}`} className="text-heading font-semibold text-foreground">
            {g.kind}
          </h2>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {g.rows.map((row, i) => {
              const overdue =
                row.status === "due" && row.dueDate ? (daysUntil(row.dueDate, now) ?? 0) < 0 : false;
              const detail = detailFor(row, now);
              return (
                <li
                  key={`${row.description}-${i}`}
                  className={cn(
                    "grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 py-4",
                    showAmounts ? "md:grid-cols-[1fr_11rem_8rem]" : "md:grid-cols-[1fr_11rem]",
                  )}
                >
                  <p className="col-start-1 row-start-1 min-w-0 text-body font-medium text-foreground">
                    {shortAcademicYear(row.period) || g.kind}
                  </p>
                  {showAmounts ? (
                    <p className="col-start-2 row-start-1 text-right text-body font-semibold tabular-nums text-foreground md:col-start-3">
                      {row.amount > 0 ? formatCurrency(row.amount) : "—"}
                    </p>
                  ) : null}
                  {detail ? (
                    <p className="col-span-2 row-start-2 text-small text-muted-foreground md:col-span-1 md:col-start-1">
                      {detail}
                    </p>
                  ) : null}
                  <div className="col-span-2 row-start-3 mt-1 md:col-span-1 md:col-start-2 md:row-span-2 md:row-start-1 md:mt-0 md:self-center">
                    <StatusMark status={row.status} overdue={overdue} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {showAmounts ? null : (
        <p className="text-body text-muted-foreground">
          The ERP reports a status for each year, but not amounts.
        </p>
      )}
    </div>
  );
}
