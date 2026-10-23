import {
  campusNow,
  isDateKey,
  monthEnd,
  monthStart,
  type ErpDailyInput,
  type HourlyDay,
} from "@usp/core";

/**
 * Parsers for the ERP's two per-date attendance endpoints:
 *
 *  - StudentDailyAttendance/StudentWiseAttendance: absent days, holidays, the
 *    weekdays the timetable runs on and the actual working days of a range.
 *  - StudentAttendanceHourly/generateStudentwiseReport: one row per date with
 *    hours present, absent and not entered yet.
 *
 * Shapes come from the ERP's own Angular bundle; the value types of the hourly
 * columns are not confirmed yet, so that parser accepts counts and hour lists.
 * Never log values: they are the student's data.
 */

type Row = Record<string, unknown>;

const isRow = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);

/** Field lookup that ignores case, spaces and punctuation in the key. */
function field(row: Row, ...names: string[]): unknown {
  const wanted = new Set(names.map(normalize));
  for (const [k, v] of Object.entries(row)) if (wanted.has(normalize(k))) return v;
  return undefined;
}
const normalize = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

function devWarn(message: string): void {
  if (globalThis.process?.env?.NODE_ENV !== "production") console.warn(`[erp] ${message}`);
}

/**
 * A date from the ERP as a campus date "YYYY-MM-DD", or null. Accepts "DD/MM/YYYY"
 * (also with - or .), "YYYY-MM-DD", "YYYY-MM-DD hh:mm:ss" and ISO timestamps; a
 * timestamp with a zone ("...Z", "+05:30") is read in campus time.
 */
