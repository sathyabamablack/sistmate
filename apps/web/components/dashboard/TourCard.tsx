"use client";

import * as React from "react";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { endTour, useStartTour, useTourState } from "@/components/tour/store";

/**
 * Offers the walkthrough on the dashboard when it has not been done or skipped but is
 * not running either: it already started by itself once in this browser and was left
 * unfinished (the tab was closed mid-way). Nothing renders until the browser has been
 * checked for a tour in progress, so the card never flashes in before the tour.
 */
export function TourCard() {
  const { ready, status, run } = useTourState();
  const start = useStartTour();
  const [declined, setDeclined] = React.useState(false);
  // Keyboard and screen reader users land on the note that replaces the card, not on <body>.
  const focusOnMount = React.useCallback((el: HTMLParagraphElement | null) => el?.focus(), []);

  if (declined) {
    return (
      <p ref={focusOnMount} tabIndex={-1} role="status" className="rounded-md text-small text-muted-foreground outline-hidden">
        The tour is in Settings whenever you want it.
      </p>
    );
  }
  if (!ready || status !== "new" || run) return null;

  return (
    <section aria-labelledby="tour-card-heading" className="enter" style={{ "--i": 1 } as React.CSSProperties}>
      <Panel tone="accent" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <Compass className="hidden h-6 w-6 shrink-0 sm:block" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="tour-card-heading" className="text-subheading font-semibold">
            Take the 1-minute tour
          </h2>
          <p className="mt-0.5 text-small text-accent-foreground/80">
            A quick look around.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" size="sm" onClick={start}>
            Start
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-accent-foreground hover:bg-surface/60"
            onClick={() => {
              endTour("skipped");
              setDeclined(true);
            }}
          >
            Not now
          </Button>
        </div>
      </Panel>
    </section>
  );
}
