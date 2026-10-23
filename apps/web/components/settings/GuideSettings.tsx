"use client";

import { Button } from "@/components/ui/Button";
import { useStartTour } from "@/components/tour/store";

/** Replays the first-time walkthrough from the dashboard. */
export function GuideSettings() {
  const startTour = useStartTour();

  return (
    <div id="tour" className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h3 className="text-subheading font-semibold text-foreground">Tour</h3>
        <p className="mt-0.5 text-body text-muted-foreground">A 1-minute walkthrough.</p>
      </div>
      <Button type="button" variant="outline" className="mt-2 self-start sm:mt-0 sm:self-auto" onClick={startTour}>
        Take the tour
      </Button>
    </div>
  );
}
