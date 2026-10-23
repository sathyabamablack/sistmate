import { describe, expect, it } from "vitest";
import {
  attendanceStats,
  DEFAULT_ATTENDANCE_THRESHOLD,
  cgpaStanding,
  computeCgpa,
  computeGpa,
  gpaNeededForTarget,
  overallAttendance,
} from "../src/calc";

/** Exact integer check: attended/total >= T% */
const meets = (attended: number, total: number, T: number) => 100 * attended >= T * total;

describe("attendanceStats (bunk calculator)", () => {
  it("matches hand-worked examples at 75%", () => {
    expect(attendanceStats(42, 48, 75)).toMatchObject({ canSkip: 8, needed: 0, safe: true });
    expect(attendanceStats(30, 48, 75)).toMatchObject({ canSkip: 0, needed: 24, safe: false });
    expect(attendanceStats(33, 44, 75)).toMatchObject({ canSkip: 0, needed: 0, safe: true });
    expect(attendanceStats(0, 0, 75)).toMatchObject({ percentage: 100, safe: true, canSkip: 0 });
  });

  it("defaults to the 80% requirement", () => {
    expect(DEFAULT_ATTENDANCE_THRESHOLD).toBe(80);
    // 42 of 48 is 87.5%: 4 spare hours at 80, where it had 8 at 75.
    expect(attendanceStats(42, 48)).toMatchObject({ canSkip: 4, needed: 0, safe: true });
    // 36 of 48 is 75%, which is now below the line.
    expect(attendanceStats(36, 48)).toMatchObject({ canSkip: 0, needed: 12, safe: false });
    expect(attendanceStats(0, 0)).toMatchObject({ percentage: 100, safe: true, canSkip: 0 });
  });

  it("canSkip is the exact maximum and needed the exact minimum, for every case", () => {
    for (const T of [60, 65, 70, 75, 80, 85, 90]) {
      for (let total = 1; total <= 120; total++) {
        for (let a = 0; a <= total; a++) {
          const s = attendanceStats(a, total, T);
          expect(s.safe).toBe(meets(a, total, T));
          if (s.safe) {
            // skipping canSkip keeps you at/above T; one more drops you below
            expect(meets(a, total + s.canSkip, T)).toBe(true);
            expect(meets(a, total + s.canSkip + 1, T)).toBe(false);
          } else {
            // attending `needed` in a row gets you there; one fewer doesn't
            expect(meets(a + s.needed, total + s.needed, T)).toBe(true);
            expect(meets(a + s.needed - 1, total + s.needed - 1, T)).toBe(false);
          }
        }
      }
    }
  });

  it("aggregates subjects for the overall figure", () => {
    const overall = overallAttendance([
      { code: "A", title: "A", attended: 42, totalClasses: 48, percentage: 87.5 },
      { code: "B", title: "B", attended: 30, totalClasses: 48, percentage: 62.5 },
    ]);
    expect(overall.percentage).toBe(75);
    // 72 of 96 is exactly 75%, which is below the 80% requirement.
    expect(overall.safe).toBe(false);
  });

  it("takes the threshold for the overall figure", () => {
    const subjects = [
      { code: "A", title: "A", attended: 42, totalClasses: 48, percentage: 87.5 },
      { code: "B", title: "B", attended: 30, totalClasses: 48, percentage: 62.5 },
    ];
    // 72 of 96 is exactly 75%: safe at 60 and 75, below at 80.
    expect(overallAttendance(subjects, 60)).toMatchObject({ safe: true, canSkip: 24 });
    expect(overallAttendance(subjects, 80)).toMatchObject({ safe: false, needed: 24 });
  });

  it("uses the given threshold for skip and catch-up counts", () => {
    expect(attendanceStats(42, 48, 80)).toMatchObject({ safe: true, canSkip: 4, needed: 0 });
    expect(attendanceStats(36, 48, 80)).toMatchObject({ safe: false, needed: 12 });
    expect(attendanceStats(30, 48, 60)).toMatchObject({ safe: true, canSkip: 2 });
  });
});

describe("GPA maths", () => {
  it("credit-weights a semester GPA", () => {
    expect(
      computeGpa([
        { credits: 4, gradePoint: 10 },
        { credits: 2, gradePoint: 7 },
      ]),
    ).toBeCloseTo(9, 10);
    expect(computeGpa([])).toBe(0);
  });

  it("credit-weights CGPA across semesters", () => {
    const sems = [
      { semester: 1, gpa: 8, credits: 20, results: [] },
      { semester: 2, gpa: 9, credits: 30, results: [] },
    ];
    expect(computeCgpa(sems)).toBeCloseTo(8.6, 10);
  });

  it("what-if: GPA needed next semester round-trips to the target", () => {
    const sems = [
      { semester: 1, gpa: 8, credits: 20, results: [] },
      { semester: 2, gpa: 9, credits: 30, results: [] },
    ];
    const need = gpaNeededForTarget(sems, 8.8, 25);
    expect(computeCgpa([...sems, { semester: 3, gpa: need, credits: 25, results: [] }])).toBeCloseTo(8.8, 10);
  });
});

describe("cgpaStanding (official rules)", () => {
  const paper = (code: string, credits: number, gradePoint: number, counted: boolean) => ({
    code,
    title: code,
    credits,
    gradePoint,
    counted,
  });

  it("sums estimated semesters course by course over counted papers only", () => {
    const sems = [
      { semester: 1, gpa: 10, credits: 3, estimated: true, results: [paper("A", 3, 10, true), paper("B", 3, 0, false)] },
      { semester: 2, gpa: 8, credits: 6, estimated: true, results: [paper("C", 3, 8, true), paper("B", 3, 6, true)] },
    ];
    expect(cgpaStanding(sems)).toEqual({ cgpa: 8, credits: 9, points: 72 });
    // 9 credits earned; 22 more at 10 reach (72 + 220) / 31
    expect(gpaNeededForTarget(sems, 292 / 31, 22)).toBeCloseTo(10, 10);
  });

  it("counts a course once, with its latest passing attempt", () => {
    const sems = [
      { semester: 2, gpa: 9, credits: 3, estimated: true, results: [paper("A", 3, 9, true)] },
      { semester: 1, gpa: 7, credits: 3, estimated: true, results: [paper("A", 3, 7, true)] },
    ];
    expect(cgpaStanding(sems)).toMatchObject({ cgpa: 9, credits: 3 });
  });

  it("mixes published semesters (GPA x credits) with estimated ones", () => {
    const sems = [
      { semester: 1, gpa: 8, credits: 20, results: [] },
      { semester: 2, gpa: 10, credits: 4, estimated: true, results: [paper("X", 4, 10, true)] },
    ];
    expect(computeCgpa(sems)).toBeCloseTo((160 + 40) / 24, 10);
  });

  it("is 0 when nothing counts", () => {
    expect(cgpaStanding([])).toEqual({ cgpa: 0, credits: 0, points: 0 });
  });
});
