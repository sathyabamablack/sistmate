"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A native radio drawn as a selectable card. The input covers the whole card
 * (invisible, but real), so the entire tile is the 44px+ touch target and
 * keyboard, arrow-key and screen reader behaviour are the browser's own.
 * Selection shows as a thicker border plus a check mark, never colour alone.
 */
export function RadioCard({
  name,
  value,
  checked,
  onChange,
  disabled,
  title,
  description,
  children,
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  disabled?: boolean;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const id = React.useId();
  const titleId = `${id}-title`;
  const descId = description ? `${id}-desc` : undefined;

  return (
    <div className={cn("relative", className)}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <div
        className={cn(
          "flex h-full min-h-14 flex-col gap-2 rounded-xl border bg-surface p-4 transition-colors",
          "peer-hover:bg-muted/60 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
          "peer-disabled:opacity-60",
          checked ? "border-primary bg-accent/40 outline outline-1 outline-primary" : "border-border",
        )}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={cn(
              "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border",
              checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-surface",
            )}
          >
            {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
          </span>
          <div className="min-w-0 flex-1">
            <p id={titleId} className="text-body font-semibold text-foreground">
              {title}
            </p>
            {description ? (
              <p id={descId} className="mt-0.5 text-small text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
