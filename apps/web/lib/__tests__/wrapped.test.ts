import { describe, expect, it } from "vitest";
import type { AttendanceSubject, ExamResult, SemesterResult } from "@usp/core";
import {
  arrangeTiles,
  bestPapers,
  buildWrapped,
  clearedArrears,
  ESTIMATED_NOTE,
  formatDelta,
  gpaChangeWords,
  listTitles,
  tileRows,
  wrappedSlides,
  wrappedSummary,
  type SummaryTile,
  type WrappedPaper,
} from "../wrapped";

/** A paper with a published grade. */
const g = (code: string, grade: string, gradePoint: number, extra: Partial<ExamResult> = {}): ExamResult => ({
  code,
  title: `Course ${code}`,
  credits: 3,
  grade,
  gradePoint,
  ...extra,
});

const sem = (semester: number, gpa: number | null, results: ExamResult[], extra: Partial<SemesterResult> = {}): SemesterResult => ({
  semester,
  gpa,
  credits: results.filter((r) => (r.gradePoint ?? 0) > 0).reduce((s, r) => s + (r.credits ?? 0), 0),
  results,
  ...extra,
});

const att = (code: string, attended: number, totalClasses: number): AttendanceSubject => ({
  code,
  title: `Subject ${code}`,
  attended,
  totalClasses,
  percentage: Math.round((attended / totalClasses) * 10000) / 100,
});

const paper = (code: string, gradePoint: number | null, percent: number | null): WrappedPaper => ({
  code,
  title: code,
  grade: gradePoint == null ? null : String(gradePoint),
  gradePoint,
  total: null,
  maxTotal: null,
  percent,
});

