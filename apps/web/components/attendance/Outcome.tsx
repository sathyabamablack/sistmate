import * as React from "react";
import { ArrowRight } from "lucide-react";
import type { Projection } from "@usp/core";
import { formatPct } from "@/lib/attendance";
import { cn } from "@/lib/utils";

/**
 * One subject in a planner's results: name, a detail line, and the figure now
 * and after the plan. The status badge is passed in, since the week planner and
 * the leave planner word it differently. Shared so both read the same.
 */
export function OutcomeRow({
  title,
  detail,
  now,
  after,
  badge,
  testId,
  tour,
  children,
  className,
}: {
  title: string;
  detail: React.ReactNode;
  now: Projection;
  after: Projection;
  badge: React.ReactNode;
  /** on the figure after the plan */
  testId?: string;
  tour?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <li data-tour={tour} className={cn("py-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body font-medium leading-snug text-foreground">{title}</p>
          <p className="mt-0.5 text-small tabular-nums text-muted-foreground">{detail}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <p className="flex items-center whitespace-nowrap text-small tabular-nums text-muted-foreground">
            <span className="sr-only">Now </span>
            {now.total > 0 ? formatPct(now.percentage) : "—"}
            <ArrowRight className="mx-1 h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">, after </span>
            <span data-testid={testId} className="font-display text-subheading font-semibold text-foreground">
              {after.total > 0 ? formatPct(after.percentage) : "—"}
            </span>
          </p>
          {badge}
        </div>
      </div>
      {children}
    </li>
  );
}
