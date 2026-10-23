import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import type { TimeFormat } from "./prefs";

/**
 * The design system adds named type sizes (text-title, text-small, ...). Without
 * telling tailwind-merge they are font sizes it would treat them as colours and
 * drop real colour classes next to them.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "title", "heading", "subheading", "body", "small", "micro"] }],
    },
  },
});

/** Merge Tailwind class names, resolving conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Timetable day indices: 0 = Monday ... 6 = Sunday (matches @usp/core). */
export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const DAY_NAMES_SHORT = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;

/**
 * Everything "today"/"now" is computed in the campus timezone, never the
 * server's: Vercel runs in UTC, which would show yesterday's timetable until
 * 05:30 IST and put "next class" 5.5 hours off.
 */
export const CAMPUS_TZ = "Asia/Kolkata";

const CLOCK_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: CAMPUS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface CampusClock {
  /** 0 = Monday ... 6 = Sunday */
  dayIndex: number;
  /** minutes since local midnight */
  minutes: number;
  hour: number;
  /** calendar date as a UTC-midnight timestamp, for day arithmetic */
  dayStamp: number;
}

export function campusClock(d: Date = new Date()): CampusClock {
  const parts = Object.fromEntries(CLOCK_FMT.formatToParts(d).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour);
  return {
    dayIndex: WEEKDAYS.indexOf(parts.weekday ?? ""),
    minutes: hour * 60 + Number(parts.minute),
    hour,
    dayStamp: Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
  };
}

/** Today's timetable day index (0 = Monday) on campus. */
export function todayDayIndex(d: Date = new Date()): number {
  return campusClock(d).dayIndex;
}

export function dayName(index: number): string {
  return DAY_NAMES[index] ?? "";
}

/** "09:00" -> minutes since midnight. Returns NaN for malformed input. */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  const hours = Number(h);
  const mins = Number(m);
  if (Number.isNaN(hours) || Number.isNaN(mins)) return NaN;
  return hours * 60 + mins;
}

/**
 * A clock time in the student's chosen format, in campus time.
 * Accepts "HH:MM", an ISO timestamp or a Date. 12h reads "9:00 am", 24h reads "09:00".
 * Input that is not a time comes back unchanged (strings) or as "—" (dates).
 */
export function formatTime(value: Date | string, timeFormat: TimeFormat = "12h"): string {
  let mins: number;
  if (typeof value === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(value.trim())) {
    mins = timeToMinutes(value.trim());
  } else {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return typeof value === "string" ? value : "—";
    mins = campusClock(d).minutes;
  }
  if (Number.isNaN(mins)) return typeof value === "string" ? value : "—";
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const mm = String(m).padStart(2, "0");
  if (timeFormat === "24h") return `${String(h24).padStart(2, "0")}:${mm}`;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${h24 >= 12 ? "pm" : "am"}`;
}

const DATE_FMT = new Intl.DateTimeFormat("en-IN", {
  timeZone: CAMPUS_TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DATETIME_FMT = new Intl.DateTimeFormat("en-IN", {
  timeZone: CAMPUS_TZ,
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return DATE_FMT.format(d);
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return DATETIME_FMT.format(d);
}

/**
 * Human relative time, e.g. "in 3 days", "2 hours ago".
 * `pastOnly` is for things that already happened (notifications): clock skew
 * between the portal and us must never render them as "in 5 hours".
 */
export function relativeTime(
  iso?: string | null,
  now: Date = new Date(),
  { pastOnly = false }: { pastOnly?: boolean } = {},
): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = pastOnly ? Math.min(0, d.getTime() - now.getTime()) : d.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60000);
  const abs = Math.abs(diffMin);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 1) return "just now";
  if (abs < 60) return rtf.format(diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, "hour");
  const diffDay = Math.round(diffHr / 24);
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, "day");
  const diffMonth = Math.round(diffDay / 30);
  return rtf.format(diffMonth, "month");
}

/** Calendar days (on campus) from now until the given ISO date. Negative = past. */
export function daysUntil(iso?: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((campusClock(d).dayStamp - campusClock(now).dayStamp) / 86_400_000);
}

export function isSameDay(iso: string | null | undefined, ref: Date): boolean {
  return daysUntil(iso, ref) === 0;
}

/** Format an INR amount without decimals. */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Clamp a number into [min, max]. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

const SMALL_WORDS = new Set(["and", "of", "in", "the", "for", "to", "a", "an"]);

/** "COMPUTER SCIENCE AND ENGINEERING" -> "Computer Science and Engineering"; mixed-case input is left alone. */
export function titleCase(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/(^|[\s.'(-])([a-z]+)/g, (m, sep: string, w: string, off: number) =>
      off > 0 && SMALL_WORDS.has(w) ? m : sep + w[0]!.toUpperCase() + w.slice(1),
    );
}

const LONG_DATE_FMT = new Intl.DateTimeFormat("en-IN", {
  timeZone: CAMPUS_TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** "Sunday, 11 October" in campus time. */
export function formatLongDate(d: Date = new Date()): string {
  return LONG_DATE_FMT.format(d);
}

/** Same as `formatTime`; kept for callers that already import it (the 12-hour style is lowercase). */
export function formatTimeLower(value: Date | string, timeFormat: TimeFormat = "12h"): string {
  return formatTime(value, timeFormat);
}
