"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Select } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

/**
 * The period dropdown of one Attendance section. The choice lives in the URL
 * (`?days=` / `?hours=`), so it is shareable and server-rendered; changing it
 * replaces the URL in a transition, and only this section dims while the server
 * reads the new period.
 */

interface Scope {
  pending: boolean;
  start: React.TransitionStartFunction;
}

const PeriodContext = React.createContext<Scope | null>(null);

/** Wraps one section so its dropdown and its body share the pending state. Renders no element. */
export function PeriodScope({ children }: { children: React.ReactNode }) {
  const [pending, start] = React.useTransition();
  const scope = React.useMemo(() => ({ pending, start }), [pending]);
  return <PeriodContext.Provider value={scope}>{children}</PeriodContext.Provider>;
}

export function PeriodSelect({
  param,
  value,
  defaultValue,
  options,
  label,
}: {
  /** URL search param, "days" or "hours" */
  param: string;
  value: string;
  /** the period that needs no param */
  defaultValue: string;
  options: readonly { value: string; label: string }[];
  /** accessible name, e.g. "Period for daily attendance" */
  label: string;
}) {
  const scope = React.useContext(PeriodContext);
  const router = useRouter();
  const pathname = usePathname();
  const id = React.useId();
  // Shows the new choice at once; settles on the server's value when the page arrives.
  const [shown, setShown] = React.useOptimistic(value);
  const pending = scope?.pending ?? false;

  function choose(next: string) {
    const params = new URLSearchParams(window.location.search);
    if (next === defaultValue) params.delete(param);
    else params.set(param, next);
    const query = params.toString();
    const go = () => {
      setShown(next);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    };
    if (scope) scope.start(go);
    else React.startTransition(go);
  }

  return (
    <div className="flex items-center gap-2">
      <Loader2
        className={cn("h-4 w-4 shrink-0 animate-spin text-muted-foreground", !pending && "invisible")}
        aria-hidden
      />
      <span role="status" className="sr-only">
        {pending ? "Loading" : ""}
      </span>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Select
        id={id}
        value={shown}
        onChange={(e) => choose(e.target.value)}
        className="w-auto min-w-36 font-semibold"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** The section's content: dimmed and marked busy while a new period loads. */
export function PeriodBody({ children }: { children: React.ReactNode }) {
  const pending = React.useContext(PeriodContext)?.pending ?? false;
  return (
    <div
      aria-busy={pending || undefined}
      className={cn("transition-opacity duration-200", pending && "pointer-events-none opacity-55")}
    >
      {children}
    </div>
  );
}
