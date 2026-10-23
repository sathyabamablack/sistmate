"use client";

import * as React from "react";
import { readFlag, writeFlag } from "@/lib/black";
import { anton } from "./fonts";

/** localStorage: this browser's random id, present only while the person is counted as interested. */
const TOKEN_KEY = "usp-black-interested";
/** Each poll is a request on the free hosting plan, so once a minute, and only while visible. */
const POLL_MS = 60_000;
/** How old a CDN copy of the count can be (s-maxage + stale-while-revalidate in api/interest). */
const STALE_POLL_MS = 330_000;

interface Status {
  enabled: boolean;
  count: number;
}

async function call(method: "GET" | "POST" | "DELETE", token?: string): Promise<Status | null> {
  try {
    const res = await fetch("/api/interest", {
      method,
      headers: token ? { "Content-Type": "application/json" } : undefined,
      body: token ? JSON.stringify({ token }) : undefined,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Status;
  } catch {
    return null;
  }
}

const countLine = (n: number) =>
  n === 0 ? "be the first" : `${n.toLocaleString("en-IN")} ${n === 1 ? "person is" : "people are"} interested`;

/**
 * "I'm Interested": one anonymous tap per browser, and a shared count under it. It renders nothing
 * until the server says a store is configured, so the page never takes taps it cannot keep.
 */
export function InterestButton() {
  const [status, setStatus] = React.useState<Status | null>(null);
  const [token, setToken] = React.useState<string | null>(() => readFlag("local", TOKEN_KEY));
  const [busy, setBusy] = React.useState(false);
  /** This browser's last tap and the exact count it got back, which a cached poll may predate. */
  const lastVote = React.useRef<{ at: number; count: number; added: boolean } | null>(null);

  // Read the count now, every minute while the tab is showing, and when the tab comes back.
  // With no store configured the button never shows, so polling stops after the first answer.
  React.useEffect(() => {
    let stopped = false;
    let last = 0;
    let timer = 0;
    const refresh = async () => {
      if (document.hidden) return;
      last = Date.now();
      const next = await call("GET");
      if (stopped || !next) return;
      // A CDN copy from before the tap would seem to undo it; skip it until a newer one arrives.
      const vote = lastVote.current;
      if (vote && Date.now() - vote.at < STALE_POLL_MS && (vote.added ? next.count < vote.count : next.count > vote.count)) {
        return;
      }
      setStatus(next);
      if (!next.enabled) stop();
    };
    const onVisible = () => {
      if (!document.hidden && Date.now() - last >= POLL_MS) void refresh();
    };
    const stop = () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    void refresh();
    timer = window.setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return stop;
  }, []);

  if (!status?.enabled) return null;
  const interested = token !== null;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const previous = status;
    if (interested) {
      // Optimistic: show it at once, put it back if the server says no.
      setStatus({ ...status, count: Math.max(0, status.count - 1) });
      const next = await call("DELETE", token);
      if (next) {
        try {
          window.localStorage.removeItem(TOKEN_KEY);
        } catch {
          /* blocked: it only means the button looks unpressed after a reload */
        }
        setToken(null);
        setStatus(next);
        lastVote.current = { at: Date.now(), count: next.count, added: false };
      } else {
        setStatus(previous);
      }
    } else {
      const fresh = crypto.randomUUID();
      setStatus({ ...status, count: status.count + 1 });
      const next = await call("POST", fresh);
      if (next) {
        writeFlag("local", TOKEN_KEY, fresh);
        setToken(fresh);
        setStatus(next);
        lastVote.current = { at: Date.now(), count: next.count, added: true };
      } else {
        setStatus(previous);
      }
    }
    setBusy(false);
  };

  return (
    <div className="sb-rise mt-7 flex w-full flex-col items-center [animation-delay:380ms] sm:mt-8">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={interested}
        disabled={busy}
        className={`${anton.className} group relative inline-flex h-14 w-72 max-w-full items-center justify-center gap-3 rounded-full border text-[17px] uppercase tracking-[0.22em] outline-hidden transition-all duration-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c1121f] enabled:active:scale-[0.98] sm:text-lg ${
          interested
            ? "border-[#c1121f] bg-[#1a0508] text-white shadow-[0_0_46px_-12px_rgba(193,18,31,0.75),inset_0_0_34px_rgba(150,8,18,0.55)]"
            : "border-[#7a0a14]/70 bg-[#0b0406] text-[#cfcfcf] shadow-[inset_0_0_30px_rgba(110,8,18,0.35)] hover:border-[#c1121f]/80 hover:bg-[#12060a] hover:text-white hover:shadow-[0_0_34px_-14px_rgba(193,18,31,0.65),inset_0_0_30px_rgba(130,8,18,0.5)]"
        }`}
      >
        {interested ? <span aria-hidden className="size-2 shrink-0 bg-[#e01b24]" /> : null}
        {interested ? "You're in" : "I'm Interested"}
      </button>
      <p aria-live="polite" className="mt-5 text-[11px] font-medium uppercase tracking-[0.34em] text-[#8a8a8a] sm:text-xs">
        <span aria-hidden className="text-[#7a0a14]">
          —{" "}
        </span>
        {countLine(status.count)}
      </p>
    </div>
  );
}
