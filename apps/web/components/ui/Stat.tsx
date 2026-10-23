import * as React from "react";
import { cn } from "@/lib/utils";

/** A single figure with its label, for use inside a `<dl>`. Numerals use the display face. */
export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-small text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">
        <span className="font-display text-title font-semibold tabular-nums text-foreground">{value}</span>
        {hint ? <span className="block text-micro text-muted-foreground">{hint}</span> : null}
      </dd>
    </div>
  );
}
