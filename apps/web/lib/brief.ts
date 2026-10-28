import type {
  Assignment,
  AttendanceSubject,
  CalendarEvent,
  DashboardData,
  SubjectMarks,
  TimetableSlot,
} from "@usp/core";
import { formatPct } from "./attendance";
import { extractCodes, type ErpSubject } from "./course-names";
import { OD_FOLLOW_UP_DAYS } from "./od";
import type { TimeFormat } from "./prefs";
import { attendanceRisks, nextCountdowns } from "./risk";
import { isDuplicateDeadline } from "./timeline";
import { campusClock, dayName, daysUntil, formatTime, timeToMinutes } from "./utils";

/**
 * The dashboard's brief: the few things that need the student today, one short line
 * each, starting with what to do. Pure functions, no I/O. The page builds the lines on
 * the server; the client adds the OD line, whose entries live in the browser.
 *
 * What the brief has to remember (the marks already seen, a dismissal for today, the
 * last OD count) rides in one small cookie rather than localStorage, so the server can
 * draw the card exactly as it will stay: nothing appears or disappears on hydration.
 */

export type BriefKind = "attendance" | "assignment" | "marks" | "od" | "exam";
export type BriefTone = "danger" | "warning" | "primary";

export interface BriefLine {
  /** Stable key. */
  id: string;
  kind: BriefKind;
  tone: BriefTone;
  /** Starts with what to do: "Attend Operating Systems at 1:30 pm, you're at 79.2%". */
  text: string;
  /** A quieter second line, when there is more to say. */
  detail?: string;
  href: string;
}

export const MAX_LINES = 4;
/** Unsubmitted work due within this many hours makes the brief. */
export const DUE_WINDOW_HOURS = 48;
/** An exam this many days away or fewer gets a prep line. */
export const EXAM_WINDOW_DAYS = 14;

/* ------------------------------- memory ------------------------------- */

export const BRIEF_COOKIE = "usp-brief-v1";
const YEAR_SECONDS = 60 * 60 * 24 * 365;
const MAX_SEEN = 400;

export interface BriefMemory {
  /** Whose marks `seen` describes: a hash of the register number. */
  user?: string;
  /** The campus day the brief was dismissed. */
  dismissed?: string;
  /** Every mark (component and score, hashed) on the last visit; absent before the first. */
  seen?: string[];
  /** Marks first noticed on `day`: they stay in the brief for the rest of that day. */
  fresh?: { day: string; keys: string[] };
  /** Pending ODs at the last count, so the server can draw that line too. */
  od?: OdCount;
}

