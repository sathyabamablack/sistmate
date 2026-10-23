import * as cheerio from "cheerio";
import { SemesterResultSchema, computeGpa, type GradedExamResult, type SemesterResult } from "@usp/core";
import { ParseError, validate } from "./errors";
import { DEFAULT_SELECTORS, type ErpSelectors } from "./selectors";
import {
  cleanText,
  findTables,
  readRows,
  round2,
  toNumber,
  toSemester,
  type Sel,
} from "./table";

export interface ResultsParseOptions {
  selectors?: ErpSelectors;
}

/**
 * Exam results / grade sheet -> SemesterResult[] (sorted by semester).
 *
 * Works with either ONE table that has a "Semester" column, or one table PER
 * semester whose caption / preceding heading says "Semester - III".
 *  - gradePoint: the page's "Grade Point" column if present, else
 *    selectors.ts > results.gradePoints (O=10, A+=9 ... U/RA/AB=0).
 *  - gpa/credits: taken from an SGPA summary table if the page has one,
 *    otherwise computed with core's `computeGpa` (see excludeFailedFromGpa).
 *  - A course listed twice in a semester (arrear re-attempt) keeps the attempt
 *    with the higher grade point.
 */
export function parseResults(html: string, opts: ResultsParseOptions = {}): SemesterResult[] {
  const cfg = (opts.selectors ?? DEFAULT_SELECTORS).results;
  const $ = cheerio.load(html);

  const matches = findTables($, cfg.table);
  if (matches.length === 0) {
    throw new ParseError(
      "results",
      `no results table with headers ${cfg.table.required.join(" + ")} found. ` +
        `Add the real header text to selectors.ts > results.table.columns.`,
    );
  }

  const gradeMap = new Map<string, number>(
    Object.entries(cfg.gradePoints).map(([g, p]) => [normalizeGrade(g), p]),
  );
  const bySemester = new Map<number, Map<string, GradedExamResult>>();

  for (const match of matches) {
    const tableSemester = match.columns.semester === undefined ? semesterNear(match.table) : null;
    for (const row of readRows(match, cfg.table)) {
      const code = cleanText(row.code);
      if (!code || cfg.skipRowPattern.test(code)) continue;

      const semester = match.columns.semester !== undefined ? toSemester(row.semester) : tableSemester;
      if (semester === null) {
        throw new ParseError(
          "results",
          `course ${code}: can't tell which semester it belongs to ` +
            `(no Semester column and no "Semester ..." heading near the table)`,
        );
      }

      const grade = normalizeGrade(row.grade);
      if (!grade) continue; // result not published yet
      const gradePoint = toNumber(row.gradePoint) ?? gradeMap.get(grade) ?? 0;
      const result: GradedExamResult = {
        code,
        title: cleanText(row.title) || code,
        credits: toNumber(row.credits) ?? 0,
        grade,
        gradePoint,
      };

      const sem = bySemester.get(semester) ?? new Map<string, GradedExamResult>();
      const prev = sem.get(code);
      if (!prev || result.gradePoint >= prev.gradePoint) sem.set(code, result);
      bySemester.set(semester, sem);
    }
  }

  const summary = readGpaSummary($, cfg);

  const out: SemesterResult[] = [];
  for (const [semester, courses] of [...bySemester.entries()].sort((a, b) => a[0] - b[0])) {
    const results = [...courses.values()];
    const counted = cfg.excludeFailedFromGpa ? results.filter((r) => r.gradePoint > 0) : results;
    const page = summary.get(semester);
    const gpa = page?.gpa ?? round2(computeGpa(counted));
    const credits = page?.credits ?? counted.reduce((s, r) => s + r.credits, 0);
    out.push(validate("results", SemesterResultSchema, { semester, gpa, credits, results }));
  }
  return out;
}

/** "a +" -> "A+", " o " -> "O" */
function normalizeGrade(raw: string): string {
  return cleanText(raw).toUpperCase().replace(/\s+/g, "");
}

/** Optional SGPA summary table: semester -> { gpa, credits? }. */
function readGpaSummary(
  $: cheerio.CheerioAPI,
  cfg: ErpSelectors["results"],
): Map<number, { gpa: number; credits?: number }> {
  const out = new Map<number, { gpa: number; credits?: number }>();
  for (const match of findTables($, cfg.gpaTable)) {
    for (const row of readRows(match, cfg.gpaTable)) {
      const semester = toSemester(row.semester);
      const gpa = toNumber(row.gpa);
      if (semester === null || gpa === null) continue;
      const credits = toNumber(row.credits);
      out.set(semester, credits === null ? { gpa } : { gpa, credits });
    }
  }
  return out;
}

/**
 * For one-table-per-semester layouts: find "Semester III" in the table's
 * <caption> or in the few elements just before it (walking up a few levels).
 */
function semesterNear(table: Sel): number | null {
  const caption = toSemesterIfLabelled(table.children("caption").first().text());
  if (caption !== null) return caption;
  let node: Sel = table;
  for (let depth = 0; depth < 4 && node.length > 0; depth++) {
    // closest preceding siblings first
    let sib: Sel = node.prev();
    for (let i = 0; i < 3 && sib.length > 0; i++) {
      const sem = toSemesterIfLabelled(sib.is("table") ? "" : sib.text());
      if (sem !== null) return sem;
      sib = sib.prev();
    }
    node = node.parent();
  }
  return null;
}

function toSemesterIfLabelled(text: string): number | null {
  const t = cleanText(text);
  if (!t || t.length > 80 || !/sem/i.test(t)) return null;
  return toSemester(t);
}
