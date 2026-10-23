import { DAY_NAMES_SHORT, campusClock, formatTime } from "../utils";
import type { TimeFormat } from "../prefs";
import type { ConnectionState } from "./jwt";

export interface ConnectionSummary {
  tone: "ok" | "warn" | "bad";
  /** "Connected until 9:40 pm", "Session expired", ... */
  label: string;
  /** Worth offering a Reconnect action now. */
  reconnect: boolean;
}

/** Offer Reconnect when this little of the session is left. */
export const RECONNECT_SOON_MS = 60 * 60 * 1000;

/** "9:40 pm" today, "Tue 9:40 am" on another campus day. */
export function formatUntil(at: Date, now: Date, timeFormat: TimeFormat = "12h"): string {
  const time = formatTime(at, timeFormat);
  const day = campusClock(at);
  if (day.dayStamp === campusClock(now).dayStamp) return time;
  return `${DAY_NAMES_SHORT[day.dayIndex] ?? ""} ${time}`.trim();
}

export function summarizeConnection(
  state: ConnectionState,
  now: Date = new Date(),
  timeFormat: TimeFormat = "12h",
): ConnectionSummary {
  switch (state.status) {
    case "connected": {
      const soon = state.expiresAt.getTime() - now.getTime() < RECONNECT_SOON_MS;
      return {
        tone: soon ? "warn" : "ok",
        label: `Connected until ${formatUntil(state.expiresAt, now, timeFormat)}`,
        reconnect: soon,
      };
    }
    case "expired":
      return { tone: "bad", label: "Session expired", reconnect: true };
    case "unknown":
      return { tone: "ok", label: "Connected", reconnect: false };
    default:
      return { tone: "bad", label: "Not connected", reconnect: true };
  }
}