export interface OdCount {
  pending: number;
  oldestDays: number | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HASH = /^[0-9a-z]{1,7}$/;

/** FNV-1a in base 36: short, stable, and plenty to tell a few dozen marks apart. */
export function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** One graded component, as the brief remembers it. A changed score counts as a new mark. */
export const markKey = (code: string, name: string, scored: number, max: number): string =>
  shortHash(`${code.trim().toUpperCase()}|${name.trim().toLowerCase()}|${scored}/${max}`);

/** "u.1x2y_d.2026-10-28_s.a.b_f.2026-10-28.a_o.2.9": only characters a cookie takes as they are. */
export function serializeBriefMemory(m: BriefMemory): string {
  const parts: string[] = [];
  if (m.user) parts.push(`u.${m.user}`);
  if (m.dismissed) parts.push(`d.${m.dismissed}`);
  if (m.seen) parts.push(["s", ...m.seen.slice(0, MAX_SEEN)].join("."));
  if (m.fresh && m.fresh.keys.length > 0) parts.push(["f", m.fresh.day, ...m.fresh.keys].join("."));
  if (m.od && m.od.pending > 0) parts.push(`o.${m.od.pending}.${m.od.oldestDays ?? "x"}`);
  return parts.join("_");
}

/** Anything unreadable is dropped field by field; the brief then simply starts over. */
export function parseBriefMemory(raw: string | null | undefined): BriefMemory {
  const out: BriefMemory = {};
  if (!raw) return out;
  for (const part of raw.split("_")) {
    const [key, ...rest] = part.split(".");
    if (key === "u" && rest.length === 1 && HASH.test(rest[0]!)) out.user = rest[0];
    else if (key === "d" && rest.length === 1 && DAY.test(rest[0]!)) out.dismissed = rest[0];
    else if (key === "s") out.seen = rest.filter((h) => HASH.test(h)).slice(0, MAX_SEEN);
    else if (key === "f" && rest.length > 1 && DAY.test(rest[0]!)) {
      out.fresh = { day: rest[0]!, keys: rest.slice(1).filter((h) => HASH.test(h)) };
    } else if (key === "o" && rest.length === 2) {
      const pending = Number(rest[0]);
      const oldest = rest[1] === "x" ? null : Number(rest[1]);
      if (Number.isInteger(pending) && pending > 0 && (oldest === null || Number.isInteger(oldest))) {
        out.od = { pending, oldestDays: oldest };
      }
    }
  }
  return out;
}

/** The brief's memory from a `document.cookie` string. */
export function readBriefCookie(cookieHeader: string): BriefMemory {
  const prefix = `${BRIEF_COOKIE}=`;
  const entry = cookieHeader.split(/;\s*/).find((c) => c.startsWith(prefix));
  return parseBriefMemory(entry?.slice(prefix.length));
}

/** A `document.cookie` assignment that keeps the memory for a year. */
export function briefCookieString(m: BriefMemory, secure = false): string {
  return `${BRIEF_COOKIE}=${serializeBriefMemory(m)}; path=/; max-age=${YEAR_SECONDS}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** The campus date, "2026-10-28": the brief's idea of "today". */
export function campusDayKey(now: Date): string {
  return new Date(campusClock(now).dayStamp).toISOString().slice(0, 10);
}

/* ------------------------------ the lines ------------------------------ */

/** "A", "A and B", "A, B and 2 more". */
function nameList(names: string[], max = 2): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= max) return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

const sameCode = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();

/**
 * At-risk subjects (lib/risk.ts) that still have a class today, worst first, in one line:
 * "Attend Design and Analysis of Algorithms at 9:50 am, you're at 62.5%". Back-to-back
 * periods of a subject (a lab block) count as one class.
 */
export function attendanceLine(
  subjects: AttendanceSubject[],
  timetable: TimetableSlot[],
  now: Date,
  { threshold, timeFormat }: { threshold: number; timeFormat: TimeFormat },
): BriefLine | null {
  const clock = campusClock(now);
  const left = timetable
    .filter((s) => s.day === clock.dayIndex && timeToMinutes(s.endTime) > clock.minutes)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const risks = attendanceRisks(subjects, threshold).filter((r) => left.some((s) => sameCode(s.courseCode, r.code)));
  const [worst, ...others] = risks;
  if (!worst) return null;

  const classes: { start: string; end: string }[] = [];
  for (const s of left.filter((x) => sameCode(x.courseCode, worst.code))) {
    const last = classes.at(-1);
    if (last && timeToMinutes(s.startTime) === timeToMinutes(last.end)) last.end = s.endTime;
    else classes.push({ start: s.startTime, end: s.endTime });
  }
  const first = classes[0]!;
  const what =
    classes.length > 2
      ? `Attend all ${classes.length} ${worst.title} classes today`
      : classes.length === 2
        ? `Attend both ${worst.title} classes today`
        : timeToMinutes(first.start) <= clock.minutes
          ? `Attend ${worst.title} now`
          : `Attend ${worst.title} at ${formatTime(first.start, timeFormat)}`;
  return {
    id: `attendance:${worst.code}`,
    kind: "attendance",
    tone: worst.level === "below" ? "danger" : "warning",
    text: `${what}, you're at ${formatPct(worst.percentage)}`,
    // Kept to a count: the alert above already names the worst subject, the table all of them.
    detail:
      others.length === 0
        ? undefined
        : `Also attend ${others.length === 1 ? others[0]!.title : `${others.length} other at-risk subjects`} today`,
    href: "/attendance",
  };
}

