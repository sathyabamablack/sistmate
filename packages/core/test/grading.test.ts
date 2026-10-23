import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRADE_SCALE,
  SATHYABAMA_GRADE_SCALE,
  defaultCredits,
  estimateGrades,
  gradeFor,
  gradeForPercent,
  internalMarks,
  projectedCgpa,
  requiredExternal,
  semesterGpa,
} from "../src/grading";
import { computeCgpa } from "../src/calc";
import { courseResolver } from "../src/sathyabama";
import type { SemesterResult } from "../src/types";

describe("internalMarks", () => {
  it("is (CAE1 + CAE2) x 0.3 + assignment/attendance", () => {
    expect(internalMarks(40, 30, 25)).toBe(46);
    expect(internalMarks(30, 30, 20)).toBe(38);
  });

  it("caps at the internal maximum", () => {
    expect(internalMarks(50, 50, 25)).toBe(50); // 30 + 25 = 55 -> 50
  });

  it("treats a missing CAE as zero and rounds to 2 places", () => {
    expect(internalMarks(null, 40, 25)).toBe(37);
    expect(internalMarks(33, 34, 25)).toBe(45); // 45.1 rounds to the nearest mark
    expect(internalMarks(17, 18, 25)).toBe(36); // 35.5 rounds up
  });

  it("honours custom weight and cap, and never goes negative", () => {
    expect(internalMarks(40, 40, 10, { caeWeight: 0.5, internalMax: 60 })).toBe(50);
    expect(internalMarks(0, 0, -5)).toBe(0);
  });
});

describe("gradeFor", () => {
  it("picks the highest official band the percentage reaches", () => {
    expect(gradeFor(95)).toMatchObject({ grade: "A++", points: 10 });
    expect(gradeFor(90)).toMatchObject({ grade: "A++", points: 10 });
    expect(gradeFor(80)).toMatchObject({ grade: "A+", points: 9 });
    expect(gradeFor(79.9)).toMatchObject({ grade: "B++", points: 8 });
    expect(gradeFor(60)).toMatchObject({ grade: "B+", points: 7 });
    expect(gradeFor(50)).toMatchObject({ grade: "C", points: 6 });
    expect(gradeFor(49.9)).toMatchObject({ grade: "RA", points: 0 });
  });

  it("never rounds a fractional percent up into the next band", () => {
    expect(gradeForPercent(89.5).grade).toBe("A+");
    expect(gradeForPercent(89.99).grade).toBe("A+");
  });

  it("works with a custom, unsorted scale", () => {
    const scale = [
      { min: 0, grade: "F", points: 0 },
      { min: 60, grade: "P", points: 6 },
      { min: 85, grade: "D", points: 9 },
    ];
    expect(gradeFor(90, scale).grade).toBe("D");
    expect(gradeFor(70, scale).grade).toBe("P");
    expect(gradeFor(10, scale).grade).toBe("F");
  });

  it("the default scale is the official one, sorted from best to worst", () => {
    expect(DEFAULT_GRADE_SCALE).toBe(SATHYABAMA_GRADE_SCALE);
    expect(SATHYABAMA_GRADE_SCALE.map((b) => `${b.grade}:${b.min}:${b.points}`)).toEqual([
      "A++:90:10",
      "A+:80:9",
      "B++:70:8",
      "B+:60:7",
      "C:50:6",
      "RA:0:0",
    ]);
  });
});

describe("requiredExternal", () => {
  it("rounds the gap up to a whole mark", () => {
    expect(requiredExternal(41.5, 80)).toEqual({ needed: 39, reachable: true, secured: false });
  });

  it("flags a target the external cannot reach", () => {
    expect(requiredExternal(30, 90)).toEqual({ needed: 60, reachable: false, secured: false });
  });

  it("is secured when internals already reach the target", () => {
    expect(requiredExternal(50, 50)).toEqual({ needed: 0, reachable: true, secured: true });
    expect(requiredExternal(55, 50).secured).toBe(true);
  });

  it("an exact fit needs exactly the gap", () => {
    expect(requiredExternal(40, 90)).toEqual({ needed: 50, reachable: true, secured: false });
  });
});

describe("semesterGpa and projectedCgpa", () => {
  it("credit-weights the grade points", () => {
    expect(semesterGpa([{ credits: 4, points: 9 }, { credits: 2, points: 6 }])).toBe(8);
    expect(semesterGpa([])).toBe(0);
  });

  it("projects CGPA across earlier semesters", () => {
    expect(projectedCgpa({ cgpa: 8, credits: 40 }, { cgpa: 9, credits: 20 })).toBe(8.33);
    expect(projectedCgpa(null, { cgpa: 7.5, credits: 20 })).toBe(7.5);
    expect(projectedCgpa(null, { cgpa: 0, credits: 0 })).toBe(0);
  });
});

