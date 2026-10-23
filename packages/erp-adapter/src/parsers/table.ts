import type * as cheerio from "cheerio";
import { ParseError, type PageName } from "./errors";
import type { TableSpec } from "./selectors";

/**
 * Generic, page-agnostic helpers shared by every parser:
 *  - turning an HTML <table> into a clean 2-D grid (rowspan/colspan aware),
 *  - finding a table by matching its header row against aliases,
 *  - reading rows as `Record<canonicalField, string>`,
 *  - value normalisers (numbers, dates, times, day names).
 *
 * Nothing in here knows about any particular page. Page knowledge lives in
 * selectors.ts.
 */

/**
 * A cheerio selection. The node type is deliberately loose so this package
 * doesn't need to depend on `domhandler`'s typings directly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Sel = cheerio.Cheerio<any>;

/* ========================================================================= */
/*  Text                                                                      */
/* ========================================================================= */

/** Collapse whitespace (incl. &nbsp; and zero-width chars) and trim. */
export function cleanText(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u2007\u202F\t\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalise a header/label for comparison: lower-case, punctuation -> space,
 * whitespace collapsed. "%" and "+" are kept. "Sl.No." -> "sl no".
 */
export function normalizeKey(s: string | null | undefined): string {
  return cleanText(s)
    .toLowerCase()
    .replace(/[^a-z0-9%+]+/g, " ")
    .trim();
}

/** Tokens that mean "no value". Compared after cleanText + lower-case. */
const NULL_TOKENS = new Set(["", "-", "--", "---", "\u2013", "\u2014", "na", "n/a", "n.a", "n.a.", "nil", "null", "nan", "none", "*"]);

/** True if the cell is blank or a "no value" token like "-", "NA". */
export function isBlank(s: string | null | undefined): boolean {
  return NULL_TOKENS.has(cleanText(s).toLowerCase());
}

/** cleanText, but blanks / "-" / "NA" become undefined (for optional fields). */
export function optText(s: string | null | undefined): string | undefined {
  const t = cleanText(s);
  return isBlank(t) ? undefined : t;
}

/* ========================================================================= */
/*  Numbers                                                                   */
/* ========================================================================= */

/**
 * Parse the first number in a cell.
 *   "85.5%" -> 85.5    "Rs. 1,25,000.00" -> 125000    "12 / 15" -> 12
 *   "" / "-" / "NA" / "nil" -> null
 * Thousands separators (Indian or western) are stripped. A leading minus is
 * honoured only when it isn't glued to a word ("CIA-1" is not -1).
 */
export function toNumber(raw: string | null | undefined): number | null {
  const s = cleanText(raw);
  if (isBlank(s)) return null;
  const t = s.replace(/(\d),(?=\d)/g, "$1");
  // No bare ".5" alternative on purpose: "Rs.45000" must read 45000, not 0.45.
  const m = /(-?)(\d+(?:\.\d+)?)/.exec(t);
  if (!m) return null;
  const digits = m[2];
  if (digits === undefined) return null;
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  const before = m.index > 0 ? (t[m.index - 1] ?? "") : "";
  const negative = m[1] === "-" && !/[A-Za-z0-9]/.test(before);
  return negative ? -n : n;
}

/** toNumber rounded to an integer. */
export function toInt(raw: string | null | undefined): number | null {
  const n = toNumber(raw);
  return n === null ? null : Math.round(n);
}

/** "12 / 15", "12 of 15", "12 out of 15" -> { num: 12, den: 15 }. */
export function parseFraction(raw: string | null | undefined): { num: number; den: number } | null {
  const s = cleanText(raw).replace(/(\d),(?=\d)/g, "$1");
  const m = /(\d+(?:\.\d+)?)\s*(?:\/|\bout of\b|\bof\b)\s*(\d+(?:\.\d+)?)/i.exec(s);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  return { num: Number(m[1]), den: Number(m[2]) };
}

/** Round to 2 decimals (for percentages / GPAs). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "IV" -> 4. Returns null for anything that isn't a roman numeral. */
export function romanToInt(raw: string): number | null {
  const s = raw.trim().toUpperCase();
  if (!/^[IVXLC]+$/.test(s)) return null;
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = v[s.charAt(i)] ?? 0;
    const next = v[s.charAt(i + 1)] ?? 0;
    total += cur < next ? -cur : cur;
  }
  return total > 0 ? total : null;
}

