"use client";

import Link from "@/components/ui/IntentLink";
import * as React from "react";
import { BLACK_PATH, OPENED_SEEN_KEY, blackPhase, openedAndSeen, writeFlag } from "@/lib/black";
import { mono } from "./fonts";
import { useNow } from "./useNow";

/** A pinned, redacted "notification" at the top of the feed. It opens the countdown. */
export function BlackNotice() {
  const now = useNow();
  if (now === null) return null;
  const phase = blackPhase(now);
  if (openedAndSeen(phase)) return null;

  return (
    <Link
      href={BLACK_PATH}
      onClick={phase === "open" ? () => writeFlag("local", OPENED_SEEN_KEY, "1") : undefined}
      className="group relative mb-4 flex items-start gap-3 overflow-hidden rounded-xl border border-[#e01b24]/25 bg-[#070707] p-4 text-[#8a8a8a] shadow-[0_0_40px_-18px_rgba(180,10,22,0.6)] transition-colors hover:border-[#e01b24]/50 outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e01b24]"
    >
      <span aria-hidden className="mt-1.5 size-2 shrink-0 bg-[#e01b24] motion-safe:animate-pulse" />
      <span className="min-w-0 flex-1">
        <span className={`${mono.className} block text-[10px] uppercase tracking-[0.35em] text-[#e01b24]`}>
          1 unread · pinned
        </span>
        <span className="mt-1.5 block text-body font-medium text-[#ececec]">
          {phase === "open" ? "The lights are on." : <span aria-hidden>███████ ████ █████████</span>}
        </span>
        <span className="mt-0.5 block text-small text-[#6b6b6b]">
          {phase === "open" ? "Come in." : "Open to read. Not everything is on the notice board."}
        </span>
        <span className="sr-only">
          {phase === "open"
            ? "Sathyabama Black is open."
            : "Something is coming. Sathyabama Black opens Wednesday 28 October, 11:00 IST."}
        </span>
      </span>
      <span aria-hidden className="mt-1 text-[#e01b24] transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  );
}
