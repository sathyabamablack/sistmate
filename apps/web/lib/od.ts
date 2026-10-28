import * as React from "react";
import {
  addDays,
  campusNow,
  dateRange,
  isDateKey,
  weekdayOf,
  type HourlyDay,
  type TimetableSlot,
} from "@usp/core";
import { formatDay, periodStarts } from "./attendance-days";
import { rangeDays, type DateRange } from "./attendance-range";

/**
 * OD and medical leave tracker (/od).
 *
 * A student logs the hours they missed for an OD or a medical leave. The ERP marks
 * those hours absent and takes weeks to change them after the OD form is approved,
 * so each entry is checked against the ERP's hour-wise attendance on every visit:
 * present now means the ERP has caught up; still absent means it has not.
 *
 * Entries live in this browser only (localStorage, "usp-od-v1"). Everything here
 * except `useOdEntries` is pure, so tests run it and the dashboard can reuse it.
 *
 * Hours: hour N of a day is the N-th period start of the weekly timetable (see
 * `periodStarts`), the same numbering the ERP's hour-wise attendance uses.
 */

export const OD_STORAGE_KEY = "usp-od-v1";
export const OD_VERSION = 1;
/** Cache section for GET /api/attendance/hourly (one per student; drop it on sign-out with the others). */
export const OD_HOURLY_SECTION = "hourly-attendance@od";

/** Entries kept; the oldest are dropped past this. */
export const OD_MAX_ENTRIES = 200;
export const OD_MAX_NOTE = 140;
/** One entry covers at most this many days. */
export const OD_MAX_RANGE_DAYS = 31;
/** Entries can be logged this far back and ahead. */
export const OD_MAX_BACK_DAYS = 365;
export const OD_MAX_AHEAD_DAYS = 60;
/** The hour-wise endpoint answers at most this many days at a time. */
export const OD_FETCH_MAX_DAYS = 120;
/** Still absent in the ERP after this many days: worth a reminder to the class advisor. */
export const OD_FOLLOW_UP_DAYS = 7;
/** Highest hour number accepted from storage. */
const MAX_HOUR = 12;

export type OdKind = "od" | "medical" | "other";
export const OD_KINDS: readonly OdKind[] = ["od", "medical", "other"];
export const OD_KIND_LABEL: Record<OdKind, string> = {
  od: "On duty",
  medical: "Medical leave",
  other: "Other",
};

/** ODs count as attended once approved; medical leave depends on the department. */
export const defaultCounted = (kind: OdKind): boolean => kind === "od";

/** What the ERP showed for an entry, remembered for visits when those dates are not loaded. */
export interface OdLastSeen {
  status: "pending" | "not-entered" | "updated";
  /** oldest date with an hour still absent */
  since: string | null;
  /** the date this status was first seen */
  on: string;
  /** the status before, when it changed */
  was?: "pending" | "not-entered";
}

export interface OdEntry {
  id: string;
  kind: OdKind;
  /** campus dates, inclusive; `to === from` for one day */
  from: string;
  to: string;
  /** hour numbers, or null for the whole day */
  hours: number[] | null;
  note: string;
  /** counts as attended in the projection */
  counted: boolean;
  /** ISO time it was logged */
  createdAt: string;
  last?: OdLastSeen;
}

export interface OdState {
  v: typeof OD_VERSION;
  entries: OdEntry[];
}

/* ------------------------------- parsing ------------------------------- */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Whole hour numbers 1..12, unique and sorted. */
export function cleanHours(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const hours = value.filter((h): h is number => Number.isInteger(h) && h >= 1 && h <= MAX_HOUR);
  return [...new Set(hours)].sort((a, b) => a - b);
}

function parseLastSeen(value: unknown): OdLastSeen | undefined {
  if (!isRecord(value)) return undefined;
  const { status, since, on, was } = value;
  if (status !== "pending" && status !== "not-entered" && status !== "updated") return undefined;
  if (!isDateKey(on)) return undefined;
  const seen: OdLastSeen = { status, since: isDateKey(since) ? since : null, on };
  if ((was === "pending" || was === "not-entered") && was !== status) seen.was = was;
  return seen;
}

