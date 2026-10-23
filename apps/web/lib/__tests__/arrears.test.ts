import { describe, expect, it } from "vitest";
import type { SemesterResult } from "@usp/core";
import { arrearsLabel, attemptOutcome, computeArrears } from "../arrears";

const sem = (semester: number, results: SemesterResult["results"]): SemesterResult => ({
  semester,
  gpa: null,
  credits: null,
  results,
});

describe("attemptOutcome", () => {
  it("trusts the passed flag first, then the grade", () => {
    expect(attemptOutcome({ code: "A", title: "A", passed: false, grade: "A" })).toBe("failed");
    expect(attemptOutcome({ code: "A", title: "A", passed: true, grade: "U" })).toBe("passed");
    expect(attemptOutcome({ code: "A", title: "A", grade: "U" })).toBe("failed");
    expect(attemptOutcome({ code: "A", title: "A", grade: "B+", gradePoint: 7 })).toBe("passed");
    expect(attemptOutcome({ code: "A", title: "A", grade: "X", gradePoint: 0 })).toBe("failed");
    expect(attemptOutcome({ code: "A", title: "A" })).toBe("unknown");
  });
});

describe("computeArrears", () => {
  it("returns nothing when every paper passed", () => {
    const r = computeArrears([sem(1, [{ code: "M1", title: "Maths", grade: "A", gradePoint: 8 }])]);
    expect(r).toEqual([]);
  });

  it("drops a paper that failed and was passed in a later semester", () => {
    const r = computeArrears([
      sem(1, [{ code: "M1", title: "Maths", passed: false, internal: 30, total: 42 }]),
      sem(2, [{ code: "M1", title: "Maths", passed: true, internal: 30, total: 61 }]),
    ]);
    expect(r).toEqual([]);
  });

  it("keeps a paper that was never cleared, with the exam marks the official rule needs", () => {
    const r = computeArrears([
      sem(3, [{ code: "DS", title: "Data Structures", passed: false, internal: 28, total: 41 }]),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      code: "DS",
      semester: 3,
      failedAttempts: 1,
      internal: 28,
      lastTotal: 41,
      maxTotal: 100,
      externalMax: 50,
      passTotal: 50,
      externalMin: 15,
      externalNeeded: 22, // 50 - 28
      outOfReach: false,
      audit: false,
    });
  });

  it("never asks for less than the 30% exam minimum", () => {
    const r = computeArrears([
      sem(1, [{ code: "P", title: "Physics", passed: false, internal: 45, external: 10, total: 55 }]),
    ]);
    expect(r[0]).toMatchObject({ externalNeeded: 15, outOfReach: false });
  });

  it("uses the paper's own maxima: a one-credit lab out of 50 needs 25 in total and 8 of 25", () => {
    const lab = { maxTotal: 50, internalMax: 25, externalMax: 25 };
    const r = computeArrears([
      sem(1, [
        { code: "L1", title: "Physics Lab", passed: false, internal: 22, external: 5, total: 27, ...lab },
        { code: "L2", title: "Chemistry Lab", passed: false, internal: 10, external: 6, total: 16, ...lab },
      ]),
    ]);
    expect(r[0]).toMatchObject({ code: "L1", passTotal: 25, externalMin: 8, externalNeeded: 8 });
    expect(r[1]).toMatchObject({ code: "L2", externalNeeded: 15, outOfReach: false });
  });

  it("flags a paper whose internal marks put a pass out of reach", () => {
    const r = computeArrears([sem(1, [{ code: "P", title: "Physics", passed: false, internal: 8, total: 20 }])]);
    expect(r[0]).toMatchObject({ externalNeeded: 42, outOfReach: false });
    const lab = computeArrears([
      sem(1, [{ code: "L", title: "Lab", passed: false, internal: 0, total: 10, maxTotal: 50, internalMax: 25, externalMax: 20 }]),
    ]);
    expect(lab[0]).toMatchObject({ externalNeeded: 25, outOfReach: true });
  });

  it("asks only for the exam minimum when internal marks already cover the total", () => {
    const r = computeArrears([
      sem(1, [{ code: "P", title: "Physics", passed: false, internal: 50, total: 40 }]),
    ]);
    expect(r[0]).toMatchObject({ externalNeeded: 15, outOfReach: false });
  });

  it("does not ask for exam marks for a failed audit course", () => {
    const r = computeArrears([
      sem(1, [{ code: "SISB4151", title: "EVS", grade: "FAIL", internal: 20, total: 20, audit: true, maxTotal: 50, externalMax: 0 }]),
    ]);
    expect(r[0]).toMatchObject({ audit: true, externalNeeded: null, outOfReach: false });
  });

  it("handles a paper with no internal marks known", () => {
    const r = computeArrears([sem(2, [{ code: "C", title: "Chem", grade: "U" }])]);
    expect(r[0]).toMatchObject({
      internal: null,
      lastTotal: null,
      externalNeeded: null,
      outOfReach: false,
    });
  });

  it("counts repeat failures and still reports an arrear when the retry failed too", () => {
    const r = computeArrears([
      sem(1, [{ code: "M1", title: "Maths", grade: "U" }]),
      sem(2, [{ code: "M1", title: "Maths", passed: false, internal: 20 }]),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ semester: 2, failedAttempts: 2, externalNeeded: 30 });
  });

  it("treats RA, absent and withdrawn grades as fails", () => {
    expect(attemptOutcome({ code: "A", title: "A", grade: "RA" })).toBe("failed");
    expect(attemptOutcome({ code: "A", title: "A", grade: "AAA" })).toBe("failed");
    expect(attemptOutcome({ code: "A", title: "A", grade: "W" })).toBe("failed");
    expect(attemptOutcome({ code: "A", title: "A", grade: "PASS" })).toBe("passed");
  });

  it("ignores rows with no known outcome and sorts by semester then code", () => {
    const r = computeArrears([
      sem(4, [{ code: "Z", title: "Z", passed: false }]),
      sem(2, [
        { code: "B", title: "B", passed: false },
        { code: "A", title: "A", passed: false },
        { code: "N", title: "No result yet" },
      ]),
    ]);
    expect(r.map((a) => a.code)).toEqual(["A", "B", "Z"]);
  });

  it("does not depend on the order semesters arrive in", () => {
    const r = computeArrears([
      sem(2, [{ code: "M1", title: "Maths", passed: true }]),
      sem(1, [{ code: "M1", title: "Maths", passed: false }]),
    ]);
    expect(r).toEqual([]);
  });
});

describe("arrearsLabel", () => {
  it("pluralises", () => {
    expect(arrearsLabel(1)).toBe("1 paper to clear");
    expect(arrearsLabel(2)).toBe("2 papers to clear");
  });
});