export function parseErpDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  let key: string | null = null;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\D|$)/.exec(s);
  if (dmy) {
    key = `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  } else if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const t = Date.parse(s);
    key = Number.isNaN(t) ? null : campusNow(new Date(t)).date;
  } else if (/^\d{4}-\d{2}-\d{2}(?:[T ]|$)/.test(s)) {
    key = s.slice(0, 10);
  }
  return key && isDateKey(key) ? key : null;
}

/* ------------------------------ daily ------------------------------ */

export interface DailyReply extends Omit<ErpDailyInput, "from" | "to"> {
  /** AcademicMonthStartDate .. AcademicMonthEndDate, when the ERP sent both */
  academicWindow: { from: string; to: string } | null;
}

const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter(isRow) : []);

/** TimeSetDays "1,2,3,4,5,6" (0 = Sunday) as weekday numbers; null when absent or empty. */
function parseTimeSetDays(v: unknown): number[] | null {
  const raw = Array.isArray(v) ? v.join(",") : typeof v === "number" ? String(v) : typeof v === "string" ? v : "";
  const days = [...raw.matchAll(/\d+/g)].map((m) => Number(m[0])).filter((n) => n >= 0 && n <= 6);
  return days.length > 0 ? [...new Set(days)] : null;
}

/**
 * Reads `responseData` of StudentWiseAttendance. Throws when the reply has no
 * working-day list: without it every date would wrongly read as present.
 */
export function parseDailyReply(responseData: unknown): DailyReply {
  if (!isRow(responseData)) throw new Error("The ERP returned no day-wise attendance.");

  const working = field(responseData, "ActualWorkingDays");
  if (!Array.isArray(working)) throw new Error("The ERP returned no working days for day-wise attendance.");

  let dropped = 0;
  const date = (v: unknown): string | null => {
    const d = parseErpDate(v);
    if (!d) dropped += 1;
    return d;
  };

  const workingDays = working
    .map((w) => date(isRow(w) ? field(w, "Date", "WorkingDate", "WorkingDay") : w))
    .filter((d): d is string => d !== null);

  const absentDates = rows(field(responseData, "AttendanceDetails"))
    .map((r) => date(field(r, "AttendanceDate", "Date")))
    .filter((d): d is string => d !== null);

  const holidays = rows(field(responseData, "HolidayList")).flatMap((r) => {
    const d = date(field(r, "HoliDay", "Holiday", "HolidayDate", "Date"));
    if (!d) return [];
    const comment = field(r, "Comments", "Comment", "Reason");
    return [{ date: d, label: typeof comment === "string" ? comment.trim() : "" }];
  });

  const ttRaw = field(responseData, "TimetableDetails");
  const tt = Array.isArray(ttRaw) ? ttRaw.find(isRow) : isRow(ttRaw) ? ttRaw : undefined;
  const timeSetDays = tt ? parseTimeSetDays(field(tt, "TimeSetDays")) : null;
  const winFrom = tt ? parseErpDate(field(tt, "AcademicMonthStartDate")) : null;
  const winTo = tt ? parseErpDate(field(tt, "AcademicMonthEndDate")) : null;

  if (dropped > 0) devWarn(`day-wise attendance: skipped ${dropped} date(s) that could not be read`);

  return {
    absentDates,
    holidays,
    timeSetDays,
    workingDays,
    academicWindow: winFrom && winTo && winFrom <= winTo ? { from: winFrom, to: winTo } : null,
  };
}

/**
 * Narrow a requested range to the ERP's academic month (it warns when a request
 * crosses it). With no overlap, use the month of the window nearest the request.
 */
export function clampRange(
  range: { from: string; to: string },
  window: { from: string; to: string },
): { from: string; to: string } {
  const from = range.from > window.from ? range.from : window.from;
  const to = range.to < window.to ? range.to : window.to;
  if (from <= to) return { from, to };
  if (range.from > window.to) {
    const start = monthStart(window.to);
    return { from: start > window.from ? start : window.from, to: window.to };
  }
  const end = monthEnd(window.from);
  return { from: window.from, to: end < window.to ? end : window.to };
}

/* ------------------------------ hourly ----------------------------- */

type Cell =
  | { kind: "empty" }
  | { kind: "count"; n: number }
  /** a lone number in a string: a count or one hour number */
  | { kind: "single"; n: number }
  | { kind: "list"; hours: number[] }
  | { kind: "bad" };

const BLANK = /^(|-+|na|n\/a|nil|none|null)$/i;

function cell(v: unknown): Cell {
  if (v === undefined || v === null) return { kind: "empty" };
  if (typeof v === "number") {
    return Number.isInteger(v) && v >= 0 ? { kind: "count", n: v } : { kind: "bad" };
  }
  if (Array.isArray(v)) {
    const hours = v.map((x) => Number(x));
    return hours.every((h) => Number.isInteger(h) && h >= 1) ? { kind: "list", hours } : { kind: "bad" };
  }
  if (typeof v !== "string") return { kind: "bad" };
  const s = v.trim();
  if (BLANK.test(s)) return { kind: "empty" };
  if (/^\d+$/.test(s)) return { kind: "single", n: Number(s) };
  if (/^\d+(\s*[,;/|]\s*\d+|\s+\d+)+[,;]?$/.test(s)) {
    const hours = [...s.matchAll(/\d+/g)].map((m) => Number(m[0]));
    return hours.every((h) => h >= 1) ? { kind: "list", hours } : { kind: "bad" };
  }
  return { kind: "bad" };
}

const uniqSorted = (hours: number[]) => [...new Set(hours)].sort((a, b) => a - b);

function asCount(c: Cell): number {
  if (c.kind === "count" || c.kind === "single") return c.n;
  if (c.kind === "list") return c.hours.length;
  return 0;
}

function asHours(c: Cell): number[] {
  if (c.kind === "list") return uniqSorted(c.hours);
  if (c.kind === "single" || c.kind === "count") return c.n >= 1 ? [c.n] : [];
  return [];
}

/** One generateStudentwiseReport row, or null when it cannot be read. */
export function parseHourlyRow(row: unknown): HourlyDay | null {
  if (!isRow(row)) return null;
  const date = parseErpDate(field(row, "AttendanceDate", "Date"));
  if (!date) return null;

  const total = cell(field(row, "totalHours", "TotalHour", "Total"));
  const present = cell(field(row, "Present", "PresentHours"));
  const absent = cell(field(row, "Absent", "AbsentHours"));
  const notGivenRaw = field(row, "AttNotGiven", "AttendanceNotGiven", "NotGiven");
  const notGiven = cell(notGivenRaw);
  const parts = [present, absent, notGiven];
  if (parts.some((c) => c.kind === "bad") || total.kind === "bad" || total.kind === "list") return null;
  if (parts.every((c) => c.kind === "empty") && total.kind === "empty") return null;

  const totalCount = total.kind === "empty" ? null : total.n;
  const countSum = parts.reduce((s, c) => s + asCount(c), 0);
  const anyList = parts.some((c) => c.kind === "list");
  const anyNumber = parts.some((c) => c.kind === "count");
  // Lone numbers are read as counts unless only the hour-list reading adds up.
  const listReadingFits = () => {
    if (totalCount === null) return false;
    const hours = parts.flatMap(asHours);
    return new Set(hours).size === hours.length && hours.length === totalCount && hours.every((h) => h <= totalCount);
  };
  const listMode = anyList || (!anyNumber && totalCount !== null && countSum !== totalCount && listReadingFits());

  if (!listMode) {
    const p = asCount(present);
    const a = asCount(absent);
    const explicitNotGiven = notGivenRaw !== undefined;
    let n = asCount(notGiven);
    let totalHours = totalCount ?? p + a + n;
    if (!explicitNotGiven && totalHours > p + a) n = totalHours - p - a;
    totalHours = Math.max(totalHours, p + a + n);
    return { date, totalHours, present: p, absent: a, notGiven: n };
  }

  const presentHours = asHours(present);
  const absentHours = asHours(absent).filter((h) => !presentHours.includes(h));
  const taken = new Set([...presentHours, ...absentHours]);
  let notGivenHours = asHours(notGiven).filter((h) => !taken.has(h));
  const known = taken.size + notGivenHours.length;
  const totalHours = Math.max(totalCount ?? known, known);
  // Hours the row does not name at all have not been entered yet.
  if (notGiven.kind === "empty" && totalHours > known) {
    notGivenHours = [];
    for (let h = 1; h <= totalHours; h++) if (!taken.has(h)) notGivenHours.push(h);
  }
  return {
    date,
    totalHours: Math.max(totalHours, taken.size + notGivenHours.length),
    present: presentHours.length,
    absent: absentHours.length,
    notGiven: notGivenHours.length,
    presentHours,
    absentHours,
    notGivenHours,
  };
}

/**
 * All readable rows between `from` and `to` (inclusive), oldest first, one per
 * date (the last row wins). Unreadable rows are skipped with a dev-only count.
 */
export function parseHourlyRows(input: unknown, range?: { from: string; to: string }): HourlyDay[] {
  const list = Array.isArray(input) ? input : [];
  const byDate = new Map<string, HourlyDay>();
  let dropped = 0;
  for (const row of list) {
    const day = parseHourlyRow(row);
    if (!day) {
      dropped += 1;
      continue;
    }
    if (range && (day.date < range.from || day.date > range.to)) continue;
    byDate.set(day.date, day);
  }
  if (dropped > 0) devWarn(`hour-wise attendance: skipped ${dropped} row(s) that could not be read`);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