/** One stored entry, repaired where possible; null when it cannot be used. */
export function parseOdEntry(value: unknown): OdEntry | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim().slice(0, 64) : "";
  if (!id || !isDateKey(value.from)) return null;
  const kind: OdKind = OD_KINDS.includes(value.kind as OdKind) ? (value.kind as OdKind) : "other";
  let from = value.from;
  let to = isDateKey(value.to) ? value.to : from;
  if (to < from) [from, to] = [to, from];
  if (rangeDays({ from, to }) > OD_MAX_RANGE_DAYS) to = addDays(from, OD_MAX_RANGE_DAYS - 1);
  const hours = value.hours === null ? [] : cleanHours(value.hours);
  const entry: OdEntry = {
    id,
    kind,
    from,
    to,
    hours: hours.length > 0 ? hours : null,
    note: typeof value.note === "string" ? value.note.trim().slice(0, OD_MAX_NOTE) : "",
    counted: typeof value.counted === "boolean" ? value.counted : defaultCounted(kind),
    createdAt: typeof value.createdAt === "string" ? value.createdAt.slice(0, 40) : "",
  };
  const last = parseLastSeen(value.last);
  if (last) entry.last = last;
  return entry;
}

/** The saved tracker. Anything unreadable becomes an empty list; bad entries are dropped one by one. */
export function parseOdState(raw: string | null | undefined): OdState {
  const empty: OdState = { v: OD_VERSION, entries: [] };
  if (!raw) return empty;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!isRecord(data) || data.v !== OD_VERSION || !Array.isArray(data.entries)) return empty;
  const seen = new Set<string>();
  const entries: OdEntry[] = [];
  for (const item of data.entries) {
    const entry = parseOdEntry(item);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
    if (entries.length === OD_MAX_ENTRIES) break;
  }
  return { v: OD_VERSION, entries };
}

export const serializeOdState = (state: OdState): string => JSON.stringify(state);

