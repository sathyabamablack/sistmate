import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLD,
  attendanceAdvice,
  attendanceTone,
  formatPct,
  toneLabels,
} from "../attendance";

describe("formatPct", () => {
  it("drops a trailing .0 and never rounds up across a boundary", () => {
    expect(formatPct(100)).toBe("100%");
    expect(formatPct(87.5)).toBe("87.5%");
    expect(formatPct(74.96)).toBe("74.9%");
    expect(formatPct(79.96)).toBe("79.9%");
    expect(formatPct(79.999)).toBe("79.9%");
    expect(formatPct(0)).toBe("0%");
  });

  it("rounds the last decimal properly when no whole number is at stake", () => {
    // Plain flooring reported these a tenth low: 44/45 read "97.7%".
    expect(formatPct((44 / 45) * 100)).toBe("97.8%");
    expect(formatPct((30 / 31) * 100)).toBe("96.8%");
    expect(formatPct((74 / 75) * 100)).toBe("98.7%");
    expect(formatPct(89.8)).toBe("89.8%");
  });
});

describe("attendanceAdvice", () => {
  it("does not judge a subject with no hours recorded yet", () => {
    const a = attendanceAdvice(0, 0);
    expect(a.tone).toBe("none");
    expect(a.long).not.toMatch(/limit|below/i);
  });

  it("tells a 100% subject how many hours it can afford to miss", () => {
    const a = attendanceAdvice(26, 26);
    expect(a.tone).toBe("success");
    expect(a.short).toBe("Can skip 6");
  });

  it("flags exactly the requirement as the limit", () => {
    const a = attendanceAdvice(4, 5);
    expect(a.tone).toBe("warning");
    expect(a.short).toBe("Exactly 80%");
  });

  it("says how many hours to attend when below the requirement", () => {
    const a = attendanceAdvice(6, 10);
    expect(a.tone).toBe("danger");
    expect(a.short).toBe("Attend next 10");
  });
});

describe("attendance threshold", () => {
  it("uses the 80% bands by default", () => {
    expect(DEFAULT_THRESHOLD).toBe(80);
    expect(attendanceTone(79.9)).toBe("danger");
    expect(attendanceTone(80)).toBe("warning");
    expect(attendanceTone(84.9)).toBe("warning");
    expect(attendanceTone(85)).toBe("success");
    expect(toneLabels().danger).toBe("Below 80%");
  });

  it("still works at the old 75% line when a student sets it", () => {
    expect(attendanceTone(74.9, 75)).toBe("danger");
    expect(attendanceTone(75, 75)).toBe("warning");
    expect(attendanceTone(80, 75)).toBe("success");
    expect(toneLabels(75).danger).toBe("Below 75%");
    expect(attendanceAdvice(3, 4, 75).short).toBe("Exactly 75%");
    expect(attendanceAdvice(6, 10, 75).short).toBe("Attend next 6");
  });

  it("moves the bands with the threshold", () => {
    expect(attendanceTone(79, 80)).toBe("danger");
    expect(attendanceTone(84, 80)).toBe("warning");
    expect(attendanceTone(85, 80)).toBe("success");
    expect(attendanceTone(59, 60)).toBe("danger");
    expect(attendanceTone(65, 60)).toBe("success");
    expect(toneLabels(80).danger).toBe("Below 80%");
  });

  it("reads the threshold number in the advice at 80%", () => {
    const below = attendanceAdvice(7, 10, 80);
    expect(below.tone).toBe("danger");
    expect(below.short).toBe("Attend next 5");
    expect(below.long).toContain("Below 80%");
    expect(below.long).not.toContain("75");

    const exact = attendanceAdvice(4, 5, 80);
    expect(exact.tone).toBe("warning");
    expect(exact.short).toBe("Exactly 80%");

    const near = attendanceAdvice(17, 21, 80);
    expect(near.short).toBe("Don't skip");
    expect(near.long).toContain("Just above 80%");

    const ok = attendanceAdvice(26, 26, 80);
    expect(ok.short).toBe("Can skip 6");
    expect(ok.long).toContain("at or above 80%");
  });

  it("is more forgiving at 60%", () => {
    expect(attendanceAdvice(6, 10, 60).short).toBe("Exactly 60%");
    const a = attendanceAdvice(26, 26, 60);
    expect(a.short).toBe("Can skip 17");
    expect(attendanceAdvice(5, 10, 60).short).toBe("Attend next 3");
  });
});
