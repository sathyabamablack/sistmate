import type { CourseContents, CourseFile, CourseModule, CourseSection, Inline, LmsCourse, RichBlock } from "@usp/core";
import { formatWhen, relativeTo, type Tone } from "../components/courses/format";

/**
 * Pure course logic shared by the course list and the course page.
 *
 * Students open a course for its study material (unit slides, PDFs, pages and
 * links), so everything here is organised around units and files. Assignments
 * are still listed, quietly, with the other activities. Kept free of
 * "server-only" so it can be unit tested.
 */

/* ------------------------------ course list ------------------------------ */

/** Most recently opened first; courses never opened go last; then by name. */
export function sortCourses<T extends Pick<LmsCourse, "fullName" | "lastAccess">>(courses: T[]): T[] {
  const at = (c: T) => {
    const t = c.lastAccess ? Date.parse(c.lastAccess) : NaN;
    return Number.isNaN(t) ? -Infinity : t;
  };
  return [...courses].sort((a, b) => at(b) - at(a) || a.fullName.localeCompare(b.fullName));
}

const normCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Courses that belong to this semester: their short or full name contains one of
 * the subject codes the ERP lists for this term (attendance and timetable), such
 * as "SCSA5105" or "S12BLH31". Codes shorter than 5 characters are ignored so a
 * stray "CS" can't match everything.
 */
export function currentSemesterCourseIds(
  courses: Pick<LmsCourse, "id" | "shortName" | "fullName">[],
  codes: Iterable<string>,
): number[] {
  const wanted = [...new Set([...codes].map(normCode).filter((c) => c.length >= 5))];
  if (wanted.length === 0) return [];
  return courses
    .filter((c) => {
      const hay = `${normCode(c.shortName)} ${normCode(c.fullName)}`;
      return wanted.some((code) => hay.includes(code));
    })
    .map((c) => c.id);
}

/* --------------------------------- units --------------------------------- */

export function sectionIsEmpty(s: CourseSection): boolean {
  return s.modules.length === 0 && s.summary.length === 0;
}

export function unitAnchor(s: Pick<CourseSection, "number">): string {
  return `unit-${s.number}`;
}

export function moduleFileCount(m: CourseModule): number {
  return m.kind === "resource" || m.kind === "folder" ? m.files.length : 0;
}

export interface UnitStats {
  /** Modules other than text notes. */
  items: number;
  files: number;
}

export function unitStats(s: CourseSection): UnitStats {
  let items = 0;
  let files = 0;
  for (const m of s.modules) {
    if (m.kind !== "label") items++;
    files += moduleFileCount(m);
  }
  return { items, files };
}

export interface CourseStats {
  /** Numbered units with something in them (the general "Course information" section is not a unit). */
  units: number;
  files: number;
  /** Modules other than text notes, over every shown section. */
  items: number;
}

export function courseStats(contents: Pick<CourseContents, "sections">): CourseStats {
  const shown = contents.sections.filter((s) => !sectionIsEmpty(s));
  let files = 0;
  let items = 0;
  for (const s of shown) {
    const st = unitStats(s);
    files += st.files;
    items += st.items;
  }
  return { units: shown.filter((s) => s.number > 0).length, files, items };
}

/** "4 units, 9 files"; parts that are zero are left out. */
export function statsLine(st: Pick<CourseStats, "units" | "files">): string {
  const parts: string[] = [];
  if (st.units > 0) parts.push(`${st.units} ${st.units === 1 ? "unit" : "units"}`);
  if (st.files > 0) parts.push(`${st.files} ${st.files === 1 ? "file" : "files"}`);
  return parts.join(", ");
}

export type ModuleGroupKey = "files" | "pages" | "quizzes" | "other";

export const MODULE_GROUPS: { key: ModuleGroupKey; label: string }[] = [
  { key: "files", label: "Files" },
  { key: "pages", label: "Pages and links" },
  { key: "quizzes", label: "Quizzes" },
  { key: "other", label: "Other activities" },
];

export function moduleGroup(m: CourseModule): ModuleGroupKey | "notes" {
  switch (m.kind) {
    case "resource":
    case "folder":
      return "files";
    case "page":
    case "url":
      return "pages";
    case "quiz":
      return "quizzes";
    case "label":
      return "notes";
    default:
      return "other";
  }
}

