import { describe, expect, it } from "vitest";
import { SATHYABAMA_GRADE_SCALE } from "@usp/core";
import { caeStart, endSemTiles } from "../endsem";

const java = { externalMax: 50, paperMax: 100, maxTotal: 100, scale: SATHYABAMA_GRADE_SCALE };

describe("endSemTiles", () => {
  it("matches the Programming in Java card: internal 42/50", () => {
    const tiles = endSemTiles({ ...java, internal: 42 });
    expect(tiles.map((t) => [t.grade, t.paperNeeded])).toEqual([
      ["C", 30],
      ["B+", 36],
      ["B++", 56],
      ["A+", 76],
      ["A++", 96],
    ]);
    expect(tiles.every((t) => t.reachable)).toBe(true);
  });

  it("asks only the 30% pass minimum when the internal mark already earns the grade", () => {
    const [c, bPlus] = endSemTiles({ ...java, internal: 42 });
    expect(c).toMatchObject({ needed: 15, atMinimum: true });
    expect(bPlus).toMatchObject({ needed: 18, atMinimum: false });
    const strong = endSemTiles({ ...java, internal: 50 });
    expect(strong[0]).toMatchObject({ grade: "C", needed: 15, paperNeeded: 30 });
    // 50 internal + 40 exam marks reaches 90 (A++).
    expect(strong.at(-1)).toMatchObject({ grade: "A++", needed: 40, paperNeeded: 80, reachable: true });
  });

  it("marks grades out of reach when even a full exam falls short", () => {
    const weak = endSemTiles({ ...java, internal: 20 });
    // 20 + 50 = 70: B++ is the best possible.
    expect(weak.map((t) => [t.grade, t.reachable])).toEqual([
      ["C", true],
      ["B+", true],
      ["B++", true],
      ["A+", false],
      ["A++", false],
    ]);
    expect(weak[2]).toMatchObject({ needed: 50, paperNeeded: 100 });
  });

  it("keeps marks as they are when the exam is not converted", () => {
    // A lab: 50 total, 25 exam marked on its own maximum, 30% pass minimum = 8 (7.5 rounded up).
    const lab = endSemTiles({ internal: 20, externalMax: 25, paperMax: 25, maxTotal: 50, scale: SATHYABAMA_GRADE_SCALE });
    expect(lab[0]).toMatchObject({ grade: "C", needed: 8, paperNeeded: 8 });
    expect(lab.at(-1)).toMatchObject({ grade: "A++", needed: 25, reachable: true });
    const low = endSemTiles({ internal: 15, externalMax: 25, paperMax: 25, maxTotal: 50, scale: SATHYABAMA_GRADE_SCALE });
    expect(low.at(-1)).toMatchObject({ grade: "A++", reachable: false });
  });

  it("returns nothing for a course without an exam", () => {
    expect(endSemTiles({ internal: 40, externalMax: 0, paperMax: 0, maxTotal: 50, scale: SATHYABAMA_GRADE_SCALE })).toEqual([]);
  });

  it("follows a custom scale and ignores the failing band", () => {
    const scale = [
      { min: 75, grade: "A", points: 9 },
      { min: 50, grade: "B", points: 7 },
      { min: 0, grade: "F", points: 0 },
    ];
    expect(endSemTiles({ ...java, internal: 40, scale }).map((t) => t.grade)).toEqual(["B", "A"]);
  });
});

describe("caeStart", () => {
  it("averages the CAEs scored so far, scaled to the internal maximum", () => {
    expect(
      caeStart(
        [
          { name: "CAE 1", scored: 42, max: 50 },
          { name: "CAE 2", scored: 42, max: 50 },
        ],
        50,
      ),
    ).toBe(42);
    expect(
      caeStart(
        [
          { name: "CAE 1", scored: 18, max: 20 },
          { name: "CAE 2", scored: 14, max: 20 },
        ],
        50,
      ),
    ).toBe(40);
  });

  it("uses the one CAE there is, and null when none is scored", () => {
    expect(caeStart([{ name: "CAE 1", scored: 30, max: 50 }, { name: "CAE 2", scored: null, max: 50 }], 50)).toBe(30);
    expect(caeStart([{ name: "CAE 1", scored: null, max: 50 }], 50)).toBeNull();
    expect(caeStart([], 50)).toBeNull();
  });
});