export function newOdId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* insecure context: fall through */
  }
  return `od-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* -------------------------------- form -------------------------------- */

/** The add / edit form's fields. */
export interface OdDraft {
  kind: OdKind;
  from: string;
  /** last day, used when `multi` */
  to: string;
  multi: boolean;
  wholeDay: boolean;
  hours: number[];
  note: string;
  counted: boolean;
}

export type OdDraftErrors = Partial<Record<"from" | "to" | "hours", string>>;

export function emptyDraft(today: string): OdDraft {
  return { kind: "od", from: today, to: "", multi: false, wholeDay: true, hours: [], note: "", counted: true };
}

export function draftFromEntry(entry: OdEntry): OdDraft {
  return {
    kind: entry.kind,
    from: entry.from,
    to: entry.to === entry.from ? "" : entry.to,
    multi: entry.to !== entry.from,
    wholeDay: entry.hours === null,
    hours: entry.hours ?? [],
    note: entry.note,
    counted: entry.counted,
  };
}

export type OdEntryFields = Pick<OdEntry, "kind" | "from" | "to" | "hours" | "note" | "counted">;

/** Check the form; the entry's fields when it is fine, else a message per field. */
export function validateDraft(
  draft: OdDraft,
  today: string,
): { ok: true; value: OdEntryFields } | { ok: false; errors: OdDraftErrors } {
  const errors: OdDraftErrors = {};
  const earliest = addDays(today, -OD_MAX_BACK_DAYS);
  const latest = addDays(today, OD_MAX_AHEAD_DAYS);
  const from = draft.from.trim();
  const to = draft.multi ? draft.to.trim() : from;
  if (!isDateKey(from)) errors.from = "Pick a date.";
  else if (from < earliest) errors.from = "Pick a date in the last year.";
  else if (from > latest) errors.from = `Pick a date in the next ${OD_MAX_AHEAD_DAYS} days.`;
  if (draft.multi && !errors.from) {
    if (!isDateKey(to)) errors.to = "Pick the last day.";
    else if (to <= from) errors.to = "Pick a day after the first day.";
    else if (rangeDays({ from, to }) > OD_MAX_RANGE_DAYS) errors.to = `Keep it to ${OD_MAX_RANGE_DAYS} days or fewer.`;
    else if (to > latest) errors.to = `Pick a date in the next ${OD_MAX_AHEAD_DAYS} days.`;
  }
  const hours = cleanHours(draft.hours);
  if (!draft.wholeDay && hours.length === 0) errors.hours = "Pick at least one hour.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      kind: draft.kind,
      from,
      to,
      hours: draft.wholeDay ? null : hours,
      note: draft.note.trim().slice(0, OD_MAX_NOTE),
      counted: draft.counted,
    },
  };
}

/** Whether an edit changes which hours an entry covers (its saved ERP status no longer applies). */
export const coverageChanged = (a: OdEntryFields, b: OdEntryFields): boolean =>
  a.from !== b.from || a.to !== b.to || (a.hours ?? []).join() !== (b.hours ?? []).join();

/* ----------------------------- timetable ----------------------------- */

/** Timetable day (0 = Monday ... 6 = Sunday) of a campus date. */
export const timetableDayOf = (date: string): number => (weekdayOf(date) + 6) % 7;

export interface HourSlot {
  hour: number;
  start: string;
  code: string;
  title: string;
}

/** The classes on `date`'s weekday, by hour number. */
export function slotsForDate(
  timetable: readonly TimetableSlot[],
  date: string,
  periods: readonly string[] = periodStarts(timetable),
): HourSlot[] {
  const day = timetableDayOf(date);
  return periods.flatMap((start, i) => {
    const slot = timetable.find((s) => s.day === day && s.startTime === start);
    return slot ? [{ hour: i + 1, start, code: slot.courseCode, title: slot.courseTitle }] : [];
  });
}

export interface HourOption {
  hour: number;
  /** period start, "09:50" */
  start: string;
  /** the subject, when every chosen day has the same one in this hour */
  subject?: { code: string; title: string };
}

/** Hours to pick from for a date or range: every hour with a class on any of its days. */
export function hourOptions(timetable: readonly TimetableSlot[], from: string, to: string = from): HourOption[] {
  const periods = periodStarts(timetable);
  const dates = isDateKey(from) && isDateKey(to) && to >= from ? dateRange(from, to).slice(0, OD_MAX_RANGE_DAYS) : [];
  const perDay = dates.map((d) => slotsForDate(timetable, d, periods)).filter((s) => s.length > 0);
  const byHour = new Map<number, HourOption & { codes: Set<string>; title: string }>();
  for (const slots of perDay) {
    for (const s of slots) {
      const o = byHour.get(s.hour) ?? { hour: s.hour, start: s.start, codes: new Set<string>(), title: s.title };
      o.codes.add(s.code);
      byHour.set(s.hour, o);
    }
  }
  return [...byHour.values()]
    .sort((a, b) => a.hour - b.hour)
    .map((o) => {
      const sameEveryDay = o.codes.size === 1 && perDay.every((slots) => slots.some((s) => s.hour === o.hour));
      const code = [...o.codes][0]!;
      return { hour: o.hour, start: o.start, ...(sameEveryDay ? { subject: { code, title: o.title } } : {}) };
    });
}

const SMALL_WORDS = new Set(["and", "of", "in", "for", "the", "to", "with", "on", "a", "an", "&", "-"]);
/** Words students abbreviate with more than one letter ("DBMS", not "DMS"). */
const WORD_INITIALS: Record<string, string> = { database: "DB" };

/** "Design and Analysis of Algorithms" -> "DAA"; short titles stay as they are. */
export function shortTitle(title: string): string {
  const t = title.trim();
  if (t.length <= 14) return t;
  const words = t.split(/\s+/).filter((w) => !SMALL_WORDS.has(w.toLowerCase()) && /^[A-Za-z]/.test(w));
  if (words.length < 2) return t;
  return words
    .map((w) => WORD_INITIALS[w.toLowerCase()] ?? (/^[A-Z0-9]{2,}$/.test(w) ? w : w[0]!.toUpperCase()))
    .join("");
}

/* --------------------------- ERP comparison --------------------------- */

/** The ERP's hour-wise days that are loaded, and the date ranges they answer for. */
export interface ErpHours {
  byDate: ReadonlyMap<string, HourlyDay>;
  /** dates in these ranges without a day had no hour-wise record in the ERP */
  ranges: readonly DateRange[];
}

export function erpHours(days: readonly HourlyDay[], ranges: readonly DateRange[] = []): ErpHours {
  const byDate = new Map<string, HourlyDay>();
  for (const d of days) byDate.set(d.date, d);
  return { byDate, ranges: ranges.filter((r) => r.from <= r.to) };
}

const isCovered = (erp: ErpHours, date: string) =>
  erp.byDate.has(date) || erp.ranges.some((r) => date >= r.from && date <= r.to);

interface HourLists {
  present: Set<number>;
  absent: Set<number>;
  notGiven: Set<number>;
  all: number[];
}

/** The ERP's per-hour lists for a day, when it names the hours. */
function hourLists(day: HourlyDay): HourLists | null {
  if (!day.presentHours && !day.absentHours && !day.notGivenHours) return null;
  const present = new Set(day.presentHours ?? []);
  const absent = new Set(day.absentHours ?? []);
  const notGiven = new Set(day.notGivenHours ?? []);
  const all = [...new Set([...present, ...absent, ...notGiven])].sort((a, b) => a - b);
  return { present, absent, notGiven, all };
}

/**
 *  - updated: present in the ERP now (the OD went through, or the hour was never absent);
 *  - pending: still absent;
 *  - not-entered: the faculty has not entered the hour yet;
 *  - upcoming: the date is still ahead;
 *  - unchecked: the ERP's hours for that date are not loaded.
 */
export type OdHourStatus = "updated" | "pending" | "not-entered" | "upcoming" | "unchecked";

export interface OdHour {
  date: string;
  hour: number;
  /** from the timetable, when it has a class in that hour */
  code?: string;
  title?: string;
  status: OdHourStatus;
}

export type OdStatus = OdHourStatus | "no-classes";

export interface OdCheck {
  status: OdStatus;
  hours: OdHour[];
  /** oldest date with an hour still absent */
  pendingSince: string | null;
  /** days from `pendingSince` to today */
  pendingDays: number | null;
  /** still absent after more than a week */
  followUp: boolean;
  /** the status comes from an earlier visit: these dates are not loaded now */
  fromLastCheck: boolean;
}

const DAY_MS = 86_400_000;
/** Whole days from `from` to `to` (campus dates). */
export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

function hourStatus(date: string, hour: number, today: string, record: HourlyDay | undefined, lists: HourLists | null, covered: boolean): OdHourStatus {
  if (date > today) return "upcoming";
  if (record) {
    if (lists) {
      if (lists.present.has(hour)) return "updated";
      if (lists.absent.has(hour)) return "pending";
      return "not-entered";
    }
    // Counts only: the hours cannot be told apart, so the day decides.
    if (record.absent > 0) return "pending";
    return record.notGiven > 0 ? "not-entered" : "updated";
  }
  return covered ? "not-entered" : "unchecked";
}

/** The hours an entry covers and what the ERP shows for each. */
export function entryHours(
  entry: Pick<OdEntry, "from" | "to" | "hours">,
  erp: ErpHours,
  timetable: readonly TimetableSlot[],
  today: string,
): OdHour[] {
  const periods = periodStarts(timetable);
  const dates = dateRange(entry.from, entry.to);
  const multi = dates.length > 1;
  // Once the ERP has posted some of a range, a past date it has nothing for had no classes (a holiday).
  const postedSome = dates.some((d) => erp.byDate.has(d));
  const out: OdHour[] = [];
  for (const date of dates) {
    const record = erp.byDate.get(date);
    const covered = isCovered(erp, date);
    if (!record && multi && postedSome && covered && date < today) continue;
    const slots = slotsForDate(timetable, date, periods);
    const lists = record ? hourLists(record) : null;
    const listed = lists && lists.all.length > 0 ? lists.all : null;
    let hours: number[];
    if (entry.hours) {
      // Only hours with a class that day: the ERP's list when it names the hours, else the timetable.
      hours = entry.hours.filter((h) =>
        listed ? listed.includes(h) : timetable.length === 0 || slots.some((s) => s.hour === h),
      );
    } else if (listed) {
      hours = listed;
    } else if (record && record.totalHours === 0) {
      hours = [];
    } else if (slots.length > 0) {
      hours = slots.map((s) => s.hour);
    } else {
      hours = record ? Array.from({ length: record.totalHours }, (_, i) => i + 1) : [];
    }
    for (const hour of hours) {
      const slot = slots.find((s) => s.hour === hour);
      out.push({
        date,
        hour,
        ...(slot ? { code: slot.code, title: slot.title } : {}),
        status: hourStatus(date, hour, today, record, lists, covered),
      });
    }
  }
  return out;
}

/** An entry against the ERP: one status, plus each hour's. */
export function checkEntry(
  entry: OdEntry,
  erp: ErpHours,
  timetable: readonly TimetableSlot[],
  today: string,
): OdCheck {
  const hours = entryHours(entry, erp, timetable, today);
  const has = (s: OdHourStatus) => hours.some((h) => h.status === s);
  let pendingSince = hours.filter((h) => h.status === "pending").map((h) => h.date).sort()[0] ?? null;
  let fromLastCheck = false;
  let status: OdStatus;
  if (hours.length === 0) status = "no-classes";
  else if (has("pending")) status = "pending";
  else if (has("not-entered")) status = "not-entered";
  else if (has("unchecked")) {
    if (entry.last) {
      status = entry.last.status;
      pendingSince = entry.last.since;
      fromLastCheck = true;
    } else status = "unchecked";
  } else if (has("upcoming")) status = "upcoming";
  else status = "updated";
  if (status !== "pending") pendingSince = null;
  const pendingDays = pendingSince ? Math.max(0, daysBetween(pendingSince, today)) : null;
  return {
    status,
    hours,
    pendingSince,
    pendingDays,
    followUp: pendingDays !== null && pendingDays > OD_FOLLOW_UP_DAYS,
    fromLastCheck,
  };
}

/** What to remember about an entry after this check; the same object when nothing changed. */
export function nextLastSeen(entry: OdEntry, check: OdCheck, today: string): OdLastSeen | undefined {
  const previous = entry.last;
  if (check.fromLastCheck) return previous;
  if (check.status !== "pending" && check.status !== "not-entered" && check.status !== "updated") return previous;
  if (previous && previous.status === check.status && previous.since === check.pendingSince) return previous;
  const next: OdLastSeen = { status: check.status, since: check.pendingSince, on: today };
  if (previous && previous.status !== check.status && previous.status !== "updated") next.was = previous.status;
  return next;
}

/** The ERP caught up today, after an earlier visit saw the hours absent or not entered: worth a quiet celebration. */
export const justUpdated = (entry: Pick<OdEntry, "last">, today: string): boolean =>
  entry.last?.status === "updated" && !!entry.last.was && entry.last.on === today;

/** For the dashboard and the attendance page: entries still absent in the ERP, and the oldest one's age. */
export function odSummary(
  entries: readonly OdEntry[],
  hourly: readonly HourlyDay[],
  timetable: readonly TimetableSlot[],
  opts: { today?: string; from?: string } = {},
): { pending: number; oldestPendingDays: number | null } {
  const today = opts.today ?? campusNow().date;
  const first = opts.from ?? [...hourly].map((d) => d.date).sort()[0];
  const erp = erpHours(hourly, first ? [{ from: first, to: today }] : []);
  let pending = 0;
  let oldest: number | null = null;
  for (const entry of entries) {
    const check = checkEntry(entry, erp, timetable, today);
    if (check.status !== "pending") continue;
    pending++;
    if (check.pendingDays !== null && (oldest === null || check.pendingDays > oldest)) oldest = check.pendingDays;
  }
  return { pending, oldestPendingDays: oldest };
}

/**
 * The older dates the page should ask the ERP about: entries that are not known to be
 * updated and reach before the dashboard's window (`windowFrom`, null when that did
 * not load). The newest `OD_FETCH_MAX_DAYS` days of that span; null when none.
 */
export function odFetchRange(entries: readonly OdEntry[], windowFrom: string | null, today: string): DateRange | null {
  const end = windowFrom ? addDays(windowFrom, -1) : today;
  let from: string | null = null;
  let to: string | null = null;
  for (const e of entries) {
    if (e.last?.status === "updated" || e.from > end) continue;
    const eTo = e.to < end ? e.to : end;
    if (from === null || e.from < from) from = e.from;
    if (to === null || eTo > to) to = eTo;
  }
  if (from === null || to === null || from > to) return null;
  if (rangeDays({ from, to }) > OD_FETCH_MAX_DAYS) from = addDays(to, -(OD_FETCH_MAX_DAYS - 1));
  return { from, to };
}

/* ------------------------------ projection ----------------------------- */

export interface OdSubject {
  code: string;
  title: string;
  attended: number;
  totalClasses: number;
}

export interface OdProjectionRow {
  code: string;
  title: string;
  attended: number;
  total: number;
  /** still-absent hours the counted entries cover */
  hours: number;
  now: number;
  after: number;
  /** below the threshold now and at or above it after: "back-above" */
  verdict: "back-above" | "still-below" | "above";
}

export interface OdProjection {
  rows: OdProjectionRow[];
  overall: { now: number; after: number } | null;
  /** still-absent hours in entries that do not count as attended */
  uncounted: number;
  /** still-absent hours whose subject could not be matched to the ERP's list */
  unmatched: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const pct = (attended: number, total: number) => (total > 0 ? (attended / total) * 100 : 0);

/**
 * Attendance once the ERP updates what is still absent: those hours move to attended,
 * the total stays (they are already counted as held). An hour two entries share counts once.
 */
export function odProjection(
  items: readonly { entry: OdEntry; check: OdCheck }[],
  subjects: readonly OdSubject[],
  threshold: number,
): OdProjection {
  const counted = new Map<string, OdHour>();
  const other = new Map<string, OdHour>();
  for (const { entry, check } of items) {
    for (const h of check.hours) {
      if (h.status !== "pending") continue;
      const key = `${h.date}#${h.hour}`;
      (entry.counted ? counted : other).set(key, h);
    }
  }
  for (const key of counted.keys()) other.delete(key);

  const extra = new Map<string, number>();
  let unmatched = 0;
  for (const h of counted.values()) {
    const subject =
      (h.code && subjects.find((s) => s.code.toUpperCase() === h.code!.toUpperCase())) ||
      (h.title && subjects.find((s) => norm(s.title) === norm(h.title!)));
    if (!subject) {
      unmatched++;
      continue;
    }
    extra.set(subject.code, (extra.get(subject.code) ?? 0) + 1);
  }

  const rows: OdProjectionRow[] = subjects
    .filter((s) => (extra.get(s.code) ?? 0) > 0 && s.totalClasses > 0)
    .map((s) => {
      const hours = extra.get(s.code)!;
      const total = s.totalClasses;
      const now = pct(s.attended, total);
      const after = pct(Math.min(s.attended + hours, total), total);
      const verdict: OdProjectionRow["verdict"] =
        after < threshold ? "still-below" : now < threshold ? "back-above" : "above";
      return { code: s.code, title: s.title, attended: s.attended, total, hours, now, after, verdict };
    })
    .sort((a, b) => a.now - b.now || a.title.localeCompare(b.title));

  const total = subjects.reduce((n, s) => n + s.totalClasses, 0);
  const attended = subjects.reduce((n, s) => n + s.attended, 0);
  const added = rows.reduce((n, r) => n + Math.min(r.hours, r.total - r.attended), 0);
  return {
    rows,
    overall: rows.length > 0 && total > 0 ? { now: pct(attended, total), after: pct(attended + added, total) } : null,
    uncounted: other.size,
    unmatched,
  };
}