const hasClockTime = (iso: string) => /T\d{2}:\d{2}/.test(iso);

/** When work is due, as an instant. A date with no time is due by the end of that campus day (IST has no DST). */
function dueInstant(iso: string): number {
  return hasClockTime(iso) ? new Date(iso).getTime() : new Date(`${iso.slice(0, 10)}T23:59:59+05:30`).getTime();
}

/** "by 11:59 pm tomorrow", "by 5:00 pm today", "by 9:00 am on Friday"; "by Friday" without a time. */
export function dueWhen(iso: string, now: Date, timeFormat: TimeFormat = "12h"): string {
  const days = daysUntil(iso, now) ?? 0;
  const day = days <= 0 ? "today" : days === 1 ? "tomorrow" : dayName(campusClock(new Date(iso)).dayIndex);
  if (!hasClockTime(iso)) return days <= 0 ? "today" : `by ${day}`;
  return `by ${formatTime(iso, timeFormat)} ${days > 1 ? `on ${day}` : day}`;
}

interface OpenWork {
  id: string;
  name: string;
  course?: string;
  due: string;
  href: string;
}

/**
 * Unsubmitted LMS work due in the next 48 hours, soonest first. Two at most: past that,
 * the second line counts the rest.
 */
export function dueLines(
  assignments: Assignment[],
  events: CalendarEvent[],
  now: Date,
  timeFormat: TimeFormat = "12h",
): BriefLine[] {
  const t = now.getTime();
  const open: OpenWork[] = [
    ...assignments
      .filter((a) => !a.submitted && a.dueDate)
      .map((a) => ({
        id: `assignment:${a.id}`,
        name: a.name,
        course: a.courseName,
        due: a.dueDate!,
        href: `/courses/${a.courseId}/assignments/${a.id}`,
      })),
    // Moodle's calendar lists only work still to do, so a deadline that is not one of the
    // assignments above is open. The dashboard's own copies of those ("assignment:…") are skipped.
    ...events
      .filter((e) => e.type === "assignment" && !e.id.startsWith("assignment:") && !isDuplicateDeadline(e, assignments))
      .map((e) => ({
        id: e.id,
        name: e.title.replace(/^\s*(due|deadline)\s*[:\-–—]\s*/i, ""),
        course: e.courseName,
        due: e.date,
        href: "/courses",
      })),
  ]
    .filter((w) => {
      const ms = dueInstant(w.due);
      return ms > t && ms - t <= DUE_WINDOW_HOURS * 3_600_000;
    })
    .sort((a, b) => dueInstant(a.due) - dueInstant(b.due));

  const line = (w: OpenWork): BriefLine => ({
    id: w.id,
    kind: "assignment",
    tone: "warning",
    text: `Submit ${w.name} ${dueWhen(w.due, now, timeFormat)}`,
    detail: w.course,
    href: w.href,
  });
  if (open.length <= 2) return open.map(line);
  const rest = open.slice(1);
  return [
    line(open[0]!),
    {
      id: "assignment:more",
      kind: "assignment",
      tone: "warning",
      text: `Submit ${rest.length} more assignments due in the next 2 days`,
      detail: nameList(rest.map((w) => w.name)),
      href: "/courses",
    },
  ];
}

export interface NewMark {
  key: string;
  code: string;
  title: string;
  name: string;
  scored: number;
  max: number;
}

/**
 * Marks graded since the last visit. A mark first noticed today stays new for the rest
 * of today. On the first visit (or with another student's memory) everything already
 * there counts as seen, and nothing is new. When no marks loaded, the memory is kept.
 */