describe("buildWrapped", () => {
  it("returns null when there are no results", () => {
    expect(buildWrapped({ results: [], attendance: [] })).toBeNull();
    // A semester listed with nothing scored is nothing to wrap either.
    expect(
      buildWrapped({ results: [sem(1, null, [{ code: "A", title: "A" }], { credits: null })], attendance: [] }),
    ).toBeNull();
  });

  it("wraps the latest semester with its GPA, the change and the CGPA", () => {
    const w = buildWrapped({
      results: [
        // Given out of order on purpose.
        sem(2, 8.4, [g("B1", "A+", 9), g("B2", "B++", 8)]),
        sem(1, 7.9, [g("A1", "B++", 8), g("A2", "B+", 7)]),
      ],
      attendance: [],
    })!;
    expect(w.semester).toBe(2);
    expect(w.gpa).toBe(8.4);
    expect(w.previous).toEqual({ semester: 1, gpa: 7.9 });
    expect(w.gpaDelta).toBe(0.5);
    expect(w.semesterCount).toBe(2);
    expect(w.history).toEqual([
      { semester: 1, gpa: 7.9 },
      { semester: 2, gpa: 8.4 },
    ]);
    expect(w.credits).toEqual({ semester: 6, total: 12 });
    expect(w.cgpa).toBeCloseTo(8.15, 2);
    expect(w.estimated).toBe(false);
  });

  it("rounds the change from the GPAs as shown, and handles a drop and a first semester", () => {
    const down = buildWrapped({
      results: [sem(1, 8.456, [g("A", "A+", 9)]), sem(2, 8.123, [g("B", "B++", 8)])],
      attendance: [],
    })!;
    // 8.12 - 8.46, not 8.123 - 8.456.
    expect(down.gpaDelta).toBe(-0.34);
    expect(gpaChangeWords(down)).toBe("Down 0.34 from semester 1");
    expect(formatDelta(down.gpaDelta!)).toBe("−0.34");

    const first = buildWrapped({ results: [sem(1, 9, [g("A", "A+", 9)])], attendance: [] })!;
    expect(first.previous).toBeNull();
    expect(first.gpaDelta).toBeNull();
    expect(gpaChangeWords(first)).toBe("Your first GPA on record");
  });

  it("compares with the last semester that had a GPA", () => {
    const w = buildWrapped({
      results: [
        sem(1, 8, [g("A", "B++", 8)]),
        sem(2, null, [g("B", "RA", 0)], { credits: 0 }),
        sem(3, 8.5, [g("C", "A+", 9), g("D", "B++", 8)]),
      ],
      attendance: [],
    })!;
    expect(w.previous).toEqual({ semester: 1, gpa: 8 });
    expect(gpaChangeWords({ gpaDelta: 0, previous: { semester: 1, gpa: 8 } })).toBe("Same as semester 1");
  });

  it("flags estimated grades, as the Results page does", () => {
    const estimated = (s: SemesterResult): SemesterResult => ({ ...s, estimated: true });
    const w = buildWrapped({
      results: [estimated(sem(1, 8, [g("A", "B++", 8, { counted: true })]))],
      attendance: [],
    })!;
    expect(w.estimated).toBe(true);
    expect(wrappedSummary(w, { hideGpa: false }).note).toBe(ESTIMATED_NOTE);

    const published = buildWrapped({ results: [sem(1, 8, [g("A", "B++", 8)])], attendance: [] })!;
    expect(published.estimated).toBe(false);
    expect(wrappedSummary(published, { hideGpa: false }).note).toBeNull();
  });

  it("works on marks alone: no GPA, CGPA or top grades, the best paper by percentage", () => {
    const w = buildWrapped({
      results: [
        sem(
          1,
          null,
          [
            { code: "A", title: "A", total: 70, maxTotal: 100, passed: true },
            { code: "B", title: "B", total: 45, maxTotal: 50, passed: true },
            // Higher marks but failed (exam minimum): never the best.
            { code: "C", title: "C", total: 95, maxTotal: 100, passed: false },
          ],
          { credits: null },
        ),
      ],
      attendance: [],
    })!;
    expect(w.graded).toBe(false);
    expect(w.gpa).toBeNull();
    expect(w.cgpa).toBeNull();
    expect(w.topGrades).toBeNull();
    expect(w.best.map((p) => p.code)).toEqual(["B"]);
    expect(w.best[0]!.percent).toBe(90);
    expect(wrappedSlides(w)).toEqual(["best", "arrears", "summary"]);
  });

  it("counts top grades (A+ and above) and leaves audit courses out", () => {
    const w = buildWrapped({
      results: [
        sem(1, 8.6, [
          g("A", "A++", 10),
          g("B", "A+", 9),
          g("C", "A+", 9),
          g("D", "B+", 7),
          { code: "M", title: "Mandatory", grade: "PASS", audit: true, credits: 0 },
        ]),
      ],
      attendance: [],
    })!;
    expect(w.topGrades).toEqual({
      count: 3,
      outOf: 4,
      byGrade: [
        { grade: "A++", count: 1 },
        { grade: "A+", count: 2 },
      ],
    });
    expect(w.papers.map((p) => p.code)).toEqual(["A", "B", "C", "D"]);
  });

  it("reports arrears cleared this semester and standing ones", () => {
    const fail = (code: string) => ({ code, title: `Course ${code}`, total: 30, maxTotal: 100, passed: false });
    const pass = (code: string) => ({ code, title: `Course ${code}`, total: 60, maxTotal: 100, passed: true });
    const cleared = buildWrapped({
      results: [sem(1, null, [fail("P"), pass("Q")], { credits: null }), sem(2, null, [pass("P")], { credits: null })],
      attendance: [],
    })!;
    expect(cleared.arrears).toEqual({
      standing: 0,
      clearedThisSemester: [{ code: "P", title: "Course P" }],
      clearedTotal: 1,
    });
    expect(clearedArrears([sem(1, null, [fail("P")]), sem(2, null, [pass("P")])])).toEqual([
      { code: "P", title: "Course P", semester: 2 },
    ]);

    const standing = buildWrapped({
      results: [sem(1, null, [fail("P"), pass("Q")], { credits: null })],
      attendance: [],
    })!;
    expect(standing.arrears.standing).toBe(1);
    // Standing arrears never reach the shared card.
    expect(wrappedSummary(standing, { hideGpa: false }).arrears).toBeNull();
    expect(wrappedSummary(cleared, { hideGpa: false }).arrears).toBe("Arrears cleared");
  });

  it("uses the profile's arrears figure only when no pass/fail is published", () => {
    const w = buildWrapped({ results: [sem(1, 8, [g("A", "B++", 8)])], attendance: [], profileArrears: 2 })!;
    // A published grade is an outcome, so the results decide: nothing failed.
    expect(w.arrears.standing).toBe(0);
  });

  it("sums attendance over the semester and picks the best subject", () => {
    const w = buildWrapped({
      results: [sem(1, 8, [g("A", "B++", 8)])],
      attendance: [att("X", 18, 20), att("Y", 9, 10), att("Z", 30, 40), att("E", 0, 0)],
      currentSemester: 2,
    })!;
    expect(w.attendance).toEqual({
      semester: 2,
      percentage: (57 / 70) * 100,
      // 90% each: more classes attended wins the tie.
      best: { code: "X", title: "Subject X", percentage: 90 },
      subjects: 3,
      threshold: 80,
    });
    expect(buildWrapped({ results: [sem(1, 8, [g("A", "B++", 8)])], attendance: [] })!.attendance).toBeNull();
  });
});

