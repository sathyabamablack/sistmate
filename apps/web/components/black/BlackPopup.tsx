"use client";

import Link from "@/components/ui/IntentLink";
import * as React from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/Dialog";
import { useTourState } from "@/components/tour/store";
import {
  BLACK_PATH,
  OPENED_SEEN_KEY,
  POPUP_SHOWN_KEY,
  blackPhase,
  openedAndSeen,
  readFlag,
  writeFlag,
} from "@/lib/black";
import { ClockCells } from "./Clock";
import { anton, mono } from "./fonts";
import { useNow } from "./useNow";

/** How long to wait for the first-visit walkthrough to claim the screen before deciding. */
const SETTLE_MS = 1600;

/**
 * Shown once per browser session after sign-in, in the countdown page's style. It can be closed
 * (Not now, the X, Escape or a click outside) and never shows while the walkthrough is running.
 * Once the page has opened it shows one last time, then stays away.
 */
export function BlackPopup() {
  const now = useNow();
  const tour = useTourState();
  const [open, setOpen] = React.useState(false);
  const decided = React.useRef(false);
  const tourRunning = React.useRef(false);
  React.useEffect(() => {
    tourRunning.current = tour.run !== null;
  });

  React.useEffect(() => {
    if (now === null || !tour.ready || decided.current) return;
    decided.current = true;
    const phase = blackPhase(now);
    if (readFlag("session", POPUP_SHOWN_KEY) === "1" || openedAndSeen(phase)) return;
    const timer = window.setTimeout(() => {
      if (tourRunning.current) return;
      writeFlag("session", POPUP_SHOWN_KEY, "1");
      setOpen(true);
    }, SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
      decided.current = false;
    };
  }, [now === null, tour.ready]); // eslint-disable-line react-hooks/exhaustive-deps -- decide once, when both are known

  const isOpen = now !== null && blackPhase(now) === "open";
  const close = (next: boolean) => {
    setOpen(next);
    if (!next && isOpen) writeFlag("local", OPENED_SEEN_KEY, "1");
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        closeButton={false}
        className="max-w-[26rem] overflow-hidden rounded-2xl border border-[#e01b24]/25 bg-[#070707] p-0 text-[#8a8a8a] shadow-[0_0_80px_-12px_rgba(180,10,22,0.55)] sm:max-w-md"
      >
        <DialogTitle className="sr-only">Sathyabama Black</DialogTitle>
        <DialogDescription className="sr-only">
          {isOpen
            ? "It is open. You can enter now or close this and carry on."
            : "Something different is coming. You can take a look or close this and carry on."}
        </DialogDescription>

        {/* Floor glow, so the card reads as lit from below. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 90% 55% at 50% 115%, rgba(150,8,18,0.4), transparent 70%), radial-gradient(ellipse 70% 40% at 50% 0%, rgba(70,4,10,0.45), transparent 70%)",
          }}
        />
        <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#e01b24] to-transparent" />

        <DialogClose
          aria-label="Close"
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full text-[#6b6b6b] transition-colors hover:bg-white/10 hover:text-white outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e01b24]"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
          </svg>
        </DialogClose>

        <div className="relative px-6 pb-6 pt-9 text-center sm:px-8">
          <p className={`${mono.className} flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.45em] text-[#e01b24]`}>
            <span aria-hidden className="size-1.5 rounded-full bg-[#e01b24] motion-safe:animate-pulse" />
            {isOpen ? "the lights are on" : "something is coming"}
          </p>

          <p aria-hidden className={`${anton.className} mt-5 uppercase leading-[0.88]`}>
            <span className="block text-[2.6rem] tracking-[0.01em] text-[#ececec] sm:text-5xl">Sathyabama</span>
            <span className="relative inline-block text-[4.4rem] sm:text-[5.2rem]">
              <span
                className="bg-clip-text text-transparent [filter:drop-shadow(0_0_22px_rgba(160,10,22,0.4))]"
                style={{ backgroundImage: "linear-gradient(180deg,#a3111c 0%,#7a0a14 55%,#4a050b 100%)" }}
              >
                Black
              </span>
              <span className="absolute -right-[0.17em] bottom-[0.1em] size-[0.12em] bg-[#e01b24]" />
            </span>
          </p>

          <p className="mt-5 text-[15px] text-[#9a9a9a]">Something different is coming. Stay curious.</p>

          {isOpen ? null : (
            <div className="mt-6 border-y border-white/[0.07]">
              <ClockCells now={now} />
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:justify-center sm:gap-3">
            <DialogClose
              className={`${mono.className} inline-flex min-h-11 items-center justify-center px-5 text-[11px] uppercase tracking-[0.3em] text-[#8a8a8a] transition-colors hover:text-white outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e01b24]`}
            >
              Not now
            </DialogClose>
            <DialogClose asChild>
              <Link
                href={BLACK_PATH}
                className={`${mono.className} inline-flex min-h-11 items-center justify-center gap-3 border border-[#e01b24]/60 bg-[#e01b24]/10 px-6 text-[11px] uppercase tracking-[0.3em] text-[#f2f2f2] transition-colors hover:border-[#e01b24] hover:bg-[#e01b24]/20 outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e01b24]`}
              >
                {isOpen ? "Enter" : "Take a look"} <span aria-hidden>→</span>
              </Link>
            </DialogClose>
          </div>

          <p className="mt-5 text-[10px] leading-snug text-[#5c5c5c]">
            Independent. Not affiliated with, endorsed by, or operated by Sathyabama Institute of Science and
            Technology.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