/* ------------------------------- wording ------------------------------- */

/** "1–3, 5" */
export function formatHourList(hours: readonly number[]): string {
  const sorted = [...new Set(hours)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]!;
    let end = start;
    while (sorted[i + 1] === end + 1) end = sorted[++i]!;
    parts.push(end === start ? `${start}` : end === start + 1 ? `${start}, ${end}` : `${start}–${end}`);
  }
  return parts.join(", ");
}

/** "Hour 2", "Hours 1–3, 5" */
export const hoursLabel = (hours: readonly number[]): string =>
  `${hours.length === 1 ? "Hour" : "Hours"} ${formatHourList(hours)}`;

/** "Tue, 20 Oct" or "Mon, 5 Oct to Wed, 7 Oct" */
export const entryDateLabel = (entry: Pick<OdEntry, "from" | "to">): string =>
  entry.from === entry.to ? formatDay(entry.from) : `${formatDay(entry.from)} to ${formatDay(entry.to)}`;

/** "Whole day" or "Hours 2, 3" */
export const entryHoursLabel = (entry: Pick<OdEntry, "hours">): string =>
  entry.hours ? hoursLabel(entry.hours) : "Whole day";

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** Subjects an entry covers, in hour order, with how many hours each: "Web Technology Laboratory ×2". */
export function subjectCounts(hours: readonly OdHour[]): { title: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const h of hours) {
    const title = h.title ?? `Hour ${h.hour}`;
    counts.set(title, (counts.get(title) ?? 0) + 1);
  }
  return [...counts].map(([title, count]) => ({ title, count }));
}