export function noticeMarks(
  marks: SubjectMarks[],
  memory: BriefMemory,
  { user, today }: { user: string; today: string },
): { fresh: NewMark[]; memory: BriefMemory } {
  const current: NewMark[] = marks.flatMap((s) =>
    s.components.flatMap((c) =>
      c.scored === null
        ? []
        : [{ key: markKey(s.code, c.name, c.scored, c.max), code: s.code, title: s.title, name: c.name, scored: c.scored, max: c.max }],
    ),
  );
  if (current.length === 0) return { fresh: [], memory };
  const keys = current.map((m) => m.key);
  if (!memory.seen || memory.user !== user) {
    return { fresh: [], memory: { ...memory, user, seen: keys, fresh: undefined } };
  }
  const seen = new Set(memory.seen);
  const earlier = new Set(memory.fresh?.day === today ? memory.fresh.keys : []);
  const fresh = current.filter((m) => !seen.has(m.key) || earlier.has(m.key));
  return {
    fresh,
    memory: { ...memory, user, seen: keys, fresh: fresh.length > 0 ? { day: today, keys: fresh.map((m) => m.key) } : undefined },
  };
}

const score = (n: number) => String(Math.round(n * 100) / 100);

export function marksLine(fresh: NewMark[]): BriefLine | null {
  if (fresh.length === 0) return null;
  if (fresh.length === 1) {
    const m = fresh[0]!;
    return {
      id: `marks:${m.key}`,
      kind: "marks",
      tone: "primary",
      text: `See your ${m.name} mark for ${m.title}: ${score(m.scored)}/${score(m.max)}`,
      href: `/marks#m-${m.code}`,
    };
  }
  return {
    id: "marks",
    kind: "marks",
    tone: "primary",
    text: `See ${fresh.length} new marks`,
    detail: nameList(fresh.map((m) => `${m.name} for ${m.title}`)),
    href: "/marks",
  };
}

/** ODs the ERP still shows as absent (lib/od.ts `odSummary`). */
export function odLine(od: OdCount | null | undefined): BriefLine | null {
  if (!od || od.pending <= 0) return null;
  const followUp = od.oldestDays !== null && od.oldestDays > OD_FOLLOW_UP_DAYS;
  return {
    id: "od",
    kind: "od",
    tone: followUp ? "warning" : "primary",
    text: `Check ${od.pending === 1 ? "an OD" : `${od.pending} ODs`} not updated in the ERP yet`,
    detail: followUp ? `The oldest has waited ${od.oldestDays} days, time to follow it up` : undefined,
    href: "/od",
  };
}

const EXAM_DATE = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
});

const words = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

/**
 * The subject an exam event is about, or null when it can't be told. A subject code in the
 * title wins; else the course name or title naming one subject in whole words (the longest,
 * so "Operating Systems Lab" beats "Operating Systems"). Two equally good matches give null:
 * better to say nothing than to point at someone else's exam.
 */
export function examSubject(event: Pick<CalendarEvent, "title" | "courseName">, subjects: ErpSubject[]): ErpSubject | null {
  const codes = extractCodes(event.title, event.courseName);
  const byCode = subjects.filter((s) => codes.includes(s.code.toUpperCase()));
  if (byCode.length > 0) return byCode.length === 1 ? byCode[0]! : null;

  const course = words(event.courseName ?? "");
  const exact = subjects.filter((s) => course.trim() !== "" && words(s.title) === course);
  if (exact.length > 0) return exact.length === 1 ? exact[0]! : null;

  const text = words(`${event.title} ${event.courseName ?? ""}`);
  const named = subjects
    .map((s) => ({ s, w: words(s.title) }))
    .filter(({ w }) => w.trim().length >= 6 && text.includes(w))
    .sort((a, b) => b.w.length - a.w.length);
  if (named.length === 0) return null;
  if (named.length > 1 && named[1]!.w.length === named[0]!.w.length) return null;
  return named[0]!.s;
}