const sem = (semester: number, results: SemesterResult["results"]): SemesterResult => ({
  semester,
  gpa: null,
  credits: null,
  results,
});

describe("defaultCredits (fallback rules)", () => {
  it("gives two-credit labs 2, one-credit labs 1, LH courses 4 and theory 3", () => {
    expect(defaultCredits("SCSA1201", "Programming Laboratory")).toBe(2);
    expect(defaultCredits("SCSA1202", "Data Structures")).toBe(3);
    expect(defaultCredits("SXXB2101", "Physics Lab")).toBe(1);
    expect(defaultCredits("S99BLH41", "Something")).toBe(4);
  });
});

describe("estimateGrades (official rules)", () => {
  it("grades by percent of the course maximum, weights by credits and flags the semester", () => {
    const [s1] = estimateGrades(
      [
        sem(1, [
          { code: "SMTB1302", title: "Discrete Mathematics", internal: 46, external: 46, total: 92, passed: true }, // A++ 10 x 3
          { code: "S12BLH31", title: "Programming in Java", internal: 40, external: 32, total: 72, passed: true }, // B++ 8 x 4
          { code: "SPHA2101", title: "Physics Lab", internal: 20, external: 18, total: 38, passed: true }, // 76% B++ 8 x 1
        ]),
      ],
      courseResolver(),
    );
    expect(s1!.estimated).toBe(true);
    expect(s1!.credits).toBe(8);
    expect(s1!.gpa).toBe(8.75); // (30 + 32 + 8) / 8
    expect(s1!.results.map((r) => r.grade)).toEqual(["A++", "B++", "B++"]);
    expect(s1!.results[2]).toMatchObject({
      maxTotal: 50,
      percent: 76,
      credits: 1,
      creditSource: "official",
      counted: true,
    });
  });

  it("leaves a failed paper (RA) out of both sides of the GPA", () => {
    const [s1] = estimateGrades(
      [
        sem(2, [
          { code: "SCSB1303", title: "Theory of Computation", total: 90, passed: true },
          { code: "SCSB1201", title: "Data Structures", total: 38, passed: false },
          { code: "SMTB1201", title: "Calculus", total: null, passed: false },
        ]),
      ],
      courseResolver(),
    );
    expect(s1!.results[1]).toMatchObject({ grade: "RA", gradePoint: 0, counted: false });
    expect(s1!.credits).toBe(3);
    expect(s1!.gpa).toBe(10); // the RA does not pull it down
    expect(s1!.results[2]!.grade).toBeUndefined();
  });

  it("gives RA when the exam is under 30% of its maximum even if the total passes", () => {
    const [s1] = estimateGrades(
      [sem(1, [{ code: "SCSB1303", title: "Theory of Computation", internal: 50, external: 14, total: 64 }])],
      courseResolver(),
    );
    expect(s1!.results[0]).toMatchObject({ grade: "RA", passed: false, counted: false, percent: 64 });
    expect(s1!.gpa).toBeNull();
    expect(s1!.credits).toBe(0);
    expect(s1!.estimated).toBe(true);
  });

  it("passes at exactly 15 of 50 in the exam and needs 7.5 of 25 in a one-credit lab", () => {
    const [s1] = estimateGrades(
      [
        sem(1, [
          { code: "SCSB1303", title: "Theory of Computation", internal: 40, external: 15, total: 55 },
          { code: "SPHB2101", title: "Physics Lab", internal: 20, external: 7, total: 27 },
          { code: "SCYB2101", title: "Chemistry Lab", internal: 17, external: 8, total: 25 },
        ]),
      ],
      courseResolver(),
    );
    expect(s1!.results.map((r) => r.grade)).toEqual(["C", "RA", "C"]);
  });

  it("trusts the ERP's Pass even when the percent looks too low, giving the lowest pass", () => {
    const [s1] = estimateGrades([sem(1, [{ code: "ZZ1", title: "Mystery", total: 40, passed: true }])]);
    expect(s1!.results[0]).toMatchObject({ grade: "C", gradePoint: 6, counted: true });
  });

  it("never counts an audit course, but grades it PASS or FAIL", () => {
    const [s1] = estimateGrades(
      [
        sem(1, [
          { code: "SCSB1303", title: "Theory of Computation", total: 80, passed: true },
          { code: "SISB4151", title: "Environmental Science and Engineering", internal: 41, total: 41 },
          { code: "SBTA1101", title: "Environmental Science and Engineering", total: 20 },
        ]),
      ],
      courseResolver(),
    );
    expect(s1!.results[1]).toMatchObject({ grade: "PASS", audit: true, counted: false, credits: 0 });
    expect(s1!.results[2]).toMatchObject({ grade: "FAIL", audit: true, counted: false });
    expect(s1!.credits).toBe(3);
    expect(s1!.gpa).toBe(9);
  });

  it("scores absent and withdrawn papers 0 and leaves them out", () => {
    const [s1] = estimateGrades(
      [
        sem(1, [
          { code: "SCSB1303", title: "Theory of Computation", total: 70, passed: true },
          { code: "SMTB1302", title: "Discrete Mathematics", grade: "AAA" },
          { code: "SCSB1301", title: "Computer Architecture", grade: "w" },
        ]),
      ],
      courseResolver(),
    );
    expect(s1!.results[1]).toMatchObject({ grade: "AAA", gradePoint: 0, counted: false });
    expect(s1!.results[2]).toMatchObject({ grade: "W", gradePoint: 0, counted: false });
    expect(s1!.gpa).toBe(8);
    expect(s1!.credits).toBe(3);
  });

  it("uses the student's credit correction over the catalog", () => {
    const [s1] = estimateGrades(
      [sem(1, [{ code: "SCSB1303", title: "Theory of Computation", total: 80, passed: true }])],
      courseResolver({ SCSB1303: 4 }),
    );
    expect(s1!.results[0]).toMatchObject({ credits: 4, creditSource: "custom" });
    expect(s1!.credits).toBe(4);
  });

  it("marks fallback credits as estimated and fixes maxima the marks disprove", () => {
    const [s1] = estimateGrades([
      sem(1, [
        { code: "SXXB2105", title: "Physics Lab", internal: 40, external: 36, total: 76, passed: true },
        { code: "SXXB1105", title: "Something New", total: 81, passed: true },
      ]),
    ]);
    expect(s1!.results[0]).toMatchObject({ maxTotal: 100, credits: 2, percent: 76, creditSource: "estimated" });
    expect(s1!.results[1]).toMatchObject({ maxTotal: 100, credits: 3, grade: "A+", creditSource: "estimated" });
  });

  it("still accepts a legacy resolver that returns plain credits", () => {
    const published: SemesterResult = { semester: 1, gpa: 8, credits: 20, results: [] };
    const out = estimateGrades(
      [published, sem(2, [{ code: "C1", title: "Maths", total: 80, passed: true }])],
      () => 4,
    );
    expect(out[0]).toBe(published);
    expect(out[1]!.credits).toBe(4);
    expect(computeCgpa(out)).toBeCloseTo((8 * 20 + 9 * 4) / 24, 5);
  });

  it("leaves a semester with no scored papers without a GPA", () => {
    const [s1] = estimateGrades([sem(3, [{ code: "D1", title: "Maths", total: null }])]);
    expect(s1!.gpa).toBeNull();
    expect(s1!.estimated).toBeUndefined();
  });

  it("counts an arrear once it is cleared, with the grade of the passing attempt", () => {
    const out = estimateGrades(
      [
        sem(2, [
          { code: "SCSB1303", title: "Theory of Computation", total: 90, passed: true },
          { code: "SPHB1101", title: "Physics", internal: 28, external: 12, total: 40, passed: false },
        ]),
        sem(3, [
          { code: "SMTB1302", title: "Discrete Mathematics", total: 70, passed: true },
          { code: "SPHB1101", title: "Physics", internal: 28, external: 27, total: 55, passed: true },
        ]),
      ],
      courseResolver(),
    );
    expect(out[0]!.gpa).toBe(10); // the RA is left out of semester 2
    expect(out[0]!.credits).toBe(3);
    expect(out[1]!.credits).toBe(6);
    // (3 x 10 + 3 x 8 + 3 x 6) / 9 = 8
    expect(computeCgpa(out)).toBeCloseTo(8, 10);
  });

  it("computes the real semester-3 example from the regulations note", () => {
    const row = (code: string, title: string, total: number) => ({ code, title, total, passed: true });
    const [s3] = estimateGrades(
      [
        sem(3, [
          row("SMTB1302", "Discrete Mathematics and Numerical Methods", 95), // A++
          row("SCSB1303", "Theory of Computation", 85), // A+
          row("SCSBOB1301", "Computer Architecture and Organization", 82), // A+
          row("SISB4301", "Universal Human Values", 91), // A++
          row("S13BLH21", "Digital Logic Circuits", 74), // B++
          row("S12BLH31", "Programming in Java", 88), // A+
        ]),
      ],
      courseResolver(),
    );
    expect(s3!.results.map((r) => r.credits)).toEqual([3, 3, 3, 3, 4, 4]);
    expect(s3!.credits).toBe(20);
    expect(s3!.gpa).toBe(9.1); // 182 / 20
  });
});
