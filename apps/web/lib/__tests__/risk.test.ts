import { describe, expect, it } from "vitest";
import type { AttendanceSubject, CalendarEvent } from "@usp/core";
import { attendanceRisks, nextCountdowns, whenLabel } from "../risk";

const subj = (code: string, attended: number, totalClasses: number): AttendanceSubject => ({
  code,
  title: `Subject ${code}`,
  attended,
  totalClasses,
  percentage: totalClasses ? (attended / totalClasses) * 100 : 0,
});

describe("attendanceRisks", () => {
  it("returns nothing when everything is comfortably above the threshold", () => {
    expect(attendanceRisks([subj("A", 95, 100), subj("B", 85, 100)])).toEqual([]);
  });

  it("uses the 80% requirement by default", () => {
    // 75 of 100 was exactly on the old line; it is below the new one.
    expect(attendanceRisks([subj("A", 75, 100)])[0]?.level).toBe("below");
    expect(attendanceRisks([subj("A", 75, 100)])[0]?.action).toContain("to get back to 80%");
    expect(attendanceRisks([subj("A", 80, 100)])[0]?.level).toBe("near");
    expect(attendanceRisks([subj("A", 85, 100)])).toEqual([]);
  });

  it("returns nothing with no data, and skips subjects with no hours", () => {
    expect(attendanceRisks([])).toEqual([]);
    expect(attendanceRisks([subj("A", 0, 0)])).toEqual([]);
  });

  it("tells a subject below the threshold how many classes to attend", () => {
    const [r] = attendanceRisks(
      [{ ...subj("SCSA5105", 30, 48), title: "Design and Analysis of Algorithms" }],
      75,
    );
    expect(r?.level).toBe("below");
    expect(r?.action).toBe(
      "Attend the next 24 classes in Design and Analysis of Algorithms to get back to 75%",
    );
  });

  it("uses the singular for one class", () => {
    // 79 of 99 attended: one more class makes 80 of 100.
    const [r] = attendanceRisks([subj("A", 79, 99)]);
    expect(r?.action).toContain("Attend the next 1 class in");
  });

  it("flags subjects within 5 points as near, with a skip budget", () => {
    const risks = attendanceRisks([subj("A", 40, 50), subj("B", 83, 100)]);
    expect(risks.map((r) => r.level)).toEqual(["near", "near"]);
    expect(risks[0]?.code).toBe("A");
    expect(risks[0]?.action).toBe("Missing the next class in Subject A takes you below 80%");
    expect(risks[1]?.action).toBe("You can miss only 3 classes in Subject B before dropping below 80%");
  });

  it("treats exactly the threshold as near, and threshold + 5 as safe", () => {
    expect(attendanceRisks([subj("A", 75, 100)], 75)[0]?.level).toBe("near");
    expect(attendanceRisks([subj("A", 80, 100)], 75)).toEqual([]);
  });

  it("lists below before near, lowest first inside each group", () => {
    const risks = attendanceRisks([
      subj("NEAR1", 82, 100),
      subj("LOW2", 70, 100),
      subj("NEAR2", 81, 100),
      subj("LOW1", 60, 100),
    ]);
    expect(risks.map((r) => r.code)).toEqual(["LOW1", "LOW2", "NEAR2", "NEAR1"]);
  });

  it("follows a custom threshold", () => {
    const subjects = [subj("A", 70, 100)];
    expect(attendanceRisks(subjects, 75)[0]?.level).toBe("below");
    expect(attendanceRisks(subjects, 66)[0]?.level).toBe("near");
    expect(attendanceRisks(subjects, 65)).toEqual([]);
    expect(attendanceRisks(subjects, 80)[0]?.action).toContain("get back to 80%");
  });
});

const NOW = new Date("2026-10-11T08:00:00+05:30");
const ev = (id: string, type: CalendarEvent["type"], date: string, title = id): CalendarEvent => ({
  id,
  title,
  date,
  type,
  source: "lms",
});

describe("whenLabel", () => {
  it("reads naturally", () => {
    expect(whenLabel(0)).toBe("today");
    expect(whenLabel(1)).toBe("tomorrow");
    expect(whenLabel(11)).toBe("in 11 days");
  });
});

describe("nextCountdowns", () => {
  it("handles no events", () => {
    expect(nextCountdowns([], NOW)).toEqual({ exam: null });
  });

  it("picks the soonest exam, whatever the input order, and never counts down assignments", () => {
    const r = nextCountdowns(
      [
        ev("late-exam", "exam", "2026-11-20T10:00:00+05:30", "Model exam"),
        ev("cia2", "exam", "2026-10-22T10:00:00+05:30", "CIA-2 Examination"),
        ev("a1", "assignment", "2026-10-15T23:59:00+05:30"),
        ev("lab", "class", "2026-10-12T14:00:00+05:30"),
      ],
      NOW,
    );
    expect(r.exam?.text).toBe("CIA-2 Examination in 11 days");
    expect(r.exam?.days).toBe(11);
    expect(Object.keys(r)).toEqual(["exam"]);
  });

  it("skips past events and today's events whose time has passed", () => {
    const r = nextCountdowns(
      [
        ev("old", "exam", "2026-10-01T10:00:00+05:30"),
        ev("earlier-today", "exam", "2026-10-11T06:00:00+05:30"),
        ev("tonight", "assignment", "2026-10-11T23:59:00+05:30"),
      ],
      NOW,
    );
    expect(r.exam).toBeNull();
  });

  it("keeps a date-only event for today", () => {
    expect(nextCountdowns([ev("d", "exam", "2026-10-11")], NOW).exam?.when).toBe("today");
  });
});
