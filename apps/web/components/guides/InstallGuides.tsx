"use client";

import * as React from "react";
import { detectPhoneOs, installTargetFromHash, type PhoneOs } from "@/lib/device";
import { getGuide } from "@/lib/guides";
import { cn } from "@/lib/utils";
import { GuidePlayer } from "./GuidePlayer";

const noopSubscribe = () => () => {};

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const readOs = (): PhoneOs => detectPhoneOs(navigator.userAgent, navigator.maxTouchPoints);

/**
 * The /install page body: Android or iPhone, then the matching home-screen
 * guide. Android renders first on the server; the phone in hand is picked after
 * hydration (useSyncExternalStore), and a #hash deep link wins over both.
 */
export function InstallGuides({ downloads }: { downloads: Partial<Record<PhoneOs, React.ReactNode>> }) {
  const detectedOs = React.useSyncExternalStore(noopSubscribe, readOs, () => "android" as const);
  const hash = React.useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const fromHash = installTargetFromHash(hash);

  const [chosenOs, setChosenOs] = React.useState<PhoneOs | null>(null);
  const os = chosenOs ?? fromHash?.os ?? detectedOs;
  const guide = getGuide(os);

  return (
    <section id={os} aria-labelledby="install-guide-heading" className="scroll-mt-6">
      <div role="group" aria-label="Your phone" className="flex flex-wrap gap-2">
        {(["android", "iphone"] as const).map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={os === o}
            onClick={() => setChosenOs(o)}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full px-4 text-small font-semibold transition-colors focusable",
              os === o
                ? "bg-accent text-accent-foreground ring-1 ring-primary/40"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {getGuide(o).label}
            <span className="sr-only">{o === "android" ? " (Chrome)" : " (Safari)"}</span>
          </button>
        ))}
      </div>

      <h2 id="install-guide-heading" className="mt-6 text-heading font-semibold">
        Add it to your home screen
      </h2>
      <p className="mt-1.5 max-w-2xl text-body leading-relaxed text-muted-foreground">
        {guide.summary}
      </p>
      <GuidePlayer key={os} guideId={os} aside={downloads[os]} className="mt-6" />
    </section>
  );
}
