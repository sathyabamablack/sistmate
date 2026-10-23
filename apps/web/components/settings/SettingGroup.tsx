import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * One setting inside a settings section: a small heading, an optional hint, then the
 * controls. The heading id is passed to the control group so screen readers announce it.
 */
export function SettingGroup({
  id,
  title,
  hint,
  children,
  className,
}: {
  id: string;
  title: string;
  hint?: React.ReactNode;
  children: (labelId: string) => React.ReactNode;
  className?: string;
}) {
  const labelId = `${id}-label`;
  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <h3 id={labelId} className="text-subheading font-semibold text-foreground">
          {title}
        </h3>
        {hint ? <p className="mt-0.5 max-w-prose text-small text-muted-foreground">{hint}</p> : null}
      </div>
      {children(labelId)}
    </div>
  );
}

/** A native checkbox with a 44px tap row. Used for on/off settings. */
export function CheckRow({
  checked,
  onChange,
  label,
  hint,
  id,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  id: string;
  className?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={hintId}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-body font-medium text-foreground">{label}</span>
        {hint ? (
          <span id={hintId} className="block text-small text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}
