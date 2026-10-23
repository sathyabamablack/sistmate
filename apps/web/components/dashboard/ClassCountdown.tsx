"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** "25 min", "1 h 5 min": whole minutes, rounded up so "0 min" never shows. */
function span(ms: number): string {
  const mins = Math.max(1, Math.ceil(ms / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Live status line for the hero class: "Next class, starts in 25 min" or
 * "In progress, ends in 40 min". The server passes the render time so the first
 * paint matches; after that it ticks on its own and refreshes when the tab
 * becomes visible again.
 */
export function ClassCountdown({
  startsAt,
  endsAt,
  renderedAt,
  className,
}: {
  /** epoch ms */
  startsAt: number;
  /** epoch ms */
  endsAt: number;
  /** epoch ms when the server rendered this */
  renderedAt: number;
  className?: string;
}) {
  const [now, setNow] = React.useState(renderedAt);

  React.useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const inProgress = now >= startsAt && now < endsAt;
  const finished = now >= endsAt;
  const text = finished
    ? "Class finished"
    : inProgress
      ? `In progress, ends in ${span(endsAt - now)}`
      : `Next class, starts in ${span(startsAt - now)}`;

  return (
    <p className={cn("flex items-center gap-2 text-small font-semibold", className)}>
      {inProgress ? (
        <span className="h-2 w-2 shrink-0 animate-pulse-dot rounded-full bg-current" aria-hidden />
      ) : null}
      <span>{text}</span>
    </p>
  );
}
