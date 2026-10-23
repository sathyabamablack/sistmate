import * as cheerio from "cheerio";
import { AttendanceSubjectSchema, attendanceStats, type AttendanceSubject } from "@usp/core";
import { ParseError, validate } from "./errors";
import { DEFAULT_SELECTORS, type ErpSelectors } from "./selectors";
import { cleanText, findTable, parseFraction, readRows, round2, toInt, toNumber } from "./table";

export interface AttendanceParseOptions {
  selectors?: ErpSelectors;
}

/**
 * Subject-wise attendance table -> AttendanceSubject[].
 *
 * Columns are found by header alias (selectors.ts > attendance.table), so
 * order doesn't matter. Needs either separate "total" + "attended" columns or
 * a combined "12 / 15" column. If the page has no percentage column (or the
 * cell is blank) the percentage is computed with core's `attendanceStats`.
 * Footer rows like "Total" are skipped.
 */
export function parseAttendance(html: string, opts: AttendanceParseOptions = {}): AttendanceSubject[] {
  const cfg = (opts.selectors ?? DEFAULT_SELECTORS).attendance;
  const $ = cheerio.load(html);
  const match = findTable($, cfg.table, "attendance");
  const rows = readRows(match, cfg.table);

  const out: AttendanceSubject[] = [];
  for (const row of rows) {
    const code = cleanText(row.code);
    const title = cleanText(row.title) || code;
    if (!code && !title) continue;
    if (cfg.skipRowPattern.test(code) || cfg.skipRowPattern.test(title)) continue;

    let total = toInt(row.total);
    let attended = toInt(row.attended);
    if ((total === null || attended === null) && row.attendedOfTotal) {
      const f = parseFraction(row.attendedOfTotal);
      if (f) {
        attended = Math.round(f.num);
        total = Math.round(f.den);
      }
    }
    if (total === null || attended === null) {
      throw new ParseError(
        "attendance",
        `row "${code || title}": could not read attended/total from ` +
          `"${row.attended || row.attendedOfTotal}" / "${row.total}"`,
      );
    }

    const pagePct = toNumber(row.percentage);
    const percentage = pagePct ?? round2(attendanceStats(attended, total).percentage);

    out.push(
      validate("attendance", AttendanceSubjectSchema, {
        code,
        title,
        totalClasses: total,
        attended,
        percentage,
      }),
    );
  }
  return out;
}