/** A unit's modules by kind, study material first. Course order is kept inside each group. */
export function groupModules(modules: CourseModule[]): {
  notes: CourseModule[];
  groups: { key: ModuleGroupKey; label: string; modules: CourseModule[] }[];
} {
  const notes = modules.filter((m) => m.kind === "label");
  const groups = MODULE_GROUPS.map((g) => ({ ...g, modules: modules.filter((m) => moduleGroup(m) === g.key) })).filter(
    (g) => g.modules.length > 0,
  );
  return { notes, groups };
}

/** One file anywhere in the course, for the flat "All files" view. */
export interface CourseFileRef {
  /** Module (course-module id) the file belongs to, and its index there. */
  cmid: number;
  index: number;
  file: CourseFile;
  moduleName: string;
  unitName: string;
  unitAnchor: string;
}

export function courseFiles(sections: CourseSection[]): CourseFileRef[] {
  const out: CourseFileRef[] = [];
  for (const s of sections) {
    for (const m of s.modules) {
      if (m.kind !== "resource" && m.kind !== "folder") continue;
      m.files.forEach((file, index) =>
        out.push({ cmid: m.id, index, file, moduleName: m.name, unitName: s.name, unitAnchor: unitAnchor(s) }),
      );
    }
  }
  return out;
}

/* --------------------------------- quizzes -------------------------------- */

export type QuizModule = Extract<CourseModule, { kind: "quiz" }>;

export interface QuizLine {
  phase: "closed" | "upcoming" | "open";
  state: string;
  tone: Tone;
  extra: string;
}

export function quizLine(m: QuizModule, now: Date): QuizLine {
  const t = now.getTime();
  const opens = m.openDate ? Date.parse(m.openDate) : null;
  const closes = m.closeDate ? Date.parse(m.closeDate) : null;
  const bits: string[] = [];
  let state: string;
  let phase: QuizLine["phase"];
  if (closes !== null && closes < t) {
    phase = "closed";
    state = `Closed ${formatWhen(m.closeDate, now)}`;
  } else if (opens !== null && opens > t) {
    phase = "upcoming";
    state = `Opens ${formatWhen(m.openDate, now)}`;
    if (m.closeDate) bits.push(`closes ${formatWhen(m.closeDate, now)}`);
  } else {
    phase = "open";
    state = m.closeDate ? `Open, closes ${formatWhen(m.closeDate, now)} (${relativeTo(m.closeDate, now)})` : "Open";
  }
  if (m.timeLimitMinutes) bits.push(`${m.timeLimitMinutes} min`);
  if (m.attempts) bits.push(m.attempts === 1 ? "1 attempt" : `${m.attempts} attempts`);
  else if (m.openDate || m.closeDate) bits.push("unlimited attempts");
  if (m.maxGrade) bits.push(`${m.maxGrade} marks`);
  // Quizzes stay quiet: no urgency colours, just the facts.
  return { phase, state, tone: "muted", extra: bits.join(", ") };
}

/* --------------------------------- search -------------------------------- */

const inlineText = (runs: Inline[]) => runs.map((r) => r.text).join("");

export function blocksText(blocks: RichBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "paragraph":
        case "heading":
        case "quote":
          return inlineText(b.content);
        case "list":
          return b.items.map(inlineText).join(" ");
        case "code":
          return b.text;
      }
    })
    .join(" ");
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Lower-case text the in-course search matches against: unit, module and file names. */
export function moduleSearchText(m: CourseModule, unitName: string): string {
  const parts = [unitName, m.kind === "label" ? blocksText(m.description) : m.name];
  if (m.kind === "resource" || m.kind === "folder") parts.push(...m.files.map((f) => f.name));
  return squash(parts.join(" "));
}

/** Lower-case text one file in the "All files" view matches against. */
export function fileSearchText(f: Pick<CourseFileRef, "file" | "moduleName" | "unitName">): string {
  return squash(`${f.file.name} ${f.moduleName} ${f.unitName}`);
}

/** Every whitespace-separated term must appear somewhere in the text. */
export function matchesQuery(text: string, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((t) => text.includes(t));
}
