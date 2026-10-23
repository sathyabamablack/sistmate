"use client";

import Link from "@/components/ui/IntentLink";
import * as React from "react";
import { X } from "lucide-react";
import {
  BLACK_PATH,
  OPENED_SEEN_KEY,
  STRIP_DISMISSED_KEY,
  blackPhase,
  openedAndSeen,
  readFlag,
  writeFlag,
} from "@/lib/black";
import { ClockInline } from "./Clock";
import { mono } from "./fonts";
import { useNow } from "./useNow";

/**
 * A thin dark-red bar at the top of the dashboard that links to the countdown. Dismissing it
 * hides it until the page opens, when it comes back once as "the lights are on".
 */
export function BlackStrip() {
  const now = useNow();
  // Nothing renders until `now` is set on the client, so reading storage here cannot mismatch the server's output.
  const [dismissed, setDismissed] = React.useState<string | null>(() => readFlag("local", STRIP_DISMISSED_KEY));

  if (now === null) return null;
  const phase = blackPhase(now);
  if (dismissed === phase || openedAndSeen(phase)) return null;

  const dismiss = () => {
    writeFlag("local", STRIP_DISMISSED_KEY, phase);
    if (phase === "open") writeFlag("local", OPENED_SEEN_KEY, "1");
    setDismissed(phase);
  };

  return (
    <div
      className="enter relative mb-5 overflow-hidden rounded-xl border border-[#e01b24]/25 bg-[#070707] text-[#8a8a8a] shadow-[0_0_40px_-18px_rgba(180,10,22,0.6)]"
      style={{ "--i": 0 } as React.CSSProperties}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse 60% 120% at 0% 100%, rgba(150,8,18,0.35), transparent 70%)" }}
      />
      <Link
        href={BLACK_PATH}
        onClick={phase === "open" ? () => writeFlag("local", OPENED_SEEN_KEY, "1") : undefined}
        className="relative flex min-h-12 items-center gap-3 py-2 pl-4 pr-14 outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e01b24] sm:gap-4"
      >
        <span aria-hidden className="size-2 shrink-0 bg-[#e01b24] motion-safe:animate-pulse" />
        <span className={`${mono.className} min-w-0 flex-1 truncate text-[11px] uppercase tracking-[0.28em] text-[#d4d4d4]`}>
          {phase === "open" ? "The lights are on" : "Something is coming"}
        </span>
        {phase === "before" ? <ClockInline now={now} /> : null}
        <span aria-hidden className="text-[#e01b24]">
          →
        </span>
        <span className="sr-only">
          {phase === "open"
            ? "Sathyabama Black is open. Enter."
            : "Sathyabama Black opens Wednesday 28 October, 11:00 IST. Take a look."}
        </span>
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-1 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-[#6b6b6b] transition-colors hover:text-white outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e01b24]"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
