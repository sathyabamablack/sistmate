import { describe, expect, it } from "vitest";
import {
  externalMinimum,
  fallbackCourseInfo,
  passTotal,
  passes,
  percentOf,
  regulationFromCode,
  resolveCourse,
} from "../src/course-rules";
import { catalogCourse, courseInfo, courseResolver } from "../src/sathyabama";

describe("courseInfo: the six real-capture codes come from the catalog", () => {
  it.each([
    ["SISB4301", 3, "integrated"],
    ["S13BLH21", 4, "integrated"],
    ["SMTB1302", 3, "theory"],
    ["SCSB1303", 3, "theory"],
    ["S12BLH31", 4, "integrated"],
    ["SCSBOB1301", 3, "theory"],
  ] as const)("%s is %i credits (%s), 50 + 50 = 100, official, 2023", (code, credits, type) => {
    expect(courseInfo(code)).toMatchObject({
      credits,
      type,
      maxTotal: 100,
      internalMax: 50,
      externalMax: 50,
      audit: false,
      source: "official",
      regulation: "2023",
    });
  });

  it("ignores the ERP's misleading Practical label for catalogued courses", () => {
    expect(courseInfo("SISB4301", "Universal Human Values", "Practical").credits).toBe(3);
    expect(courseInfo("S12BLH31", "Programming in Java", "Practical").credits).toBe(4);
  });

  it("normalises case and spaces in the code", () => {
    expect(courseInfo(" scsb 1303 ").source).toBe("official");
    expect(catalogCourse("scsb1303")?.title).toBe("Theory of Computation");
  });

  it("knows one-credit 50-mark labs, and the 2019 one-credit labs marked out of 100", () => {
    expect(courseInfo("SPHA2101")).toMatchObject({ credits: 1, maxTotal: 50, internalMax: 25, externalMax: 25 });
    expect(courseInfo("SCSA2305")).toMatchObject({ credits: 1, maxTotal: 100, externalMax: 50 });
  });

  it("marks audit courses as zero-credit", () => {
    expect(courseInfo("SISB4151")).toMatchObject({ credits: 0, audit: true, externalMax: 0 });
    expect(courseInfo("SBTA1101")).toMatchObject({ credits: 0, audit: true, regulation: "2019" });
  });
});

describe("fallbackCourseInfo for codes the catalog does not list", () => {
  it("reads the regulation from the letter after the programme code", () => {
    expect(regulationFromCode("SCSA1201")).toBe("2019");
    expect(regulationFromCode("SCSB1303")).toBe("2023");
    expect(regulationFromCode("S12BLH31")).toBe("2023");
    expect(regulationFromCode("SMAT5101")).toBeNull();
  });

  it("LH is a 4-credit integrated course, PB a 3-credit project-based one", () => {
    expect(fallbackCourseInfo("S99BLH41", "Anything", "Practical")).toMatchObject({
      credits: 4,
      type: "integrated",
      maxTotal: 100,
      source: "fallback",
    });
    expect(fallbackCourseInfo("S11BPB51")).toMatchObject({ credits: 3, type: "integrated" });
  });

  it("labs are 2 credits out of 100 unless they look like a one-credit lab", () => {
    expect(fallbackCourseInfo("SXXB2201", "Networks Lab")).toMatchObject({ credits: 2, maxTotal: 100 });
    expect(fallbackCourseInfo("SXXB2201", "Chemistry Lab")).toMatchObject({
      credits: 1,
      maxTotal: 50,
      internalMax: 25,
      externalMax: 25,
    });
    expect(fallbackCourseInfo("SCSA6105", "Advanced Topics")).toMatchObject({ type: "practical" });
  });

  it("treats a bare ERP Practical as a lab and everything else as 3-credit theory", () => {
    expect(fallbackCourseInfo("SMAT5101", "Queueing", "Practical")).toMatchObject({ type: "practical", credits: 2 });
    expect(fallbackCourseInfo("SMAT5101", "Probability and Queueing Theory", "THEORY")).toMatchObject({
      type: "theory",
      credits: 3,
      maxTotal: 100,
    });
  });

  it("knows projects, training and audit codes", () => {
    expect(fallbackCourseInfo("S99APROJ2").credits).toBe(7);
    expect(fallbackCourseInfo("S99BPT1")).toMatchObject({ credits: 2, internalMax: 0, externalMax: 100 });
    expect(fallbackCourseInfo("SISB4159")).toMatchObject({ credits: 0, audit: true });
  });
});

describe("pass rule", () => {
  const theory = courseInfo("SCSB1303");
  const lab1 = courseInfo("SPHA2101");

  it("needs 50% of the total and 30% of the exam maximum", () => {
    expect(passTotal(theory)).toBe(50);
    expect(externalMinimum(theory)).toBe(15);
    expect(passTotal(lab1)).toBe(25);
    expect(externalMinimum(lab1)).toBe(7.5);
    expect(passes(50, 15, theory)).toBe(true);
    expect(passes(49, 30, theory)).toBe(false);
    expect(passes(64, 14, theory)).toBe(false);
    expect(passes(25, 8, lab1)).toBe(true);
    expect(passes(27, 7, lab1)).toBe(false);
  });

  it("checks only the total when the exam mark is unknown or there is no exam", () => {
    expect(passes(60, null, theory)).toBe(true);
    expect(passes(30, null, courseInfo("SISB4151"))).toBe(true);
  });

  it("percentOf scales to 100 and caps", () => {
    expect(percentOf(38, 50)).toBe(76);
    expect(percentOf(120, 100)).toBe(100);
    expect(percentOf(10, 0)).toBe(0);
  });
});

describe("credit corrections", () => {
  it("labels official, estimated and custom credits", () => {
    expect(resolveCourse(courseInfo("SCSB1303")).creditSource).toBe("official");
    expect(resolveCourse(courseInfo("SMAT5101", "Probability")).creditSource).toBe("estimated");
    expect(resolveCourse(courseInfo("SCSB1303"), 4)).toMatchObject({ credits: 4, creditSource: "custom" });
  });

  it("courseResolver applies the student's overrides by code", () => {
    const resolve = courseResolver({ SCSB1303: 2 });
    expect(resolve("SCSB1303", "Theory of Computation")).toMatchObject({ credits: 2, creditSource: "custom" });
    expect(resolve("SMTB1302", "Discrete Mathematics")).toMatchObject({ credits: 3, creditSource: "official" });
  });

  it("giving an audit course credits makes it count", () => {
    expect(resolveCourse(courseInfo("SISB4151"), 2)).toMatchObject({ credits: 2, audit: false });
  });
});
