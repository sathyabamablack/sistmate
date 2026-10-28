import { describe, expect, it } from "vitest";
import { attendanceStats, type TimetableSlot } from "@usp/core";
import { buildWeekPlan } from "../week-plan";
import { MAX_LEAVE_DAYS, defaultLeave, leaveDays, planLeave, timetableDay } from "../leave-plan";

const slot = (day: number, startTime: string, courseCode: string): TimetableSlot => ({
  day,
  startTime,
  endTime: "10:00",
  courseCode,
  courseTitle: `Title ${courseCode}`,
});

// Mon: A, A (a lab block), B; Wed: A; Fri: B at 9 and C at 14:00. No weekend classes.
const TT = [
  slot(0, "09:00", "A"),
  slot(0, "09:00", "A"),
  slot(0, "11:00", "B"),
  slot(2, "09:00", "A"),
  slot(4, "09:00", "B"),
  slot(4, "14:00", "C"),
];
const SLOTS = buildWeekPlan(TT, { dayIndex: 0, minutes: 0 }).slots;

// 2026-10-26 is a Monday.
const MON = "2026-10-26";
const morning = (date: string) => ({ date, minutes: 8 * 60 });

describe("timetableDay", () => {
  it("numbers days from Monday, like the timetable", () => {
    expect(timetableDay("2026-10-26")).toBe(0);
    expect(timetableDay("2026-10-28")).toBe(2);
    expect(timetableDay("2026-11-01")).toBe(6);
  });
});

describe("defaultLeave", () => {
  it("starts tomorrow and runs three days", () => {
    expect(defaultLeave("2026-10-31")).toEqual({ from: "2026-11-01", to: "2026-11-03" });
  });
});

describe("leaveDays", () => {
  it("lists only the days with classes, oldest first", () => {
    const r = leaveDays(SLOTS, MON, "2026-11-02", morning(MON));
    expect(r.error).toBeNull();
    expect(r.days.map((d) => d.date)).toEqual(["2026-10-26", "2026-10-28", "2026-10-30", "2026-11-02"]);
    expect(r.days.map((d) => d.day)).toEqual([0, 2, 4, 0]);
    // The lab block counts as two classes.
    expect(r.days[0]!.classes.map((c) => c.code)).toEqual(["A", "A", "B"]);
  });

  it("leaves out today's classes that have already started", () => {
    const r = leaveDays(SLOTS, "2026-10-30", "2026-10-30", { date: "2026-10-30", minutes: 9 * 60 });
    expect(r.days).toHaveLength(1);
    expect(r.days[0]!.classes.map((c) => c.code)).toEqual(["C"]);
    // Once every class today has started, today drops out.
    expect(leaveDays(SLOTS, "2026-10-30", "2026-10-30", { date: "2026-10-30", minutes: 15 * 60 }).days).toEqual([]);
  });

  it("counts from today when the leave began earlier", () => {
    const r = leaveDays(SLOTS, MON, "2026-10-30", morning("2026-10-28"));
    expect(r.clamped).toBe(true);
    expect(r.days.map((d) => d.date)).toEqual(["2026-10-28", "2026-10-30"]);
  });

  it("is empty for a weekend with no classes", () => {
    const r = leaveDays(SLOTS, "2026-10-31", "2026-11-01", morning("2026-10-28"));
    expect(r).toEqual({ days: [], clamped: false, error: null });
  });

  it("explains a range it cannot plan", () => {
    const now = morning("2026-10-28");
    expect(leaveDays(SLOTS, "", "2026-10-30", now).error).toBe("invalid");
    expect(leaveDays(SLOTS, "2026-02-31", "2026-03-02", now).error).toBe("invalid");
    expect(leaveDays(SLOTS, "2026-10-30", "2026-10-29", now).error).toBe("reversed");
    expect(leaveDays(SLOTS, "2026-10-01", "2026-10-20", now).error).toBe("past");
    const far = new Date(Date.UTC(2026, 9, 28 + MAX_LEAVE_DAYS)).toISOString().slice(0, 10);
    expect(leaveDays(SLOTS, "2026-10-28", far, now).error).toBe("too-long");
    const edge = new Date(Date.UTC(2026, 9, 28 + MAX_LEAVE_DAYS - 1)).toISOString().slice(0, 10);
    expect(leaveDays(SLOTS, "2026-10-28", edge, now).error).toBeNull();
  });
});

describe("planLeave", () => {
  // A: 41 of 50 (82%), B: 30 of 48 (62.5%, already below), C: 22 of 24.
  const SUBJECTS = [
    { code: "A", attended: 41, total: 50 },
    { code: "B", attended: 30, total: 48 },
    { code: "C", attended: 22, total: 24 },
    { code: "D", attended: 10, total: 10 },
  ];
  const week = leaveDays(SLOTS, MON, "2026-11-01", morning(MON)).days;

  it("adds every missed class to the total and none to hours attended", () => {
    const plan = planLeave(SUBJECTS, week, new Set(), 80);
    expect(plan.days).toBe(3);
    expect(plan.missed).toBe(6);
    const a = plan.subjects.find((s) => s.code === "A")!;
    expect(a.missed).toBe(3);
    expect(a.now).toMatchObject({ attended: 41, total: 50, safe: true });
    expect(a.after).toMatchObject({ attended: 41, total: 53, safe: false });
    expect(a.after.percentage).toBeCloseTo((41 / 53) * 100);
  });

  it("says how many classes in a row bring each subject back, with the same maths as the bunk calculator", () => {
    const plan = planLeave(SUBJECTS, week, new Set(), 80);
    for (const s of plan.subjects) {
      expect(s.attendAfter).toBe(attendanceStats(s.after.attended, s.after.total, 80).needed);
    }
    expect(plan.subjects.find((s) => s.code === "A")!.attendAfter).toBe(7);
    expect(plan.subjects.find((s) => s.code === "C")!.attendAfter).toBe(0);
    expect(plan.below).toBe(2);
  });

  it("lists only subjects with a class while away, lowest first", () => {
    const plan = planLeave(SUBJECTS, week, new Set(), 80);
    expect(plan.subjects.map((s) => s.code)).toEqual(["B", "A", "C"]);
  });

  it("does not count the days ticked off as holidays", () => {
    const plan = planLeave(SUBJECTS, week, new Set([MON]), 80);
    expect(plan.days).toBe(2);
    expect(plan.missed).toBe(3);
    expect(plan.subjects.find((s) => s.code === "A")!.missed).toBe(1);
    const none = planLeave(SUBJECTS, week, new Set(week.map((d) => d.date)), 80);
    expect(none).toEqual({ days: 0, missed: 0, subjects: [], below: 0 });
  });

  it("counts classes of subjects with no record but has no figure for them", () => {
    const plan = planLeave([{ code: "A", attended: 41, total: 50 }], week, new Set(), 80);
    expect(plan.missed).toBe(6);
    expect(plan.subjects.map((s) => s.code)).toEqual(["A"]);
  });

  it("follows the student's threshold", () => {
    const plan = planLeave(SUBJECTS, week, new Set(), 75);
    expect(plan.subjects.find((s) => s.code === "A")!.after.safe).toBe(true);
  });
});