/**
 * Plain text for the class advisor (WhatsApp, email): every entry still absent in the
 * ERP, oldest first, with the dates, hours and subjects still to be updated.
 */
export function advisorText(
  items: readonly { entry: OdEntry; check: OdCheck }[],
  student: { name?: string; registerNumber?: string } = {},
): string {
  const pending = items
    .filter((i) => i.check.status === "pending")
    .sort((a, b) => a.entry.from.localeCompare(b.entry.from));
  if (pending.length === 0) return "";
  const who = [student.name?.trim(), student.registerNumber?.trim()].filter(Boolean).join(", ");
  const lines = ["OD and leave not yet updated in the ERP"];
  if (who) lines.push(who);
  pending.forEach(({ entry, check }, i) => {
    lines.push("", `${i + 1}. ${OD_KIND_LABEL[entry.kind]}: ${entryDateLabel(entry)}`);
    // One line per date: "Hours 1–7: subjects", with the date in front for a range.
    const absent = check.hours.filter((h) => h.status === "pending");
    for (const date of [...new Set(absent.map((h) => h.date))]) {
      const hours = absent.filter((h) => h.date === date);
      const titles = [...new Set(hours.map((h) => h.title).filter(Boolean))].join(", ");
      const what = `${hours.length === 1 ? "hour" : "hours"} ${formatHourList(hours.map((h) => h.hour))}${titles ? `: ${titles}` : ""}`;
      lines.push(`   ${entry.from === entry.to ? what[0]!.toUpperCase() + what.slice(1) : `${formatDay(date)}, ${what}`}`);
    }
    if (entry.note) lines.push(`   Note: ${entry.note}`);
  });
  return lines.join("\n");
}