/**
 * Semester number from things like "5", "V", "Sem 5", "Semester - V",
 * "III Year / V Sem", "5th Sem". Returns null if nothing in 1..12 is found.
 */
export function toSemester(raw: string | null | undefined): number | null {
  const s = cleanText(raw);
  if (!s) return null;
  const tok = (t: string | undefined): number | null => {
    if (!t) return null;
    const n = /^\d{1,2}$/.test(t) ? Number(t) : romanToInt(t);
    return n !== null && n >= 1 && n <= 12 ? n : null;
  };
  const after = /\bsem(?:ester)?\.?\s*(?:no\.?)?\s*[:\-]?\s*(\d{1,2}|[IVXLC]+)\b/i.exec(s);
  const fromAfter = tok(after?.[1]);
  if (fromAfter !== null) return fromAfter;
  const before = /\b(\d{1,2}|[IVXLC]+)\s*(?:st|nd|rd|th)?\s*sem/i.exec(s);
  const fromBefore = tok(before?.[1]);
  if (fromBefore !== null) return fromBefore;
  const whole = tok(s);
  if (whole !== null) return whole;
  // "III / VI" (value of a "Year / Sem" field): the semester is the last part.
  const parts = s.split("/").map((p) => p.trim());
  return parts.length > 1 ? tok(parts[parts.length - 1]) : null;
}

/* ========================================================================= */
/*  Dates & times                                                             */
/* ========================================================================= */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const pad2 = (n: number): string => String(n).padStart(2, "0");

interface DateMatch {
  iso: string;
  index: number;
  length: number;
}

