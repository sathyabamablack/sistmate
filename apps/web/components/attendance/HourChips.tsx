import type { HourChip } from "@/lib/attendance-days";
import { cn } from "@/lib/utils";
import { hourStatus } from "./status";

/** One chip per hour: number, status (icon + words) and the subject when known. */
export function HourChips({ chips, className }: { chips: HourChip[]; className?: string }) {
  if (chips.length === 0) return null;
  return (
    <ul className={cn("grid grid-cols-2 gap-2", className)}>
      {chips.map((c) => {
        const { Icon, className: iconClass, text } = hourStatus[c.status];
        return (
          <li key={c.hour} className="min-w-0 rounded-lg border border-border px-3 py-2">
            <p className="flex flex-wrap items-center gap-x-1.5 text-small">
              <Icon className={cn("h-4 w-4 shrink-0", iconClass)} aria-hidden />
              <span className="font-semibold tabular-nums text-foreground">Hour {c.hour}</span>
              <span className="text-muted-foreground">{text}</span>
            </p>
            {c.subject ? <p className="truncate text-micro text-muted-foreground">{c.subject}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
