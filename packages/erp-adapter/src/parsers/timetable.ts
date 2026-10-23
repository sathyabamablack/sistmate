import * as cheerio from "cheerio";
import { TimetableSlotSchema, type TimetableSlot } from "@usp/core";
import { ParseError, validate } from "./errors";
import { DEFAULT_SELECTORS, type ErpSelectors } from "./selectors";
import {
  candidateTables,
  cleanText,
  dayIndex,
  findTables,
  readRows,
  parseTimeRange,
  tableGrid,
  type GridCell,
} from "./table";

export interface TimetableParseOptions {
  selectors?: ErpSelectors;
}

type TimetableConfig = ErpSelectors["timetable"];

interface CellInfo {
  code: string;
  title?: string;
  room?: string;
  faculty?: string;
}

interface RawSlot {
  slot: TimetableSlot;
  col: number;
  origin: number;
}

/**
 * Weekly timetable grid -> TimetableSlot[].
 *
 * Layout assumed (typical ERP): first column = day names, other columns =
 * periods whose header cells contain a time range ("I<br>09.00 - 09.50").
 * Each cell holds a course code (matched with courseCodePattern) and
 * optionally a room / faculty on extra lines. Empty, "Free", "Lunch", "-"
 * cells and cells without a course code are skipped. rowspan/colspan are
 * expanded, so a 2-period lab with colspan=2 yields one slot per period (or a
 * single merged slot when `timetable.mergeSpans` is true).
 *
 * Course titles/faculty come from an optional legend table (code | title |
 * faculty) beneath the grid; otherwise from the cell, else the code itself.
 */
export function parseTimetable(html: string, opts: TimetableParseOptions = {}): TimetableSlot[] {
  const cfg = (opts.selectors ?? DEFAULT_SELECTORS).timetable;
  const $ = cheerio.load(html);
  const timeOpts = { assumePmBelowHour: cfg.assumePmBelowHour };

  // The grid = the table whose first column has the most day names.
  let best: { grid: GridCell[][]; dayRows: number[] } | null = null;
  for (const table of candidateTables($, cfg.container)) {
    const grid = tableGrid($, table);
    const dayRows = grid
      .map((row, r) => (dayIndex(row[0]?.text, cfg.dayAliases) !== null ? r : -1))
      .filter((r) => r >= 0);
    if (dayRows.length > 0 && (!best || dayRows.length > best.dayRows.length)) best = { grid, dayRows };
  }
  if (!best) {
    throw new ParseError(
      "timetable",
      `no table with day names (Mon..Sat) in its first column (container "${cfg.container}")`,
    );
  }
  const { grid, dayRows } = best;
  const firstDayRow = dayRows[0] ?? 0;
  const width = grid[0]?.length ?? 0;

  // Period times: for each column, the nearest header row above the days with a time range.
  const periods: Array<{ start: string; end: string } | null> = [];
  for (let c = 0; c < width; c++) {
    let range: { start: string; end: string } | null = null;
    for (let r = firstDayRow - 1; r >= 0 && range === null; r--) {
      range = parseTimeRange(grid[r]?.[c]?.text, timeOpts);
    }
    periods.push(range);
  }
  if (!periods.some((p) => p !== null)) {
    throw new ParseError("timetable", "found the timetable grid but no period times in its header row(s)");
  }

  const legend = readLegend($, cfg);
  const skip = new Set(cfg.skipCellTokens.map(skipKey));

  const raw: RawSlot[] = [];
  for (const r of dayRows) {
    const row = grid[r];
    if (!row) continue;
    const day = dayIndex(row[0]?.text, cfg.dayAliases);
    if (day === null) continue;
    for (let c = 1; c < row.length; c++) {
      const cell = row[c];
      const period = periods[c];
      if (!cell || !period || skip.has(skipKey(cell.text))) continue;
      const info = parseCell(cell, cfg);
      if (!info) continue;
      const fromLegend = legend.get(info.code);
      const slot: TimetableSlot = {
        day,
        startTime: period.start,
        endTime: period.end,
        courseCode: info.code,
        courseTitle: fromLegend?.title ?? info.title ?? info.code,
      };
      if (info.room) slot.room = info.room;
      const faculty = info.faculty ?? fromLegend?.faculty;
      if (faculty) slot.faculty = faculty;
      raw.push({ slot, col: c, origin: cell.origin });
    }
  }

  const slots = cfg.mergeSpans ? mergeSpans(raw) : raw.map((r) => r.slot);
  return slots.map((s) => validate("timetable", TimetableSlotSchema, s));
}

/** "L U N C H" -> "lunch", "&nbsp;" -> "", "Free." -> "free" */
function skipKey(text: string): string {
  return cleanText(text).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Pull code / room / faculty / title out of a cell's lines. */
function parseCell(cell: GridCell, cfg: TimetableConfig): CellInfo | null {
  const codeMatch = cfg.courseCodePattern.exec(cell.text);
  if (!codeMatch) return null;
  const code = codeMatch[0];
  const info: CellInfo = { code };
  const trim = (s: string): string => s.replace(/^[\s\-\u2013:|,/()]+|[\s\-\u2013:|,/()]+$/g, "").trim();

  for (const line of cell.lines) {
    const rest = trim(line.replace(code, " "));
    if (!rest) continue;
    const roomLabelled = cfg.roomLabelPattern.exec(rest)?.[1];
    const facultyLabelled = cfg.facultyLabelPattern.exec(rest)?.[1];
    if (roomLabelled) info.room ??= trim(roomLabelled);
    else if (facultyLabelled) info.faculty ??= trim(facultyLabelled);
    else if (cfg.facultyTitlePattern.test(rest)) info.faculty ??= rest;
    else if (info.room === undefined && cfg.roomPattern.test(rest)) info.room = rest;
    else info.title ??= rest;
  }
  return info;
}

/** Optional legend table: code -> { title, faculty }. */
function readLegend($: cheerio.CheerioAPI, cfg: TimetableConfig): Map<string, { title: string; faculty?: string }> {
  const out = new Map<string, { title: string; faculty?: string }>();
  for (const match of findTables($, cfg.legend)) {
    for (const row of readRows(match, cfg.legend)) {
      const code = cleanText(row.code);
      const title = cleanText(row.title);
      if (!code || !title || out.has(code)) continue;
      const faculty = cleanText(row.faculty);
      out.set(code, faculty ? { title, faculty } : { title });
    }
  }
  return out;
}

/**
 * Merge consecutive periods of the same class into one slot: either the same
 * spanned cell (colspan), or adjacent identical cells whose times touch.
 */
function mergeSpans(raw: RawSlot[]): TimetableSlot[] {
  const out: RawSlot[] = [];
  for (const cur of raw) {
    const prev = out[out.length - 1];
    const same =
      prev !== undefined &&
      prev.slot.day === cur.slot.day &&
      prev.slot.courseCode === cur.slot.courseCode &&
      prev.slot.room === cur.slot.room &&
      prev.slot.faculty === cur.slot.faculty &&
      prev.col + 1 === cur.col &&
      (prev.origin === cur.origin || prev.slot.endTime === cur.slot.startTime);
    if (same && prev) {
      prev.slot = { ...prev.slot, endTime: cur.slot.endTime };
      prev.col = cur.col;
    } else {
      out.push({ ...cur, slot: { ...cur.slot } });
    }
  }
  return out.map((r) => r.slot);
}
