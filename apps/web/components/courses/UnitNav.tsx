"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface UnitNavItem {
  anchor: string;
  name: string;
  items: number;
  files: number;
}

function countsText(u: UnitNavItem): string {
  const parts: string[] = [];
  if (u.items > 0) parts.push(`${u.items} ${u.items === 1 ? "item" : "items"}`);
  if (u.files > 0) parts.push(`${u.files} ${u.files === 1 ? "file" : "files"}`);
  return parts.join(", ");
}

/**
 * Jump links to each unit. One list, two layouts: a row of chips that scrolls
 * inside its own container on phones, and a sticky outline with item and file
 * counts from the large breakpoint up. The unit in view is marked with
 * aria-current (scroll spy). CourseMaterials makes the links work when their
 * unit is collapsed, filtered out or behind the "All files" view.
 */
export function UnitNav({ units, className }: { units: UnitNavItem[]; className?: string }) {
  const [active, setActive] = React.useState(units[0]?.anchor ?? "");

  React.useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const inView = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) inView.set(e.target.id, e.isIntersecting);
        const first = units.find((u) => inView.get(u.anchor));
        if (first) setActive(first.anchor);
      },
      // A unit counts as current while its top part sits in the upper third of the screen.
      { rootMargin: "-10% 0px -65% 0px" },
    );
    for (const u of units) {
      const el = document.getElementById(u.anchor);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [units]);

  return (
    <nav aria-label="Units" className={cn("min-w-0", className)}>
      <p aria-hidden className="hidden text-small font-semibold text-muted-foreground lg:block">
        Units
      </p>
      <ol className="scrollbar-slim flex gap-2 overflow-x-auto pb-2 lg:mt-2 lg:block lg:space-y-0.5 lg:overflow-visible lg:pb-0">
        {units.map((u) => {
          const current = u.anchor === active;
          const counts = countsText(u);
          return (
            <li key={u.anchor} className="shrink-0 lg:shrink">
              <a
                href={`#${u.anchor}`}
                aria-current={current ? "location" : undefined}
                onClick={() => setActive(u.anchor)}
                className={cn(
                  "focusable inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-small font-semibold transition-colors",
                  "lg:flex lg:min-h-0 lg:w-full lg:flex-col lg:items-start lg:whitespace-normal lg:rounded-lg lg:px-3 lg:py-2 lg:font-medium",
                  current
                    ? "bg-primary text-primary-foreground lg:bg-accent lg:text-accent-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground lg:bg-transparent lg:hover:bg-muted",
                )}
              >
                <span className="lg:break-words">{u.name}</span>
                {counts ? (
                  <span className="hidden text-micro font-normal tabular-nums opacity-80 lg:block">{counts}</span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
