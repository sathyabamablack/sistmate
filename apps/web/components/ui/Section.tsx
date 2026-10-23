import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Page section: a heading, optional right-aligned action, then content.
 * No box, no shadow: structure comes from type size and spacing.
 */
export function Section({
  title,
  action,
  children,
  className,
  id,
  tour,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  /** `data-tour` hook for the first-time walkthrough (lib/tour.ts). */
  tour?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={className} data-tour={tour}>
      <div className="flex min-h-9 items-center justify-between gap-3">
        <h2 id={headingId} className="text-heading font-semibold text-foreground">
          {title}
        </h2>
        {action ? <div className="shrink-0 text-small">{action}</div> : null}
      </div>
      <div className="pt-(--space-head)">{children}</div>
    </section>
  );
}

/** Quiet text link for section actions ("All notices", "Details"). */
export const sectionLinkClass =
  "inline-flex min-h-11 items-center rounded-md text-small font-semibold text-primary underline-offset-4 hover:underline focusable lg:min-h-0";

/** Label / value rows separated by hairlines. */
export function KeyValueList({
  items,
  className,
}: {
  items: { label: string; value: React.ReactNode; hint?: React.ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={cn("divide-y divide-border", className)}>
      {items.map((it) => (
        <div key={it.label} className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-small text-muted-foreground">{it.label}</dt>
          <dd className="min-w-0 text-right">
            <span className="font-display text-subheading font-semibold tabular-nums text-foreground">
              {it.value}
            </span>
            {it.hint ? <span className="block text-micro text-muted-foreground">{it.hint}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
