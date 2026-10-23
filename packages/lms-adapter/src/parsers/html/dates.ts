/**
 * Parsing the human-readable dates Moodle prints into ISO strings.
 *
 * Moodle formats dates in the *user's* timezone (profile setting), without
 * printing the offset. So a scraped "Thursday, 15 October 2026, 11:59 PM" is
 * only meaningful with an offset; we default to IST (+05:30) and let callers
 * override it. Output keeps the offset: "2026-10-15T23:59:00+05:30".
 *
 * Supported shapes (case-insensitive; weekday optional and ignored):
 *   "Thursday, 15 October 2026, 11:59 PM"     (Moodle default strftimedatetime)
 *   "15 Oct 2026, 23:59"
 *   "October 15, 2026, 11:59 PM"              (en_us)
 *   "15/10/2026, 11:59 PM"                    (dd/mm/yyyy)
 *   "2026-10-15 23:59"
 *   "Thursday, 15 October, 11:59 PM"          (no year → inferred from `now`)
 *   "Today, 11:59 PM" / "Tomorrow, 9:00 AM" / "Yesterday, ..."
 * Returns null for "-", "", "No due date", or anything unparseable.
 */

/** Default timezone offset for scraped dates (India Standard Time). */
export const DEFAULT_TZ_OFFSET = "+05:30";

export interface DateParseOptions {
  /** "+05:30", "-04:00" or "Z". Defaults to DEFAULT_TZ_OFFSET. */
  tzOffset?: string;
  /** Reference "now" for relative words and missing years. Defaults to new Date(). */
  now?: Date;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function monthFromWord(word: string): number | undefined {
  return MONTHS[word.slice(0, 3).toLowerCase()];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function offsetMinutes(tz: string): number {
  if (tz === "Z") return 0;
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(tz);
  if (!m || m[1] === undefined || m[2] === undefined || m[3] === undefined) {
    throw new Error(`Invalid tzOffset "${tz}" — expected "+HH:MM", "-HH:MM" or "Z".`);
  }
  const mins = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "-" ? -mins : mins;
}

/** Y/M/D of `now` as seen in the given offset. */
function localYmd(now: Date, tz: string, addDays = 0): { y: number; m: number; d: number } {
  const shifted = new Date(now.getTime() + offsetMinutes(tz) * 60_000 + addDays * 86_400_000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
}

function validYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= daysInMonth;
}

function parseTime(text: string): { h: number; min: number } | null {
  const m = /\b(\d{1,2})[:.](\d{2})\s*([ap])?\.?\s*m?\.?(?![a-z])/i.exec(text);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ampm = m[3]?.toLowerCase();
  if (ampm === "p" && h < 12) h += 12;
  if (ampm === "a" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return { h, min };
}

/** Parse a Moodle-rendered date/time string → ISO with offset, or null. */
export function parseMoodleDate(text: string | null | undefined, opts: DateParseOptions = {}): string | null {
  const tz = opts.tzOffset ?? DEFAULT_TZ_OFFSET;
  offsetMinutes(tz); // validate early
  const now = opts.now ?? new Date();
  const s = (text ?? "").replace(/[\s ]+/g, " ").trim();
  if (!s || s === "-" || /^(no due date|none|n\/a)$/i.test(s)) return null;

  let y: number | undefined;
  let mo: number | undefined;
  let d: number | undefined;
  let yearKnown = true;
  let rest = s;

  let m: RegExpExecArray | null;
  if ((m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s))) {
    y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]);
    rest = s.slice(m.index + (m[0] ?? "").length);
  } else if ((m = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(s))) {
    d = Number(m[1]); mo = Number(m[2]); y = Number(m[3]);
    rest = s.slice(m.index + (m[0] ?? "").length);
  } else if (
    (m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?(?:,?\s+(\d{4}))?/.exec(s)) &&
    monthFromWord(m[2] ?? "") !== undefined
  ) {
    d = Number(m[1]); mo = monthFromWord(m[2] ?? "");
    if (m[3] !== undefined) y = Number(m[3]); else yearKnown = false;
    rest = s.slice(m.index + (m[0] ?? "").length);
  } else if (
    (m = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/.exec(s)) &&
    monthFromWord(m[1] ?? "") !== undefined
  ) {
    mo = monthFromWord(m[1] ?? ""); d = Number(m[2]);
    if (m[3] !== undefined) y = Number(m[3]); else yearKnown = false;
    rest = s.slice(m.index + (m[0] ?? "").length);
  } else if ((m = /\b(today|tomorrow|yesterday)\b/i.exec(s))) {
    const word = (m[1] ?? "").toLowerCase();
    const delta = word === "tomorrow" ? 1 : word === "yesterday" ? -1 : 0;
    ({ y, m: mo, d } = localYmd(now, tz, delta));
    rest = s.slice(m.index + (m[0] ?? "").length);
  } else {
    return null;
  }

  if (mo === undefined || d === undefined) return null;

  if (!yearKnown || y === undefined) {
    // No year printed (upcoming view): assume the current year, but if that
    // puts the date more than ~2 months in the past, it belongs to next year.
    const today = localYmd(now, tz);
    y = today.y;
    const candidate = Date.UTC(y, mo - 1, d);
    const todayUtc = Date.UTC(today.y, today.m - 1, today.d);
    if (candidate < todayUtc - 60 * 86_400_000) y += 1;
  }

  if (!validYmd(y, mo, d)) return null;

  const time = parseTime(rest) ?? { h: 0, min: 0 };
  return `${y}-${pad(mo)}-${pad(d)}T${pad(time.h)}:${pad(time.min)}:00${tz}`;
}

/** Read a UNIX-seconds query param (e.g. `time=` on calendar day links) → ISO (UTC), or null. */
export function unixParamToIso(href: string | null | undefined, param: string): string | null {
  if (!href) return null;
  let value: string | null = null;
  try {
    value = new URL(href, "http://placeholder.invalid/").searchParams.get(param);
  } catch {
    return null;
  }
  if (!value || !/^\d+$/.test(value)) return null;
  const secs = Number(value);
  if (secs <= 0) return null;
  return new Date(secs * 1000).toISOString();
}
