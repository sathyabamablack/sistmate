"use client";

import * as React from "react";
import { Download, X } from "lucide-react";
import Link from "@/components/ui/IntentLink";
import { Button } from "@/components/ui/Button";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const VISITS_KEY = "usp-visits";
const DISMISSED_KEY = "usp-install-dismissed";
const COUNTED_KEY = "usp-visit-counted";

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: the banner just shows again next time */
  }
};

function installed(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || (window.matchMedia?.("(display-mode: standalone)").matches ?? false);
}

/**
 * Asks once, from the second visit on, whether to put the app on the home screen. Android and
 * desktop Chrome get a one-tap install; iPhone has no such API, so it links to the step-by-step
 * guide. Hidden once installed or dismissed.
 */
export function InstallPrompt() {
  const [show, setShow] = React.useState(false);
  const [event, setEvent] = React.useState<InstallEvent | null>(null);

  React.useEffect(() => {
    if (installed() || read(DISMISSED_KEY)) return;
    // One visit per browser session, however many pages or effect runs it takes.
    let visits = Number(read(VISITS_KEY) ?? "0");
    try {
      if (!sessionStorage.getItem(COUNTED_KEY)) {
        sessionStorage.setItem(COUNTED_KEY, "1");
        visits += 1;
        write(VISITS_KEY, String(visits));
      }
    } catch {
      /* no session storage: count every load instead */
      visits += 1;
      write(VISITS_KEY, String(visits));
    }
    if (visits < 2) return;
    setShow(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setShow(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    write(DISMISSED_KEY, "1");
    setShow(false);
  };
  const install = async () => {
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") setShow(false);
    else dismiss();
  };

  return (
    <div
      role="region"
      aria-label="Install the app"
      className="mb-6 flex items-center gap-3 rounded-xl bg-accent px-4 py-3 text-accent-foreground ring-1 ring-border"
    >
      <Download className="h-5 w-5 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 text-body">
        Put SISTmate on your home screen to open it like an app.
      </p>
      {event ? (
        <Button size="sm" onClick={() => void install()}>
          Install
        </Button>
      ) : (
        <Link href="/install" className="shrink-0 text-small font-semibold underline underline-offset-4 focusable rounded-sm">
          How
        </Link>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="focusable -mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
