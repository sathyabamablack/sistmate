import type { TimetableSlot } from "@usp/core";
import { timeToMinutes, type CampusClock } from "./utils";
import type { TimeFormat } from "./prefs";

export type SlotState = "now" | "done" | "later";

export interface PeriodRow {
  type: "period";
  start: string;
  end: string;
  cells: Map<number, TimetableSlot[]>;
}
export interface BreakRow {
  type: "break";
  start: string;
  end: string;
  minutes: number;
}
export type WeekRow = PeriodRow | BreakRow;

export interface Subject {
  code: string;
  title: string;
  periods: number;
  faculty?: string;
  room?: string;
  /** CSS colour (`hsl(var(--cat-N))`) for inline styles. */
  accent: string;
  /** 0-based categorical slot; use `catClasses(cat)` for Tailwind classes. */
  cat: number;
}

export interface Week {
  days: number[];
  rows: WeekRow[];
  subjects: Map<string, Subject>;
  slotsByDay: Map<number, TimetableSlot[]>;
}

/** Number of categorical tokens (`--cat-1`..`--cat-8`) in globals.css. */
export const CAT_COUNT = 8;

/** Static class strings so Tailwind can see them; index = cat number - 1. */
const CAT_BG = [
  "bg-cat-1",
  "bg-cat-2",
  "bg-cat-3",
  "bg-cat-4",
  "bg-cat-5",
  "bg-cat-6",
  "bg-cat-7",
  "bg-cat-8",
] as const;
const CAT_BORDER = [
  "border-cat-1",
  "border-cat-2",
  "border-cat-3",
  "border-cat-4",
  "border-cat-5",
  "border-cat-6",
  "border-cat-7",
  "border-cat-8",
] as const;
const CAT_TEXT = [
  "text-cat-1",
  "text-cat-2",
  "text-cat-3",
  "text-cat-4",
  "text-cat-5",
  "text-cat-6",
  "text-cat-7",
  "text-cat-8",
] as const;

/** CSS colour for a 0-based categorical slot (wraps). Themed: light and dark are both checked. */
export function accentFor(index: number): string {
  return `hsl(var(--cat-${(index % CAT_COUNT) + 1}))`;
}

export function catClasses(cat: number) {
  const i = ((cat % CAT_COUNT) + CAT_COUNT) % CAT_COUNT;
  return { bg: CAT_BG[i]!, border: CAT_BORDER[i]!, text: CAT_TEXT[i]! };
}

function hashCode(code: string): number {
  let h = 2166136261;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Stable course code -> category slot (0-based). A code keeps its colour from week to
 * week unless another code in the same week hashes to the same slot; then the later
 * code (in sorted order) moves to the next free one, so colours stay distinct.
 */
export function assignCategories(codes: string[]): Map<string, number> {
  const taken = new Set<number>();
  const out = new Map<string, number>();
  for (const code of [...codes].sort()) {
    let slot = hashCode(code) % CAT_COUNT;
    for (let tries = 0; tries < CAT_COUNT && taken.has(slot); tries++) slot = (slot + 1) % CAT_COUNT;
    taken.add(slot);
    out.set(code, slot);
  }
  return out;
}

const byStart = (a: TimetableSlot, b: TimetableSlot) =>
  timeToMinutes(a.startTime) - timeToMinutes(b.startTime);

export function buildWeek(slots: TimetableSlot[]): Week {
  const present = new Set(slots.map((s) => s.day));
  const days = [0, 1, 2, 3, 4];
  if (present.has(5) || present.has(6)) days.push(5);
  if (present.has(6)) days.push(6);

  const slotsByDay = new Map<number, TimetableSlot[]>();
  for (const d of days) slotsByDay.set(d, slots.filter((s) => s.day === d).sort(byStart));

  const periods = new Map<string, PeriodRow>();
  for (const s of slots) {
    const key = `${s.startTime}-${s.endTime}`;
    let row = periods.get(key);
    if (!row) {
      row = { type: "period", start: s.startTime, end: s.endTime, cells: new Map() };
      periods.set(key, row);
    }
    row.cells.set(s.day, [...(row.cells.get(s.day) ?? []), s]);
  }
  const sorted = [...periods.values()].sort(
    (a, b) => timeToMinutes(a.start) - timeToMinutes(b.start),
  );

  const rows: WeekRow[] = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (prev) {
      const gap = timeToMinutes(p.start) - timeToMinutes(prev.end);
      if (gap > 0) rows.push({ type: "break", start: prev.end, end: p.start, minutes: gap });
    }
    rows.push(p);
  });

  const codes = [...new Set(slots.map((s) => s.courseCode))].sort();
  const subjects = new Map<string, Subject>();
  const cats = assignCategories(codes);
  codes.forEach((code) => {
    const cat = cats.get(code)!;
    const mine = slots.filter((s) => s.courseCode === code);
    subjects.set(code, {
      code,
      title: mine[0]!.courseTitle,
      periods: mine.length,
      faculty: mine.find((s) => s.faculty)?.faculty,
      room: mine.find((s) => s.room)?.room,
      accent: accentFor(cat),
      cat,
    });
  });

  return { days, rows, subjects, slotsByDay };
}

/** Where a slot sits relative to the campus clock (only today's slots can be now/done). */
export function slotState(slot: TimetableSlot, clock: CampusClock): SlotState {
  if (slot.day !== clock.dayIndex) return "later";
  if (timeToMinutes(slot.endTime) <= clock.minutes) return "done";
  if (timeToMinutes(slot.startTime) <= clock.minutes) return "now";
  return "later";
}

export interface NowNext {
  now?: TimetableSlot;
  /** the next class later today */
  next?: TimetableSlot;
  /** first class on a following day, when nothing is left today */
  following?: TimetableSlot;
}

export function findNowNext(week: Week, clock: CampusClock): NowNext {
  const today = week.slotsByDay.get(clock.dayIndex) ?? [];
  const now = today.find((s) => slotState(s, clock) === "now");
  const next = today.find((s) => timeToMinutes(s.startTime) > clock.minutes);
  if (next) return { now, next };
  for (let i = 1; i <= 7; i++) {
    const first = week.slotsByDay.get((clock.dayIndex + i) % 7)?.[0];
    if (first) return { now, following: first };
  }
  return { now };
}

/** "13:15" -> "1:15" (no am/pm: the grid is unambiguous within a college day), or "13:15" in 24-hour mode. */
export function clockTime(hhmm: string, timeFormat: TimeFormat = "12h"): string {
  const m = timeToMinutes(hhmm);
  if (Number.isNaN(m)) return hhmm;
  if (timeFormat === "24h") return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const h = Math.floor(m / 60) % 12 || 12;
  return `${h}:${String(m % 60).padStart(2, "0")}`;
}

/** 75 -> "1 h 15 min", 15 -> "15 min" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
