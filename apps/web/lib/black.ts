/**
 * Sathyabama Black: the countdown page at /black and the teasers that point to it
 * (login pop-up, dashboard strip, pinned notification, footer dot). The opening time,
 * the countdown maths and the "already seen" flags live here so they stay in one place.
 */

export const BLACK_PATH = "/black";

/** Wed 28 Oct 2026, 11:00 IST. */
export const OPENS_AT = Date.parse("2026-10-28T11:00:00+05:30");

export type BlackPhase = "before" | "open";

export function blackPhase(now: number): BlackPhase {
  return now >= OPENS_AT ? "open" : "before";
}

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export const COUNTDOWN_UNITS = ["days", "hours", "minutes", "seconds"] as const;

/** Whole days, hours, minutes and seconds left; never negative. */
export function splitCountdown(ms: number): Countdown {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** sessionStorage: the login pop-up has been shown in this browser session. */
export const POPUP_SHOWN_KEY = "usp-black-popup";
/** localStorage: the phase ("before" or "open") whose dashboard strip was dismissed. */
export const STRIP_DISMISSED_KEY = "usp-black-strip";
/** localStorage: they have been through the opening, so no pop-up, strip or pinned notice shows any more. */
export const OPENED_SEEN_KEY = "usp-black-seen";

/** Storage can be blocked (private windows, site data off); every read and write is guarded. */
export function readFlag(kind: "local" | "session", key: string): string | null {
  try {
    return (kind === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

export function writeFlag(kind: "local" | "session", key: string, value: string): void {
  try {
    (kind === "local" ? window.localStorage : window.sessionStorage).setItem(key, value);
  } catch {
    /* nothing to remember it with: it will simply show again */
  }
}

/** After the opening, the teasers stay out of the way once someone has been through it. */
export function openedAndSeen(phase: BlackPhase): boolean {
  return phase === "open" && readFlag("local", OPENED_SEEN_KEY) === "1";
}
