"use client";

import * as React from "react";
import Link from "@/components/ui/IntentLink";
import { Button } from "@/components/ui/Button";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";

/**
 * Turn alerts on or off for this device. Hidden when the site has no push service configured.
 * The browser asks for permission only when the button is pressed, never on page load.
 */
export function PushSettings({ apiUrl }: { apiUrl: string | null }) {
  const [state, setState] = React.useState<PushState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    void pushState().then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!apiUrl) return null;

  const run = async (action: (url: string) => Promise<PushState>) => {
    setBusy(true);
    setError(null);
    try {
      setState(await action(apiUrl));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="max-w-prose text-body text-muted-foreground">
        Get a short alert on this device when something important happens, such as results being published. No
        account is needed. We keep only the address your browser gives us to reach it, nothing about you.
      </p>

      {state === null ? (
        <p className="text-small text-muted-foreground">Checking this device…</p>
      ) : state === "unsupported" ? (
        <p className="text-body text-foreground">This browser can&apos;t show alerts.</p>
      ) : state === "needs-install" ? (
        <p className="max-w-prose text-body text-foreground">
          On iPhone and iPad, alerts work after you add sistmate to your Home Screen: tap Share, then Add to Home
          Screen, and open it from there.{" "}
          <Link href="/install" className="font-semibold text-primary underline underline-offset-4 focusable rounded-sm">
            Show me how
          </Link>
        </p>
      ) : state === "denied" ? (
        <p className="max-w-prose text-body text-foreground">
          Alerts are blocked for this site. Allow notifications for it in your browser&apos;s site settings, then come
          back here.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {state === "on" ? (
            <>
              <Button type="button" variant="outline" loading={busy} onClick={() => void run(disablePush)}>
                Turn off alerts
              </Button>
              <p role="status" className="text-small text-muted-foreground">
                Alerts are on for this device.
              </p>
            </>
          ) : (
            <Button type="button" loading={busy} onClick={() => void run(enablePush)}>
              Turn on alerts
            </Button>
          )}
        </div>
      )}

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