/**
 * The next exam within two weeks, linking to that subject's question papers. It carries the same countdown
 * as the dashboard's exam chip, which the page then leaves out.
 */
export function examLine(
  events: CalendarEvent[],
  now: Date,
  {
    timeFormat = "12h",
    examCode,
  }: { timeFormat?: TimeFormat; examCode?: (event: CalendarEvent) => string | null } = {},
): BriefLine | null {
  const { exam } = nextCountdowns(events, now);
  const event = exam ? events.find((e) => e.id === exam.id) : undefined;
  if (!exam || !event || exam.days > EXAM_WINDOW_DAYS) return null;
  const code = examCode?.(event) ?? null;
  const time = hasClockTime(event.date) ? ` at ${formatTime(event.date, timeFormat)}` : "";
  const p = Object.fromEntries(EXAM_DATE.formatToParts(new Date(event.date)).map((x) => [x.type, x.value]));
  return {
    id: `exam:${exam.id}`,
    kind: "exam",
    tone: exam.days <= 2 ? "warning" : "primary",
    text: `Prepare for ${exam.title}`,
    detail:
      exam.days <= 1
        ? `${exam.days === 0 ? "Today" : "Tomorrow"}${time}`
        : `In ${exam.days} days, ${p.weekday} ${p.day} ${p.month}`,
    href: code ? `/papers?q=${encodeURIComponent(code)}` : "/papers",
  };
}

const PRIORITY: Record<BriefKind, number> = { attendance: 0, assignment: 1, marks: 2, od: 3, exam: 4 };

/**
 * The lines to show: most pressing first, four at most. The exam line always keeps its
 * place, since the page's own exam countdown steps aside for it.
 */
export function selectLines(lines: readonly BriefLine[], max = MAX_LINES): BriefLine[] {
  const sorted = [...lines].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);
  const exam = sorted.filter((l) => l.kind === "exam").slice(0, 1);
  const rest = sorted.filter((l) => l.kind !== "exam").slice(0, Math.max(0, max - exam.length));
  return [...rest, ...exam];
}

export interface BriefInput {
  data: Pick<DashboardData, "profile" | "attendance" | "timetable" | "marks" | "assignments" | "events">;
  now: Date;
  threshold: number;
  timeFormat: TimeFormat;
  /** The memory read from the request's cookie. */
  memory: BriefMemory;
  /** Today is a holiday on the ERP: the timetable still lists classes, but none will run. */
  holiday?: boolean;
  /** The subject code an exam is for, for its papers link. */
  examCode?: (event: CalendarEvent) => string | null;
}

export interface Brief {
  today: string;
  dismissed: boolean;
  /** Every server-side line that applies; the client adds the OD line and calls `selectLines`. */
  lines: BriefLine[];
  /** The exam countdown is in the brief, so the page leaves out its chip. */
  examInBrief: boolean;
  /** What to remember for the next visit. */
  memory: BriefMemory;
}

export function buildBrief({ data, now, threshold, timeFormat, memory, holiday, examCode }: BriefInput): Brief {
  const today = campusDayKey(now);
  const user = shortHash(data.profile.registerNumber);
  // Dismissed for today: nothing is drawn and no new mark is used up, so it shows tomorrow.
  if (memory.user === user && memory.dismissed === today) {
    return { today, dismissed: true, lines: [], examInBrief: false, memory };
  }
  const marks = noticeMarks(data.marks, memory, { user, today });
  const exam = examLine(data.events, now, { timeFormat, examCode });
  const lines = [
    holiday ? null : attendanceLine(data.attendance, data.timetable, now, { threshold, timeFormat }),
    ...dueLines(data.assignments, data.events, now, timeFormat),
    marksLine(marks.fresh),
    exam,
  ].filter((l): l is BriefLine => l !== null);
  const next = { ...marks.memory, user };
  if (next.dismissed && next.dismissed !== today) delete next.dismissed;
  return { today, dismissed: false, lines, examInBrief: exam !== null, memory: next };
}
