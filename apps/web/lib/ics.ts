import type { CalendarEvent, DashboardData, TimetableSlot } from "@usp/core";
import { CAMPUS_TZ, campusClock, timeToMinutes } from "./utils";

/**
 * iCalendar (RFC 5545) export of the weekly timetable and upcoming deadlines.
 *
 * Pure and dependency-free so it can be unit-tested and reused anywhere. The
 * output imports cleanly into Google Calendar, Apple Calendar and Outlook:
 * classes become weekly recurring events in campus time, deadlines become
 * timed (or all-day) events with reminders. UIDs are derived from each item's
 * identity, never its position, so re-importing updates instead of duplicating.
 */

export interface BuildCalendarOptions {
  /** Reference instant: first class occurrences, DTSTAMP and the past cut-off derive from it. */
  now: Date;
  /** How many weeks the recurring classes should run (default 16, clamped 1..52). */
  weeks?: number;
  prodId?: string;
}

export type CalendarInput = Pick<DashboardData, "timetable" | "events" | "profile">;

const DEFAULT_WEEKS = 16;
const DEFAULT_PRODID = "-//Unified Student Portal//Timetable Export 1.0//EN";
const UID_DOMAIN = "unified-student-portal";
const CRLF = "\r\n";
const MAX_LINE_OCTETS = 75;
/** Asia/Kolkata is a fixed UTC+05:30 with no DST. */
const IST_OFFSET_MIN = 330;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** Consecutive periods of one course at most this far apart merge into one event. */
const MERGE_GAP_MIN = 15;
const DEADLINE_DURATION_MIN = 30;
const ALARM_TYPES = new Set<CalendarEvent["type"]>(["assignment", "exam", "fee"]);
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/* ------------------------------ formatting ------------------------------ */

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC instant -> "YYYYMMDDTHHMMSSZ" */
function formatUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** UTC-midnight day stamp -> "YYYYMMDD" */
function formatDate(dayStamp: number): string {
  const d = new Date(dayStamp);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

/** Day stamp + minutes since local midnight -> floating "YYYYMMDDTHHMM00" (used with TZID). */
function formatLocal(dayStamp: number, minutes: number): string {
  return `${formatDate(dayStamp)}T${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}00`;
}

/** Campus-local wall time -> the UTC instant it denotes. */
function campusToUtc(dayStamp: number, minutes: number): Date {
  return new Date(dayStamp + (minutes - IST_OFFSET_MIN) * MINUTE_MS);
}

/** Escape a TEXT value (RFC 5545 §3.3.11). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const encoder = new TextEncoder();
const octets = (s: string) => encoder.encode(s).length;

/**
 * Fold a content line to at most 75 octets per physical line (RFC 5545 §3.1),
 * measured in UTF-8 bytes and never splitting a multi-byte character.
 * Continuation lines start with a single space, which counts toward the limit.
 */
export function foldLine(line: string): string {
  if (octets(line) <= MAX_LINE_OCTETS) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = octets(ch);
    // The first physical line holds 75 octets; continuations hold 74 + the leading space.
    const limit = out.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (size + n > limit) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join(`${CRLF} `);
}

/**
 * Small deterministic string hash (two FNV-1a 32-bit passes with different
 * seeds, 64 bits total). Not cryptographic — it only has to be stable and
 * collision-resistant enough for calendar UIDs.
 */
function stableHash(input: string): string {
  const bytes = encoder.encode(input);
  let h1 = 0x811c9dc5;
  let h2 = 0x050c5d1f;
  for (const b of bytes) {
    h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ b, 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

function makeUid(owner: string, ...parts: string[]): string {
  return `${stableHash([owner, ...parts].join("\u001f"))}@${UID_DOMAIN}`;
}

/** Collects content lines; skips empty optional values. */
class Lines {
  private readonly lines: string[] = [];

  /** Raw property: `value` is emitted verbatim (dates, enums, URIs). */
  raw(name: string, value: string): this {
    this.lines.push(`${name}:${value}`);
    return this;
  }

  /** TEXT property: escaped; omitted when empty. */
  text(name: string, value: string | undefined | null): this {
    if (value && value.trim()) this.lines.push(`${name}:${escapeText(value.trim())}`);
    return this;
  }

  toString(): string {
    return this.lines.map(foldLine).join(CRLF) + CRLF;
  }
}

/* ------------------------------ timetable ------------------------------ */

export interface ClassBlock {
  day: number;
  start: number; // minutes since campus midnight
  end: number;
  courseCode: string;
  courseTitle: string;
  rooms: string[];
  faculty: string[];
}

const pushUnique = (list: string[], value: string | undefined) => {
  const v = value?.trim();
  if (v && !list.includes(v)) list.push(v);
};

/**
 * Normalise slots into blocks, merging back-to-back periods of the same course
 * on the same day (e.g. a two-period lab) into one event.
 */
export function mergeSlots(slots: readonly TimetableSlot[]): ClassBlock[] {
  const valid = slots
    .map((s) => ({ s, start: timeToMinutes(s.startTime), end: timeToMinutes(s.endTime) }))
    .filter(
      ({ s, start, end }) =>
        Number.isInteger(s.day) &&
        s.day >= 0 &&
        s.day <= 6 &&
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        end > start &&
        end <= 24 * 60,
    )
    .sort(
      (a, b) =>
        a.s.day - b.s.day ||
        a.start - b.start ||
        a.end - b.end ||
        a.s.courseCode.localeCompare(b.s.courseCode),
    );

  const blocks: ClassBlock[] = [];
  // Latest block per day+course; slots are sorted, so only the latest can merge.
  const latest = new Map<string, ClassBlock>();
  for (const { s, start, end } of valid) {
    const key = `${s.day}\u001f${s.courseCode}\u001f${s.courseTitle}`;
    const prev = latest.get(key);
    if (prev && start <= prev.end + MERGE_GAP_MIN) {
      prev.end = Math.max(prev.end, end);
      pushUnique(prev.rooms, s.room);
      pushUnique(prev.faculty, s.faculty);
      continue;
    }
    const block: ClassBlock = {
      day: s.day,
      start,
      end,
      courseCode: s.courseCode,
      courseTitle: s.courseTitle,
      rooms: [],
      faculty: [],
    };
    pushUnique(block.rooms, s.room);
    pushUnique(block.faculty, s.faculty);
    blocks.push(block);
    latest.set(key, block);
  }
  return blocks;
}

function classEvent(block: ClassBlock, owner: string, now: Date, weeks: number, stamp: string): string {
  const clock = campusClock(now);
  let offset = (block.day - clock.dayIndex + 7) % 7;
  // Today's class that has already finished starts the series next week.
  if (offset === 0 && block.end <= clock.minutes) offset = 7;
  const firstDay = clock.dayStamp + offset * DAY_MS;
  const lastDay = firstDay + (weeks - 1) * 7 * DAY_MS;
  // UNTIL must be UTC when DTSTART carries a TZID; end of the last class day.
  const until = campusToUtc(lastDay, 24 * 60 - 1);
  until.setUTCSeconds(59);

  const description = [block.courseCode, ...block.faculty].filter(Boolean).join(" · ");

  return new Lines()
    .raw("BEGIN", "VEVENT")
    .raw("UID", makeUid(owner, "class", String(block.day), String(block.start), block.courseCode))
    .raw("DTSTAMP", stamp)
    .raw(`DTSTART;TZID=${CAMPUS_TZ}`, formatLocal(firstDay, block.start))
    .raw(`DTEND;TZID=${CAMPUS_TZ}`, formatLocal(firstDay, block.end))
    .raw("RRULE", `FREQ=WEEKLY;UNTIL=${formatUtc(until)}`)
    .text("SUMMARY", block.courseTitle || block.courseCode)
    .text("LOCATION", block.rooms.join(" / "))
    .text("DESCRIPTION", description)
    .raw("CATEGORIES", "CLASS")
    .raw("TRANSP", "OPAQUE")
    .raw("END", "VEVENT")
    .toString();
}

/* ------------------------------ deadlines ------------------------------ */

type When =
  | { allDay: true; dayStamp: number; instant: number }
  | { allDay: false; instant: number };

function resolveWhen(iso: string): When | null {
  // A bare date ("2026-12-15", e.g. fee due dates) is a campus calendar day,
  // not UTC midnight (which would land at 05:30 IST).
  const m = DATE_ONLY.exec(iso.trim());
  if (m) {
    const dayStamp = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return { allDay: true, dayStamp, instant: campusToUtc(dayStamp, 0).getTime() };
  }
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  const clock = campusClock(d);
  if (clock.minutes === 0 && t % MINUTE_MS === 0) {
    return { allDay: true, dayStamp: clock.dayStamp, instant: t };
  }
  return { allDay: false, instant: t };
}

const TYPE_LABEL: Record<CalendarEvent["type"], string> = {
  assignment: "Assignment",
  exam: "Exam",
  class: "Class",
  fee: "Fee",
  other: "Event",
};

function deadlineEvent(ev: CalendarEvent, when: When, owner: string, stamp: string): string {
  const lines = new Lines()
    .raw("BEGIN", "VEVENT")
    .raw("UID", makeUid(owner, "event", ev.source, ev.id))
    .raw("DTSTAMP", stamp);

  if (when.allDay) {
    lines
      .raw("DTSTART;VALUE=DATE", formatDate(when.dayStamp))
      .raw("DTEND;VALUE=DATE", formatDate(when.dayStamp + DAY_MS));
  } else {
    lines
      .raw("DTSTART", formatUtc(new Date(when.instant)))
      .raw("DTEND", formatUtc(new Date(when.instant + DEADLINE_DURATION_MIN * MINUTE_MS)));
  }

  const description = [
    ev.courseName,
    `${TYPE_LABEL[ev.type]} · from ${ev.source === "lms" ? "LMS" : "ERP"}`,
    ev.url,
  ]
    .filter(Boolean)
    .join("\n");

  lines
    .text("SUMMARY", ev.title)
    .text("DESCRIPTION", description)
    .raw("CATEGORIES", ev.type.toUpperCase())
    // Deadlines shouldn't mark the student as busy.
    .raw("TRANSP", "TRANSPARENT");
  if (ev.url && /^https?:\/\//i.test(ev.url)) lines.raw("URL", ev.url);

  if (ALARM_TYPES.has(ev.type)) {
    for (const [trigger, label] of [
      ["-P1D", "tomorrow"],
      ["-PT1H", "in 1 hour"],
    ] as const) {
      lines
        .raw("BEGIN", "VALARM")
        .raw("ACTION", "DISPLAY")
        .raw("TRIGGER", trigger)
        .text("DESCRIPTION", `${ev.title} (due ${label})`)
        .raw("END", "VALARM");
    }
  }
  return lines.raw("END", "VEVENT").toString();
}

/* ------------------------------ calendar ------------------------------ */

function timezoneBlock(): string {
  return new Lines()
    .raw("BEGIN", "VTIMEZONE")
    .raw("TZID", CAMPUS_TZ)
    .raw("BEGIN", "STANDARD")
    .raw("DTSTART", "19700101T000000")
    .raw("TZOFFSETFROM", "+0530")
    .raw("TZOFFSETTO", "+0530")
    .raw("TZNAME", "IST")
    .raw("END", "STANDARD")
    .raw("END", "VTIMEZONE")
    .toString();
}

/**
 * Build a complete VCALENDAR document (CRLF line endings, folded lines).
 * Classes repeat weekly for `weeks` weeks from their next occurrence; events
 * of type "class" are skipped (the timetable covers them) and anything older
 * than one day before `now` is dropped.
 */
export function buildCalendar(data: CalendarInput, opts: BuildCalendarOptions): string {
  const now = opts.now;
  if (Number.isNaN(now.getTime())) throw new RangeError("buildCalendar: invalid `now`.");
  const weeks = Math.min(52, Math.max(1, Math.round(opts.weeks ?? DEFAULT_WEEKS)));
  const stamp = formatUtc(now);
  const owner = data.profile.registerNumber;
  const name = data.profile.name.trim();

  let body =
    new Lines()
      .raw("BEGIN", "VCALENDAR")
      .raw("VERSION", "2.0")
      .raw("PRODID", opts.prodId ?? DEFAULT_PRODID)
      .raw("CALSCALE", "GREGORIAN")
      .raw("METHOD", "PUBLISH")
      .text("X-WR-CALNAME", name ? `Classes & deadlines — ${name}` : "Classes & deadlines")
      .raw("X-WR-TIMEZONE", CAMPUS_TZ)
      .toString() + timezoneBlock();

  for (const block of mergeSlots(data.timetable)) {
    body += classEvent(block, owner, now, weeks, stamp);
  }

  const cutoff = now.getTime() - DAY_MS;
  for (const ev of data.events) {
    if (ev.type === "class") continue;
    const when = resolveWhen(ev.date);
    if (!when || when.instant < cutoff) continue;
    body += deadlineEvent(ev, when, owner, stamp);
  }

  return body + new Lines().raw("END", "VCALENDAR").toString();
}
