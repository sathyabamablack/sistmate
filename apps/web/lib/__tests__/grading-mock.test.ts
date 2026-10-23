import { describe, expect, it, vi } from "vitest";
import { computeCgpa, estimateGrades, hasGrades } from "@usp/core";
import { createMockErpAdapter } from "@usp/erp-adapter";
import { computeArrears } from "../arrears";

vi.mock("server-only", () => ({}));

const { creditsResolver, DEFAULT_GRADING_SETTINGS, presetById } = await import("../grading-presets");

/** Mock mode goes through the same estimate as the live ERP; e2e tests rely on these numbers. */
describe("mock results graded by the official rules", () => {
  it("estimates every past semester with official credits and a CGPA below 9.9", async () => {
    const raw = await createMockErpAdapter().getResults();
    expect(hasGrades(raw)).toBe(false); // marks only, like the live ERP
    const graded = estimateGrades(
      raw,
      creditsResolver(DEFAULT_GRADING_SETTINGS),
      presetById(DEFAULT_GRADING_SETTINGS.preset).scale,
    );
    expect(hasGrades(graded)).toBe(true);
    expect(graded.map((s) => s.credits)).toEqual([17, 15, 23, 14]);
    expect(graded.map((s) => s.gpa)).toEqual([8.71, 8.8, 8.48, 8.93]);
    const cgpa = computeCgpa(graded);
    expect(cgpa).toBeCloseTo(600 / 69, 10); // 8.70
    expect(cgpa).toBeLessThan(9.9);

    const all = graded.flatMap((s) => s.results);
    expect(all.every((r) => r.creditSource === "official")).toBe(true);
    expect(all.find((r) => r.code === "SCYB2101")).toMatchObject({ maxTotal: 50, percent: 84, grade: "A+" });
    expect(all.find((r) => r.code === "SISB4151")).toMatchObject({ audit: true, grade: "PASS", counted: false });
    // Physics is RA in semester 2, then cleared in semester 3: no standing arrear.
    expect(graded[1]!.results.find((r) => r.code === "SPHB1101")).toMatchObject({ grade: "RA", counted: false });
    expect(computeArrears(graded)).toEqual([]);
  });
});