/* ------------------------------ suggestions ---------------------------- */

export interface AbsenceSuggestion {
  date: string;
  /** the absent hours, when the ERP names them */
  hours: number[];
  /** every hour of the day was absent */
  wholeDay: boolean;
  absent: number;
}

/** Recent days with hours marked absent that no entry covers yet, newest first. */
export function recentAbsences(
  hourly: readonly HourlyDay[],
  entries: readonly Pick<OdEntry, "from" | "to" | "hours">[],
  today: string,
  limit = 3,
): AbsenceSuggestion[] {
  const out: AbsenceSuggestion[] = [];
  const days = [...hourly].filter((d) => d.absent > 0 && d.date <= today).sort((a, b) => b.date.localeCompare(a.date));
  for (const day of days) {
    const covering = entries.filter((e) => day.date >= e.from && day.date <= e.to);
    if (covering.some((e) => e.hours === null)) continue;
    const lists = hourLists(day);
    const absentHours = lists ? [...lists.absent].sort((a, b) => a - b) : [];
    const taken = new Set(covering.flatMap((e) => e.hours ?? []));
    if (lists ? absentHours.every((h) => taken.has(h)) : covering.length > 0) continue;
    const wholeDay = lists ? absentHours.length === lists.all.length : day.present === 0 && day.notGiven === 0;
    out.push({ date: day.date, hours: absentHours, wholeDay, absent: day.absent });
    if (out.length === limit) break;
  }
  return out;
}

