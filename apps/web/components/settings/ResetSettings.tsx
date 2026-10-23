"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { usePrefsContext } from "./PrefsProvider";

/** Puts every preference back to its default. Separate from "Reset credit corrections". */
export function ResetSettings() {
  const { reset, pending } = usePrefsContext();
  const [done, setDone] = React.useState(false);

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
      <p className="max-w-prose text-body text-muted-foreground">
        Puts every preference back to its default. Your theme, grade scheme and credit corrections stay.
      </p>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          loading={pending}
          onClick={() => {
            reset();
            setDone(true);
          }}
        >
          Reset all settings
        </Button>
        <p role="status" aria-live="polite" className="text-small text-muted-foreground">
          {done && !pending ? "Settings reset." : ""}
        </p>
      </div>
    </div>
  );
}