function buildIso(y: number, mo: number, d: number): string | null {
  const year = y < 100 ? 2000 + y : y;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(year, mo - 1, d));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${year}-${pad2(mo)}-${pad2(d)}`;
}

/** Find the first date in a string (Indian day-first convention). */
function matchDate(raw: string): DateMatch | null {
  const s = raw;
  // yyyy-mm-dd / yyyy/mm/dd
  let m = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/.exec(s);
  if (m && m[1] && m[2] && m[3]) {
    const iso = buildIso(Number(m[1]), Number(m[2]), Number(m[3]));
    if (iso) return { iso, index: m.index, length: m[0].length };
  }
  // dd-mm-yyyy / dd/mm/yyyy / dd.mm.yyyy (also 2-digit year)
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/.exec(s);
  if (m && m[1] && m[2] && m[3]) {
    const iso = buildIso(Number(m[3]), Number(m[2]), Number(m[1]));
    if (iso) return { iso, index: m.index, length: m[0].length };
  }
  // dd-MMM-yyyy / dd MMM yyyy / dd-Month-yy
  m = /\b(\d{1,2})(?:st|nd|rd|th)?[-/. ]+([A-Za-z]{3,9})\.?[-/., ]+(\d{4}|\d{2})(?!\d)/.exec(s);
  if (m && m[1] && m[2] && m[3]) {
    const mo = MONTHS[m[2].toLowerCase()];
    const iso = mo ? buildIso(Number(m[3]), mo, Number(m[1])) : null;
    if (iso) return { iso, index: m.index, length: m[0].length };
  }
  // Month dd, yyyy
  m = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?!\d)/.exec(s);
  if (m && m[1] && m[2] && m[3]) {
    const mo = MONTHS[m[1].toLowerCase()];
    const iso = mo ? buildIso(Number(m[3]), mo, Number(m[2])) : null;
    if (iso) return { iso, index: m.index, length: m[0].length };
  }
  return null;
}

/**
 * Parse a date into ISO "yyyy-mm-dd". Supports dd-mm-yyyy, dd/mm/yyyy,
 * dd.mm.yyyy, dd-MMM-yyyy ("05-Aug-2026", "5 August 2026"), yyyy-mm-dd and
 * "Aug 5, 2026". Day-first is assumed for numeric dates (Indian convention).
 */
export function toIsoDate(raw: string | null | undefined): string | null {
  const s = cleanText(raw);
  if (isBlank(s)) return null;
  return matchDate(s)?.iso ?? null;
}

/**
 * Parse a date + optional time into an ISO datetime with offset, e.g.
 * "09-Oct-2026 10:30 AM" -> "2026-10-09T10:30:00+05:30". Without a time the
 * result is midnight local.
 */
export function toIsoDateTime(raw: string | null | undefined, tzOffset = "+05:30"): string | null {
  const s = cleanText(raw);
  if (isBlank(s)) return null;
  const d = matchDate(s);
  if (!d) return null;
  const rest = s.slice(0, d.index) + " " + s.slice(d.index + d.length);
  const time = parseTime(rest.replace(/^T/, "")) ?? "00:00";
  return `${d.iso}T${time}:00${tzOffset}`;
}

export interface TimeOptions {
  /** Hours 1..(n-1) without AM/PM are treated as afternoon (college timetables). */
  assumePmBelowHour?: number;
}

const TIME_TOKEN =
  /(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*([ap])\.?\s*m\b\.?)?|(\d{1,2})\s*([ap])\.?\s*m\b\.?/gi;

interface TimeToken {
  h: number;
  m: number;
  meridiem: "a" | "p" | null;
}

function timeTokens(raw: string): TimeToken[] {
  const out: TimeToken[] = [];
  for (const m of cleanText(raw).matchAll(TIME_TOKEN)) {
    const h = Number(m[1] ?? m[4]);
    const min = m[2] !== undefined ? Number(m[2]) : 0;
    const mer = (m[3] ?? m[5])?.toLowerCase();
    if (!Number.isFinite(h) || h > 23 || min > 59) continue;
    out.push({ h, m: min, meridiem: mer === "a" || mer === "p" ? mer : null });
  }
  return out;
}

function to24(t: TimeToken, opts: TimeOptions): string {
  let h = t.h;
  if (t.meridiem === "a") h = h === 12 ? 0 : h;
  else if (t.meridiem === "p") h = h < 12 ? h + 12 : h;
  else if (opts.assumePmBelowHour !== undefined && h >= 1 && h < opts.assumePmBelowHour) h += 12;
  return `${pad2(h)}:${pad2(t.m)}`;
}

/**
 * First time in a string as 24h "HH:MM": "9:00 AM" -> "09:00",
 * "1:30 pm" -> "13:30", "09.00" -> "09:00", "14:05" -> "14:05".
 */
export function parseTime(raw: string | null | undefined, opts: TimeOptions = {}): string | null {
  const t = timeTokens(raw ?? "")[0];
  return t ? to24(t, opts) : null;
}

/**
 * A time range "09.00-09.50", "9:00 AM - 9:50 AM", "08:00 to 08:50",
 * "1 (09:00 - 09:50)". If only the end carries AM/PM, the start inherits it
 * (unless that would make start > end).
 */
export function parseTimeRange(
  raw: string | null | undefined,
  opts: TimeOptions = {},
): { start: string; end: string } | null {
  const toks = timeTokens(raw ?? "");
  const a = toks[0];
  const b = toks[1];
  if (!a || !b) return null;
  let startTok = a;
  if (a.meridiem === null && b.meridiem !== null) {
    const inherited: TimeToken = { ...a, meridiem: b.meridiem };
    if (to24(inherited, {}) <= to24(b, {})) startTok = inherited;
  }
  const start = to24(startTok, opts);
  let end = to24(b, opts);
  // "11.50 - 12.40" is fine; "12.40 - 1.30" without heuristic -> push end to PM.
  if (end <= start && b.meridiem === null && b.h < 12) end = `${pad2(b.h + 12)}:${pad2(b.m)}`;
  return { start, end };
}

const DAY_NAMES: ReadonlyArray<readonly string[]> = [
  ["mon", "monday"],
  ["tue", "tues", "tuesday"],
  ["wed", "weds", "wednesday"],
  ["thu", "thur", "thurs", "thursday"],
  ["fri", "friday"],
  ["sat", "saturday"],
  ["sun", "sunday"],
];

/**
 * Day name -> 0..6 with Monday = 0 ("MON", "Monday", "tues."). `extra` maps
 * other labels (normalised) to an index, e.g. { "day 1": 0 } for day orders.
 */
export function dayIndex(
  raw: string | null | undefined,
  extra: Readonly<Record<string, number>> = {},
): number | null {
  const key = normalizeKey(raw);
  if (!key) return null;
  for (const [label, idx] of Object.entries(extra)) {
    if (normalizeKey(label) === key) return idx;
  }
  for (const word of key.split(" ")) {
    const i = DAY_NAMES.findIndex((names) => names.includes(word));
    if (i >= 0) return i;
  }
  return null;
}

/* ========================================================================= */
/*  Misc                                                                      */
/* ========================================================================= */

/** Small, fast, deterministic string hash (cyrb53) -> base36. Not crypto. */
export function stableHash(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Resolve a (possibly relative) href against baseUrl; drops javascript:/# links. */
export function resolveUrl(href: string | undefined, baseUrl?: string): string | undefined {
  const h = cleanText(href);
  if (!h || h === "#" || /^javascript:/i.test(h) || /^#/.test(h)) return undefined;
  if (!baseUrl) return h;
  try {
    return new URL(h, baseUrl).toString();
  } catch {
    return h;
  }
}

/* ========================================================================= */
/*  Tables                                                                    */
/* ========================================================================= */

/** One logical cell of a table grid. Spanned cells share the same `origin`. */
export interface GridCell {
  /** Cell text, lines joined with a single space. */
  text: string;
  /** Text split on <br>/block elements, each line cleaned, empties dropped. */
  lines: string[];
  /** Unique id of the source <td>/<th>; repeated for colspan/rowspan copies. */
  origin: number;
  /** True if the source element was a <th>. */
  header: boolean;
}

const EMPTY_CELL: GridCell = { text: "", lines: [], origin: -1, header: false };
const LINE_BREAK = "\uE000"; // private-use char as a line-break sentinel

/** Text of an element split into lines at <br>, <p>, <div>, <li>. */
export function cellLines(node: Sel): string[] {
  const c = node.clone();
  c.find("script, style").remove();
  c.find("br").replaceWith(LINE_BREAK);
  c.find("p, div, li, tr, h1, h2, h3, h4, h5, h6").append(LINE_BREAK);
  return c
    .text()
    .split(LINE_BREAK)
    .map((l) => cleanText(l))
    .filter((l) => l.length > 0);
}

/** The direct <tr> rows of a table (through thead/tbody/tfoot), not nested tables'. */
function directRows($: cheerio.CheerioAPI, table: Sel): Sel[] {
  const rows: Sel[] = [];
  table.children().each((_, child) => {
    const c = $(child);
    if (c.is("tr")) {
      rows.push(c);
    } else if (c.is("thead, tbody, tfoot")) {
      c.children("tr").each((__, tr) => {
        rows.push($(tr));
      });
    }
  });
  return rows;
}

const clampSpan = (v: string | undefined): number => {
  const n = Number.parseInt(v ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 50) : 1;
};

/**
 * Convert a <table> to a rectangular grid of cells, expanding rowspan/colspan
 * so `grid[row][col]` lines up with the visual layout.
 */
export function tableGrid($: cheerio.CheerioAPI, table: Sel): GridCell[][] {
  const rows = directRows($, table);
  const sparse: Array<Array<GridCell | undefined>> = [];
  const carry: Array<{ cell: GridCell; left: number } | undefined> = [];
  let originSeq = 0;
  let width = 0;

  for (const tr of rows) {
    const row: Array<GridCell | undefined> = [];
    let col = 0;
    const fillCarried = (): void => {
      for (;;) {
        const c = carry[col];
        if (c && c.left > 0) {
          row[col] = c.cell;
          c.left -= 1;
          col += 1;
        } else break;
      }
    };
    tr.children("td, th").each((_, el) => {
      fillCarried();
      const td = $(el);
      const colspan = clampSpan(td.attr("colspan"));
      const rowspan = clampSpan(td.attr("rowspan"));
      const lines = cellLines(td);
      const cell: GridCell = { text: lines.join(" "), lines, origin: originSeq++, header: td.is("th") };
      for (let k = 0; k < colspan; k++) {
        row[col] = cell;
        carry[col] = rowspan > 1 ? { cell, left: rowspan - 1 } : undefined;
        col += 1;
      }
    });
    fillCarried();
    // carried cells beyond the last real cell of this row
    for (let c = col; c < carry.length; c++) {
      const cc = carry[c];
      if (cc && cc.left > 0 && row[c] === undefined) {
        row[c] = cc.cell;
        cc.left -= 1;
      }
    }
    width = Math.max(width, row.length);
    sparse.push(row);
  }
  return sparse.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? EMPTY_CELL));
}

/** Header text with any "(...)" / "[...]" part removed, normalised. */
function strippedKey(text: string): string {
  return normalizeKey(text.replace(/\([^)]*\)|\[[^\]]*\]/g, " "));
}

/**
 * Does a header cell's text match any of the aliases? (see selectors.ts)
 * `strict` = only the full normalised text; otherwise the variant with
 * "(...)" removed is also tried ("Amount (Rs.)" ~ "amount").
 */
export function headerMatches(text: string, aliases: readonly string[], strict = false): boolean {
  const full = normalizeKey(text);
  const stripped = strict ? "" : strippedKey(text);
  return aliases.some((a) => {
    const k = normalizeKey(a);
    return k !== "" && (k === full || k === stripped);
  });
}

export interface TableMatch<F extends string> {
  table: Sel;
  grid: GridCell[][];
  /** Index (in grid) of the header row. Data rows follow it. */
  headerRow: number;
  /** canonical field -> column index; absent = column not on this page. */
  columns: Partial<Record<F, number>>;
}

/**
 * Map a header row's cells to canonical fields. Two passes: exact matches
 * first, then matches with "(...)" stripped, so "Attendance (Attended/Total)"
 * goes to the field that lists it verbatim rather than to plain "attendance".
 * Within a pass, the first matching column wins.
 */
export function mapHeader<F extends string>(row: GridCell[], spec: TableSpec<F>): Partial<Record<F, number>> {
  const columns: Partial<Record<F, number>> = {};
  const taken = new Set<number>();
  const fields = Object.keys(spec.columns) as F[];
  for (const strict of [true, false]) {
    for (const field of fields) {
      if (columns[field] !== undefined) continue;
      const aliases = spec.columns[field];
      for (let c = 0; c < row.length; c++) {
        if (taken.has(c)) continue;
        const cell = row[c];
        if (!cell || !cell.text) continue;
        if (headerMatches(cell.text, aliases, strict)) {
          columns[field] = c;
          taken.add(c);
          break;
        }
      }
    }
  }
  return columns;
}

function meetsRequirements<F extends string>(columns: Partial<Record<F, number>>, spec: TableSpec<F>): boolean {
  const has = (f: F): boolean => columns[f] !== undefined;
  if (!spec.required.every(has)) return false;
  if (spec.requireOneOf && spec.requireOneOf.length > 0) {
    return spec.requireOneOf.some((group) => group.every(has));
  }
  return true;
}

/** Candidate <table>s: inside/at `container`, else every table on the page. */
export function candidateTables($: cheerio.CheerioAPI, container: string): Sel[] {
  const seen = new Set<unknown>();
  const out: Sel[] = [];
  const add = (el: unknown): void => {
    if (seen.has(el)) return;
    seen.add(el);
    out.push($(el as never));
  };
  const scope = $(container);
  scope.each((_, el) => {
    const s = $(el);
    if (s.is("table")) add(el);
    s.find("table").each((__, t) => {
      add(t);
    });
  });
  if (out.length === 0) {
    $("table").each((_, t) => {
      add(t);
    });
  }
  return out;
}

/**
 * All tables matching a spec. The header row is searched among the first
 * `maxHeaderScan` rows (pages often have a title row above the real header).
 */
export function findTables<F extends string>(
  $: cheerio.CheerioAPI,
  spec: TableSpec<F>,
  maxHeaderScan = 5,
): TableMatch<F>[] {
  const matches: TableMatch<F>[] = [];
  for (const table of candidateTables($, spec.container)) {
    const grid = tableGrid($, table);
    const limit = Math.min(grid.length, maxHeaderScan);
    for (let r = 0; r < limit; r++) {
      const row = grid[r];
      if (!row) continue;
      const columns = mapHeader(row, spec);
      if (meetsRequirements(columns, spec)) {
        matches.push({ table, grid, headerRow: r, columns });
        break;
      }
    }
  }
  return matches;
}

/** Human-readable description of what a spec needs (for error messages). */
function describeSpec<F extends string>(spec: TableSpec<F>): string {
  const req = spec.required.join(" + ");
  const oneOf = spec.requireOneOf?.map((g) => `(${g.join(" & ")})`).join(" or ");
  return oneOf ? `${req} + ${oneOf}` : req;
}

/** Header-looking rows of every table on the page, for diagnostics. */
function seenHeaders($: cheerio.CheerioAPI): string {
  const out: string[] = [];
  $("table").each((_, t) => {
    const grid = tableGrid($, $(t));
    const first = grid.find((row) => row.some((c) => c.text));
    if (first) {
      const texts = Array.from(new Set(first.map((c) => c.text).filter(Boolean)));
      if (texts.join("").length < 300) out.push(`[${texts.join(" | ")}]`);
    }
  });
  return out.length ? out.slice(0, 6).join(" ") : "(no tables on page)";
}

/** Like findTables but returns the first match or throws a descriptive ParseError. */
export function findTable<F extends string>(
  $: cheerio.CheerioAPI,
  spec: TableSpec<F>,
  page: PageName,
): TableMatch<F> {
  const first = findTables($, spec)[0];
  if (first) return first;
  throw new ParseError(
    page,
    `no table matched headers ${describeSpec(spec)} (container "${spec.container}"). ` +
      `Header rows seen: ${seenHeaders($)}. Add the real header text as an alias in selectors.ts.`,
  );
}

export interface ReadRowsOptions {
  /** Rows with fewer non-empty mapped cells than this are skipped (pager/"no records" rows). */
  minFilled?: number;
}

/**
 * Data rows below the header as `Record<field, string>` (cleaned text; "" when
 * the column is absent or the cell is empty). Repeated header rows and nearly
 * empty rows are skipped.
 */
export function readRows<F extends string>(
  match: TableMatch<F>,
  spec: TableSpec<F>,
  opts: ReadRowsOptions = {},
): Array<Record<F, string>> {
  const minFilled = opts.minFilled ?? 2;
  const fields = Object.keys(spec.columns) as F[];
  const mapped = fields.filter((f) => match.columns[f] !== undefined);
  const out: Array<Record<F, string>> = [];
  for (let r = match.headerRow + 1; r < match.grid.length; r++) {
    const row = match.grid[r];
    if (!row) continue;
    const rec = {} as Record<F, string>;
    for (const f of fields) {
      const idx = match.columns[f];
      rec[f] = idx === undefined ? "" : (row[idx]?.text ?? "");
    }
    const filled = mapped.filter((f) => rec[f] !== "").length;
    if (filled < Math.min(minFilled, mapped.length)) continue;
    const isRepeatedHeader = mapped.every((f) => rec[f] === "" || headerMatches(rec[f], spec.columns[f]));
    if (isRepeatedHeader) continue;
    out.push(rec);
  }
  return out;
}

/** The region selected by `container`, or the whole document if it matches nothing. */
export function scopeOf($: cheerio.CheerioAPI, container: string): Sel {
  const s = $(container);
  return s.length > 0 ? s.first() : $.root();
}