describe("bestPapers", () => {
  it("ranks by grade, then by marks", () => {
    expect(bestPapers([paper("a", 9, 85), paper("b", 10, 90), paper("c", 10, 93)]).map((p) => p.code)).toEqual(["c"]);
  });

  it("returns every paper tied on both, in order", () => {
    expect(bestPapers([paper("a", 10, 92), paper("b", 9, 99), paper("c", 10, 92)]).map((p) => p.code)).toEqual([
      "a",
      "c",
    ]);
    // Published grades without marks: a tie on the grade alone.
    expect(bestPapers([paper("a", 10, null), paper("b", 10, null), paper("c", 9, null)]).map((p) => p.code)).toEqual([
      "a",
      "b",
    ]);
  });

  it("is empty when nothing was scored", () => {
    expect(bestPapers([])).toEqual([]);
    expect(bestPapers([paper("a", null, null)])).toEqual([]);
  });
});

describe("summary card", () => {
  const w = buildWrapped({
    results: [sem(1, 7.9, [g("A1", "B++", 8)]), sem(2, 8.4, [g("B1", "A++", 10, { total: 93, maxTotal: 100 }), g("B2", "B+", 7)])],
    attendance: [att("X", 18, 20)],
    currentSemester: 3,
  })!;

  it("leads with the GPA and lists CGPA, credits, top grades, best subject and attendance", () => {
    const s = wrappedSummary(w, { hideGpa: false });
    expect(s.title).toBe("Semester 2 wrapped");
    expect(s.gpa).toEqual({ label: "Semester 2 GPA", value: "8.40", change: "Up 0.50 from semester 1" });
    expect(s.arrears).toBe("No arrears");
    expect(s.tiles.map((t) => t.id)).toEqual(["cgpa", "credits", "best", "top-grades", "attendance"]);
    const best = s.tiles.find((t) => t.id === "best")!;
    expect(best).toMatchObject({ value: "Course B1", grade: "A++", sub: "93 / 100", wide: true });
    expect(s.tiles.find((t) => t.id === "attendance")!.sub).toBe("semester 3 so far");
  });

  it("Hide GPA removes the GPA, its change and the CGPA", () => {
    const s = wrappedSummary(w, { hideGpa: true });
    expect(s.gpa).toBeNull();
    expect(s.tiles.map((t) => t.id)).not.toContain("cgpa");
    const words = JSON.stringify(s);
    expect(words).not.toContain("8.40");
    expect(words).not.toContain("GPA");
    // Attendance is left alone in its row, so it is widened.
    expect(s.tiles[s.tiles.length - 1]).toMatchObject({ id: "attendance", wide: true });
  });

  it("arranges half tiles in pairs and never leaves a gap", () => {
    const t = (id: SummaryTile["id"], wide = false): SummaryTile => ({ id, label: id, value: "1", sub: null, grade: null, wide });
    const rows = tileRows(arrangeTiles([t("cgpa"), t("credits"), t("top-grades"), t("best", true)]));
    expect(rows.map((r) => r.map((x) => x.id))).toEqual([["cgpa", "credits"], ["best"], ["top-grades"]]);
    expect(rows[2]![0]!.wide).toBe(true);
    const one = arrangeTiles([t("credits"), t("best", true)]);
    expect(one.map((x) => [x.id, x.wide])).toEqual([
      ["credits", true],
      ["best", true],
    ]);
  });
});

describe("wording", () => {
  it("lists titles", () => {
    expect(listTitles(["A"])).toBe("A");
    expect(listTitles(["A", "B"])).toBe("A and B");
    expect(listTitles(["A", "B", "C"])).toBe("A, B and 1 more");
    expect(listTitles(["A", "B", "C"], 3)).toBe("A, B and C");
  });

  it("formats the change with a real minus sign", () => {
    expect(formatDelta(0.24)).toBe("+0.24");
    expect(formatDelta(-0.1)).toBe("−0.10");
    expect(formatDelta(0.001)).toBe("0.00");
  });
});