/* -------------------------------- storage -------------------------------- */

// Entries live in this browser only. A module-level copy keeps edits working when
// storage is blocked (private windows, cleared site data).
let memory: string | null = null;
const listeners = new Set<() => void>();

function readStorage(): string {
  try {
    return localStorage.getItem(OD_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}
const getSnapshot = (): string | null => memory ?? readStorage();
// null until the browser has read storage, so the page can wait instead of flashing "empty".
const getServerSnapshot = (): string | null => null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === OD_STORAGE_KEY || e.key === null) {
      memory = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function writeEntries(entries: OdEntry[]) {
  const json = serializeOdState({ v: OD_VERSION, entries: entries.slice(0, OD_MAX_ENTRIES) });
  memory = json;
  try {
    localStorage.setItem(OD_STORAGE_KEY, json);
  } catch {
    /* kept in memory for this visit */
  }
  listeners.forEach((l) => l());
}

const currentEntries = (): OdEntry[] => parseOdState(getSnapshot()).entries;

const store = {
  /** Newest first. */
  add(fields: OdEntryFields): OdEntry {
    const entry: OdEntry = { id: newOdId(), ...fields, createdAt: new Date().toISOString() };
    writeEntries([entry, ...currentEntries()]);
    return entry;
  },
  /** A changed date or hours forgets the saved ERP status: it was about other hours. */
  update(id: string, fields: OdEntryFields): void {
    writeEntries(
      currentEntries().map((e) => {
        if (e.id !== id) return e;
        const next: OdEntry = { ...e, ...fields };
        if (coverageChanged(e, fields)) delete next.last;
        return next;
      }),
    );
  },
  /** Removes an entry; returns it with its place, for undo. */
  remove(id: string): { entry: OdEntry; index: number } | null {
    const entries = currentEntries();
    const index = entries.findIndex((e) => e.id === id);
    if (index < 0) return null;
    const [entry] = entries.splice(index, 1);
    writeEntries(entries);
    return { entry: entry!, index };
  },
  restore(entry: OdEntry, index: number): void {
    const entries = currentEntries().filter((e) => e.id !== entry.id);
    entries.splice(Math.min(Math.max(index, 0), entries.length), 0, entry);
    writeEntries(entries);
  },
  /** Saves what the ERP showed, for entries whose status changed. */
  remember(seen: ReadonlyMap<string, OdLastSeen>): void {
    if (seen.size === 0) return;
    writeEntries(currentEntries().map((e) => (seen.has(e.id) ? { ...e, last: seen.get(e.id)! } : e)));
  },
};

/**
 * The saved entries, newest first, kept in step across tabs. `ready` is false until the
 * browser has read storage (on the server and during hydration).
 */
export function useOdEntries(): { entries: OdEntry[]; ready: boolean } & typeof store {
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const entries = React.useMemo(() => (snapshot === null ? [] : parseOdState(snapshot).entries), [snapshot]);
  return { entries, ready: snapshot !== null, ...store };
}
