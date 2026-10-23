import { describe, expect, it } from "vitest";
import type { CourseModule, CourseSection, LmsCourse } from "@usp/core";
import {
  courseFiles,
  courseStats,
  currentSemesterCourseIds,
  fileSearchText,
  groupModules,
  matchesQuery,
  moduleSearchText,
  quizLine,
  sectionIsEmpty,
  sortCourses,
  statsLine,
  unitAnchor,
  unitStats,
} from "../course-work";

const NOW = new Date("2026-10-12T06:30:00Z"); // Mon 12 Oct 2026, noon on campus
const at = (days: number, hours = 0) => new Date(NOW.getTime() + days * 86_400_000 + hours * 3_600_000).toISOString();

const base = { description: [], dates: [], completed: null };
const fileModule = (id: number, names: string[], kind: "resource" | "folder" = "resource"): CourseModule => ({
  ...base,
  id,
  name: `Module ${id}`,
  kind,
  files: names.map((name) => ({ name, mimeType: "application/pdf", size: 1, modified: null, url: "https://x/y" })),
});
const pageModule = (id: number): CourseModule => ({ ...base, id, name: `Page ${id}`, kind: "page", content: [] });
const urlModule = (id: number): CourseModule => ({ ...base, id, name: `Link ${id}`, kind: "url", href: "https://x" });
const labelModule = (id: number, text: string): CourseModule => ({
  ...base,
  id,
  name: "Text",
  kind: "label",
  description: [{ type: "paragraph", content: [{ text }] }],
});
const forumModule = (id: number): CourseModule => ({ ...base, id, name: `Forum ${id}`, kind: "forum" });
const assignModule = (id: number): CourseModule => ({ ...base, id, name: `Lab ${id}`, kind: "assign", assignment: null });
const quizModule = (id: number, over: Partial<Extract<CourseModule, { kind: "quiz" }>> = {}): Extract<CourseModule, { kind: "quiz" }> => ({
  ...base,
  id,
  name: `Quiz ${id}`,
  kind: "quiz",
  openDate: at(-1),
  closeDate: at(2),
  timeLimitMinutes: 20,
  attempts: 1,
  maxGrade: 10,
  ...over,
});
const section = (number: number, modules: CourseModule[], name = `Unit ${number}`): CourseSection => ({
  id: 900 + number,
  number,
  name,
  summary: [],
  modules,
});

describe("sortCourses", () => {
  const c = (id: number, fullName: string, lastAccess?: string) => ({ id, fullName, lastAccess }) as LmsCourse;

  it("puts the most recently opened first, never-opened last, then sorts by name", () => {
    const sorted = sortCourses([
      c(1, "Zoology"),
      c(2, "Networks", at(-2)),
      c(3, "Algorithms", at(0, -3)),
      c(4, "Biology"),
      c(5, "Compilers", at(-2)),
    ]);
    expect(sorted.map((x) => x.id)).toEqual([3, 5, 2, 4, 1]);
  });
});

describe("currentSemesterCourseIds", () => {
  const courses = [
    { id: 1, shortName: "SCSA5105", fullName: "Design and Analysis of Algorithms" },
    { id: 2, shortName: "DAA-2025", fullName: "SCSA4101 Old subject" },
    { id: 3, shortName: "S12BLH31-A", fullName: "Physics lab" },
    { id: 4, shortName: "CS", fullName: "General" },
  ];

  it("keeps courses whose short or full name contains a current subject code", () => {
    expect(currentSemesterCourseIds(courses, ["SCSA5105", "s12blh31", "SCSA5105"])).toEqual([1, 3]);
    expect(currentSemesterCourseIds(courses, ["SCSA4101"])).toEqual([2]);
  });

  it("ignores codes that are too short to be safe and returns nothing without codes", () => {
    expect(currentSemesterCourseIds(courses, ["CS", "A"])).toEqual([]);
    expect(currentSemesterCourseIds(courses, [])).toEqual([]);
  });
});

describe("units and files", () => {
  const units = [
    section(0, [pageModule(1), fileModule(2, ["Syllabus.pdf"]), forumModule(3)], "Course information"),
    section(1, [labelModule(4, "Slides by Friday"), fileModule(5, ["U1 a.pdf", "U1 b.pdf"], "folder"), urlModule(6)]),
    section(2, [assignModule(7), quizModule(8), fileModule(9, ["U2.pptx"]), pageModule(10)]),
    section(3, []),
  ];

  it("counts items (not text notes) and files per unit", () => {
    expect(unitStats(units[1]!)).toEqual({ items: 2, files: 2 });
    expect(unitStats(units[2]!)).toEqual({ items: 4, files: 1 });
  });

  it("counts numbered units only, and skips empty ones", () => {
    expect(sectionIsEmpty(units[3]!)).toBe(true);
    expect(courseStats({ sections: units })).toEqual({ units: 2, files: 4, items: 9 });
    expect(statsLine({ units: 2, files: 4 })).toBe("2 units, 4 files");
    expect(statsLine({ units: 1, files: 1 })).toBe("1 unit, 1 file");
    expect(statsLine({ units: 0, files: 0 })).toBe("");
  });

  it("groups a unit's modules study material first, keeping course order inside each group", () => {
    const { notes, groups } = groupModules(units[2]!.modules);
    expect(notes).toEqual([]);
    expect(groups.map((g) => [g.label, g.modules.map((m) => m.id)])).toEqual([
      ["Files", [9]],
      ["Pages and links", [10]],
      ["Quizzes", [8]],
      ["Other activities", [7]],
    ]);
    expect(groupModules(units[1]!.modules).notes.map((m) => m.id)).toEqual([4]);
  });

  it("lists every file once, with its unit, in course order", () => {
    const files = courseFiles(units);
    expect(files.map((f) => [f.file.name, f.cmid, f.index, f.unitName, f.unitAnchor])).toEqual([
      ["Syllabus.pdf", 2, 0, "Course information", "unit-0"],
      ["U1 a.pdf", 5, 0, "Unit 1", "unit-1"],
      ["U1 b.pdf", 5, 1, "Unit 1", "unit-1"],
      ["U2.pptx", 9, 0, "Unit 2", "unit-2"],
    ]);
    expect(unitAnchor(units[2]!)).toBe("unit-2");
  });
});

describe("search", () => {
  it("matches every term against unit, module and file names", () => {
    const text = moduleSearchText(fileModule(5, ["Dynamic Programming.pdf"]), "Unit 3: DP");
    expect(matchesQuery(text, "dynamic unit")).toBe(true);
    expect(matchesQuery(text, "dynamic graphs")).toBe(false);
    expect(matchesQuery(text, "  ")).toBe(true);
    expect(moduleSearchText(labelModule(1, "Slides  by Friday"), "Unit 1")).toBe("unit 1 slides by friday");
  });

  it("builds the flat file list's search text", () => {
    const [ref] = courseFiles([section(3, [fileModule(5, ["DP.pdf"])])]);
    expect(fileSearchText(ref!)).toBe("dp.pdf module 5 unit 3");
  });
});

describe("quizLine", () => {
  it("says whether a quiz is open, upcoming or closed, without urgency colours", () => {
    expect(quizLine(quizModule(1), NOW)).toMatchObject({ phase: "open", tone: "muted", extra: "20 min, 1 attempt, 10 marks" });
    expect(quizLine(quizModule(2, { openDate: at(2), closeDate: at(3) }), NOW).phase).toBe("upcoming");
    expect(quizLine(quizModule(3, { openDate: at(-3), closeDate: at(-1) }), NOW).phase).toBe("closed");
  });
});
