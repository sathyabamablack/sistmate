import { describe, expect, it } from "vitest";
import { cleanCourseTitle, displayCourse, erpSubjects, extractCodes, visibleCourses } from "../course-names";

describe("cleanCourseTitle", () => {
  it.each([
    ["S12BLH31 - Programming in Java-Theory+Practical-III Semester-2025 Batch", "Programming in Java"],
    ["S13BLH21 - DIGITAL LOGIC CIRCUITS - BE - CSE/IT- III Semester - 2025 Batch", "Digital Logic Circuits"],
    ["DISCRETE MATHEMATICS AND NUMERICAL METHODS", "Discrete Mathematics and Numerical Methods"],
    [
      "SCSA1302/SCSB1303-Theory of Computation - CSE/SPECIALIZATION/IT - CORE - III - 2025 BATCH",
      "Theory of Computation",
    ],
    ["SISB4152-Basic Health and Hygiene for Engineering-CSE", "Basic Health and Hygiene for Engineering"],
    ["SCSB1202 - Data Structures _CSE AND IT_THEORY", "Data Structures"],
    ["SISB4301-UNIVERSAL HUMAN VALUES-2025 BATCH", "Universal Human Values"],
  ])("%s", (raw, clean) => {
    expect(cleanCourseTitle(raw)).toBe(clean);
  });

  it("leaves clean, mixed-case names alone", () => {
    expect(cleanCourseTitle("Design and Analysis of Algorithms")).toBe("Design and Analysis of Algorithms");
    expect(cleanCourseTitle("Object-Oriented Programming")).toBe("Object-Oriented Programming");
  });
});

describe("extractCodes", () => {
  it("finds every subject code and ignores long words", () => {
    expect(extractCodes("SCSA1302/SCSB1303-Theory of Computation - CSE/SPECIALIZATION/IT")).toEqual([
      "SCSA1302",
      "SCSB1303",
    ]);
    expect(extractCodes("DM&NM", "DISCRETE MATHEMATICS AND NUMERICAL METHODS")).toEqual([]);
  });
});

describe("displayCourse", () => {
  const subjects = erpSubjects(
    [
      { code: "SMTB1302", title: "Discrete Mathematics and Numerical Methods" },
      { code: "SCSB1303", title: "Theory of Computation" },
      { code: "S12BLH31", title: "Programming in Java" },
    ],
    [{ courseCode: "SCSBOB1301", courseTitle: "Computer Architecture and Organization" }],
  );

  it("matches by code and uses the ERP title", () => {
    const d = displayCourse(
      { fullName: "SCSA1302/SCSB1303-Theory of Computation - CORE - III - 2025 BATCH", shortName: "TOC" },
      subjects,
    );
    expect(d).toEqual({ title: "Theory of Computation", code: "SCSB1303", current: true });
  });

  it("matches by title when the Moodle name has no code", () => {
    const d = displayCourse({ fullName: "DISCRETE MATHEMATICS AND NUMERICAL METHODS", shortName: "DM&NM" }, subjects);
    expect(d).toEqual({ title: "Discrete Mathematics and Numerical Methods", code: "SMTB1302", current: true });
  });

  it("keeps older courses as not current, with a cleaned title and their own code", () => {
    const d = displayCourse({ fullName: "SCSB1202 - Data Structures _CSE AND IT_THEORY", shortName: "SCSB1202" }, subjects);
    expect(d).toEqual({ title: "Data Structures", code: "SCSB1202", current: false });
  });
});

describe("visibleCourses", () => {
  const subjects = erpSubjects([{ code: "SCSB1303", title: "Theory of Computation" }], []);
  const current = { id: 1, fullName: "SCSB1303-Theory of Computation", shortName: "TOC" };
  const old = { id: 2, fullName: "SCSB1202 - Data Structures", shortName: "SCSB1202" };
  const alsoOld = { id: 3, fullName: "SCSB1101 - Programming in C", shortName: "SCSB1101" };
  const all = [current, old, alsoOld];

  it("lists this semester only by default", () => {
    expect(visibleCourses(all, { courseFilter: "current", hiddenCourses: [] }, subjects)).toEqual([current]);
  });

  it("lists every semester when the student asks for it", () => {
    expect(visibleCourses(all, { courseFilter: "all", hiddenCourses: [] }, subjects)).toEqual(all);
  });

  it("falls back to the full list when nothing matches this semester", () => {
    // A term the ERP has not published yet must not leave the page empty.
    expect(visibleCourses([old, alsoOld], { courseFilter: "current", hiddenCourses: [] }, subjects)).toEqual([
      old,
      alsoOld,
    ]);
  });

  it("always drops courses hidden by hand, under either filter", () => {
    expect(visibleCourses(all, { courseFilter: "current", hiddenCourses: [1] }, subjects)).toEqual([old, alsoOld]);
    expect(visibleCourses(all, { courseFilter: "all", hiddenCourses: [2] }, subjects)).toEqual([current, alsoOld]);
  });
});
