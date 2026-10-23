import { AssignmentSchema, type Assignment } from "@usp/core";
import { LmsParseError } from "../errors";
import { cleanText, parseWith, tidyGrade } from "../shared";
import { parseMoodleDate } from "./dates";
import { absUrl, firstMatch, firstText, idFromHref, loadPage, normalizeHeader } from "./dom";
import { ASSIGN_INDEX } from "./selectors";

export type AssignColumn = keyof typeof ASSIGN_INDEX.headerAliases;
export type ColumnMap = Partial<Record<AssignColumn, number>>;
export type HeaderAliases = Readonly<Record<AssignColumn, readonly string[]>>;

export interface AssignmentIndexOptions {
  /** Moodle course id. Defaults to the `course-NN` body class / breadcrumb. */
  courseId?: number;
  /** Course full name. Defaults to the page heading. */
  courseName?: string;
  /** Site root used to absolutise activity URLs. */
  baseUrl?: string;
  /** Timezone of the displayed dates (user's Moodle profile tz). Default "+05:30". */
  tzOffset?: string;
  /** Reference time for relative/year-less dates (tests). */
  now?: Date;
}

const COLUMN_ORDER: readonly AssignColumn[] = ["name", "due", "submission", "grade"];

function containsWord(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

/**
 * Map logical columns to header positions by header TEXT (aliases in
 * selectors.ts), never by position. Exact alias matches are assigned first,
 * then headers that contain an alias as whole word(s). Each header is used once.
 */
export function matchColumns(
  headers: readonly string[],
  aliases: HeaderAliases = ASSIGN_INDEX.headerAliases,
): ColumnMap {
  const norm = headers.map(normalizeHeader);
  const used = new Set<number>();
  const map: ColumnMap = {};
  const aliasNorm = (col: AssignColumn): string[] => aliases[col].map(normalizeHeader);

  for (const col of COLUMN_ORDER) {
    const al = aliasNorm(col);
    const idx = norm.findIndex((h, i) => !used.has(i) && al.includes(h));
    if (idx >= 0) {
      map[col] = idx;
      used.add(idx);
    }
  }
  for (const col of COLUMN_ORDER) {
    if (map[col] !== undefined) continue;
    const al = aliasNorm(col);
    const idx = norm.findIndex(
      (h, i) => !used.has(i) && h !== "" && al.some((a) => a !== "" && containsWord(h, a)),
    );
    if (idx >= 0) {
      map[col] = idx;
      used.add(idx);
    }
  }
  return map;
}

/** Submission cell text → submitted? (patterns in selectors.ts) */
export function isSubmittedText(text: string): boolean {
  const t = cleanText(text);
  if (!t) return false;
  if (ASSIGN_INDEX.notSubmittedPatterns.some((re) => re.test(t))) return false;
  return ASSIGN_INDEX.submittedPatterns.some((re) => re.test(t));
}

/**
 * Parse `mod/assign/index.php?id=COURSEID` into canonical assignments.
 * `Assignment.id` is the course-module id from the activity link (same as the
 * WS mapper). Throws `LmsParseError` if no assignment table can be found and
 * the page does not say the course has no assignments.
 */
export function parseAssignmentIndex(html: string, opts: AssignmentIndexOptions = {}): Assignment[] {
  const parser = "html.parseAssignmentIndex";
  const $ = loadPage(html, { stripHidden: true });

  const bodyMatch = ASSIGN_INDEX.bodyCourseClass.exec($("body").attr("class") ?? "");
  const crumbHref = firstMatch(ASSIGN_INDEX.breadcrumbCourseLink, (s) => $(s))?.last().attr("href");
  const courseId =
    opts.courseId ??
    (bodyMatch?.[1] !== undefined ? Number(bodyMatch[1]) : idFromHref(crumbHref, "course/view.php"));
  if (courseId === undefined) {
    throw new LmsParseError(parser, "Cannot determine course id — pass opts.courseId.");
  }
  const courseName =
    opts.courseName ??
    (firstText(ASSIGN_INDEX.courseHeading, (s) => $(s).first().text()) || `Course ${courseId}`);

  for (const tableSel of ASSIGN_INDEX.table) {
    const tables = $(tableSel);
    for (let t = 0; t < tables.length; t++) {
      const table = tables.eq(t);

      let headerCells = firstMatch(ASSIGN_INDEX.headerCells, (s) => table.find(s));
      if (!headerCells) headerCells = table.find("tr").first().children("th, td");
      const headers = headerCells.toArray().map((el) => $(el).text());
      const cols = matchColumns(headers);
      const nameCol = cols.name;
      if (nameCol === undefined) continue; // not the assignment table

      const rows = firstMatch(ASSIGN_INDEX.bodyRows, (s) => table.find(s)) ?? table.find("tr");
      const out: Assignment[] = [];
      rows.each((_, rowEl) => {
        const row = $(rowEl);
        const cells = row.children("td, th");
        if (cells.length <= nameCol) return; // divider / colspan row

        const nameCell = cells.eq(nameCol);
        const link =
          firstMatch(ASSIGN_INDEX.activityLink, (s) => nameCell.find(s))?.first() ??
          firstMatch(ASSIGN_INDEX.activityLink, (s) => row.find(s))?.first();
        const href = link?.attr("href");
        const cmid = idFromHref(href, "mod/assign/view.php") ?? idFromHref(href, "/mod/");
        if (cmid === undefined) return; // header row or non-activity row

        const name = cleanText(link?.text()) || cleanText(nameCell.text());
        const cellText = (col: number | undefined): string =>
          col === undefined ? "" : cleanText(cells.eq(col).text());

        const assignment: Assignment = {
          id: cmid,
          courseId,
          courseName,
          name,
          dueDate: parseMoodleDate(cellText(cols.due), { tzOffset: opts.tzOffset, now: opts.now }),
          submitted: isSubmittedText(cellText(cols.submission)),
          grade: tidyGrade(cellText(cols.grade)),
          url: absUrl(href, opts.baseUrl),
        };
        out.push(parseWith(AssignmentSchema, assignment, `${parser}(canonical)`));
      });
      return out;
    }
  }

  if (ASSIGN_INDEX.emptyPattern.test(cleanText($("body").text()))) return [];
  throw new LmsParseError(
    parser,
    "No table with an assignment-name column found (check ASSIGN_INDEX.table / headerAliases in selectors.ts).",
  );
}
