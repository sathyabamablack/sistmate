import * as cheerio from "cheerio";
import { SubjectMarksSchema, type MarkComponent, type SubjectMarks } from "@usp/core";
import { ParseError, validate } from "./errors";
import { DEFAULT_SELECTORS, type ErpSelectors } from "./selectors";
import { cleanText, findTable, headerMatches, isBlank, normalizeKey, parseFraction, toNumber, type GridCell } from "./table";

export interface MarksParseOptions {
  selectors?: ErpSelectors;
}

interface ComponentColumn {
  col: number;
  name: string;
  /** From the header "(50)" or a "Max Marks" row; null = unknown yet. */
  max: number | null;
}

/** Matches "(50)", "[50]", "(Max 50)", "(Max. Marks: 50)", "/50", "out of 50" in a header. */
const MAX_IN_HEADER =
  /[([]\s*(?:max(?:imum)?\.?\s*(?:marks?)?\s*[:\-]?\s*)?(\d+(?:\.\d+)?)\s*(?:marks?)?\s*[)\]]|\/\s*(\d+(?:\.\d+)?)\s*$|\bout of\s*(\d+(?:\.\d+)?)/i;

/** "CIA - 1 (20)" -> { name: "CIA-1", max: 20 } */
export function parseComponentHeader(text: string): { name: string; max: number | null } {
  const t = cleanText(text);
  const m = MAX_IN_HEADER.exec(t);
  const maxStr = m ? (m[1] ?? m[2] ?? m[3]) : undefined;
  const name = cleanText(m ? t.slice(0, m.index) + " " + t.slice(m.index + m[0].length) : t)
    .replace(/\s*-\s*/g, "-")
    .replace(/[:\-]+$/, "")
    .trim();
  return { name, max: maxStr !== undefined ? Number(maxStr) : null };
}

/**
 * Internal-assessment marks table -> SubjectMarks[].
 *
 * Code/title (and optional total) columns are found by alias. EVERY other
 * column that isn't in `marks.ignoreColumns` becomes a component, named after
 * its header. Max marks come from the header ("CIA-1 (50)") or from a separate
 * "Max Marks" row. Blank / "-" cells -> scored null (not graded yet); "AB" ->
 * 0. Total: the page's total column if present, else the sum of graded
 * components (maxTotal = sum of their maxes), null when nothing is graded.
 */
export function parseMarks(html: string, opts: MarksParseOptions = {}): SubjectMarks[] {
  const cfg = (opts.selectors ?? DEFAULT_SELECTORS).marks;
  const $ = cheerio.load(html);
  const match = findTable($, cfg.table, "marks");
  const header = match.grid[match.headerRow] ?? [];
  const codeCol = match.columns.code;
  const titleCol = match.columns.title;
  const totalCol = match.columns.total;
  if (codeCol === undefined) throw new ParseError("marks", "no course code column");

  const fixed = new Set([codeCol, titleCol, totalCol].filter((c): c is number => c !== undefined));
  const ignore = new Set(cfg.ignoreColumns.map(normalizeKey));
  const components: ComponentColumn[] = [];
  const seenOrigins = new Set<number>();
  header.forEach((cell, col) => {
    if (fixed.has(col) || !cell.text || seenOrigins.has(cell.origin)) return;
    seenOrigins.add(cell.origin);
    const { name, max } = parseComponentHeader(cell.text);
    if (!name || ignore.has(normalizeKey(name))) return;
    components.push({ col, name, max });
  });
  if (components.length === 0) {
    throw new ParseError("marks", "found the marks table but no component columns (CIA/assignment/...)");
  }

  const totalHeader = totalCol !== undefined ? header[totalCol] : undefined;
  let totalMax: number | null = totalHeader ? parseComponentHeader(totalHeader.text).max : null;

  const textAt = (row: GridCell[], col: number | undefined): string =>
    col === undefined ? "" : cleanText(row[col]?.text);
  const isMaxRow = (row: GridCell[]): boolean => {
    const labels = [textAt(row, codeCol), textAt(row, titleCol), textAt(row, 0)];
    return labels.some((l) => l !== "" && headerMatches(l, cfg.maxRowLabels));
  };
  const absent = new Set(cfg.absentTokens.map((t) => t.toLowerCase()));

  // Pass 1: an optional "Max Marks" row fills in unknown maxes.
  const dataRows: GridCell[][] = [];
  for (let r = match.headerRow + 1; r < match.grid.length; r++) {
    const row = match.grid[r];
    if (!row) continue;
    if (isMaxRow(row)) {
      for (const c of components) c.max ??= toNumber(textAt(row, c.col));
      totalMax ??= toNumber(textAt(row, totalCol));
      continue;
    }
    dataRows.push(row);
  }

  const out: SubjectMarks[] = [];
  for (const row of dataRows) {
    const code = textAt(row, codeCol);
    const title = textAt(row, titleCol) || code;
    if (!code || cfg.skipRowPattern.test(code) || cfg.skipRowPattern.test(title)) continue;
    if (headerMatches(code, cfg.table.columns.code)) continue; // repeated header row

    const comps: MarkComponent[] = components.map((c) => {
      const raw = textAt(row, c.col);
      let scored: number | null;
      let max = c.max;
      if (absent.has(raw.toLowerCase())) {
        scored = 0;
      } else if (isBlank(raw)) {
        scored = null;
      } else {
        const frac = parseFraction(raw);
        scored = frac ? frac.num : toNumber(raw);
        if (frac && max === null) max = frac.den;
      }
      max ??= cfg.defaultMax;
      if (max === null) {
        throw new ParseError(
          "marks",
          `no max marks for column "${c.name}" - expected "${c.name} (50)" in the header, ` +
            `a "Max Marks" row, or set marks.defaultMax in selectors.ts`,
        );
      }
      return { name: c.name, max, scored };
    });

    const graded = comps.filter((c) => c.scored !== null);
    let total: number | null;
    let maxTotal: number | null;
    if (totalCol !== undefined) {
      const rawTotal = textAt(row, totalCol);
      total = absent.has(rawTotal.toLowerCase()) ? 0 : toNumber(rawTotal);
      maxTotal = total === null ? null : (totalMax ?? graded.reduce((s, c) => s + c.max, 0));
    } else {
      total = graded.length > 0 ? graded.reduce((s, c) => s + (c.scored ?? 0), 0) : null;
      maxTotal = graded.length > 0 ? graded.reduce((s, c) => s + c.max, 0) : null;
    }

    out.push(validate("marks", SubjectMarksSchema, { code, title, components: comps, total, maxTotal }));
  }
  return out;
}
