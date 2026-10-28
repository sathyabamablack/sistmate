"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  /** the panel's element id; a link to `#<id>` opens this tab */
  id: string;
  label: string;
  content: React.ReactNode;
  /** `data-tour` hook on the panel (lib/tour.ts) */
  tour?: string;
}

/**
 * One panel at a time out of a few. Every panel stays in the page (hidden ones
 * with `hidden`), so the server renders them all and switching is instant. A
 * link to a panel's id opens its tab, so old `#todays-attendance` style anchors
 * still land. Arrow keys, Home and End move between tabs.
 */
export function Tabs({
  label,
  items,
  initial,
  className,
}: {
  /** accessible name of the tab list */
  label: string;
  items: TabItem[];
  /** the tab open at first; defaults to the first */
  initial?: string;
  className?: string;
}) {
  const [active, setActive] = React.useState(initial ?? items[0]?.id ?? "");
  const root = React.useRef<HTMLDivElement>(null);
  const tabs = React.useRef(new Map<string, HTMLButtonElement>());
  const ids = items.map((t) => t.id).join(" ");

  React.useEffect(() => {
    const known = ids.split(" ");
    const fromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!known.includes(id)) return;
      setActive(id);
      // The panel may have been hidden when the browser looked for the anchor.
      requestAnimationFrame(() => root.current?.scrollIntoView({ block: "start" }));
    };
    const frame = requestAnimationFrame(fromHash);
    window.addEventListener("hashchange", fromHash);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", fromHash);
    };
  }, [ids]);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const last = items.length - 1;
    const to =
      e.key === "ArrowRight"
        ? (index + 1) % items.length
        : e.key === "ArrowLeft"
          ? (index - 1 + items.length) % items.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (to === null) return;
    e.preventDefault();
    const id = items[to]!.id;
    setActive(id);
    tabs.current.get(id)?.focus();
  }

  return (
    <div ref={root} className={cn("scroll-mt-20", className)}>
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-1.5">
        {items.map((t, i) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                if (el) tabs.current.set(t.id, el);
                else tabs.current.delete(t.id);
              }}
              type="button"
              role="tab"
              id={`${t.id}-tab`}
              aria-selected={on}
              aria-controls={t.id}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "focusable inline-flex min-h-11 items-center rounded-full px-4 text-small font-semibold transition-colors lg:min-h-(--tab-h)",
                on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {items.map((t) => (
        <div
          key={t.id}
          id={t.id}
          role="tabpanel"
          aria-labelledby={`${t.id}-tab`}
          hidden={t.id !== active}
          tabIndex={0}
          data-tour={t.tour}
          className="focusable mt-5 rounded-lg"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
