import { describe, expect, it } from "vitest";
import type { TimetableSlot } from "@usp/core";
import { buildWeekPlan, upcomingHours } from "../week-plan";

const slot = (day: number, startTime: string, courseCode: string): TimetableSlot => ({
  day,
  startTime,
  endTime: "10:00",
  courseCode,
  courseTitle: `Title ${courseCode}`,
});

const TT = [
  slot(2, "09:00", "A"),
  slot(0, "11:00", "B"),
  slot(0, "09:00", "A"),
  slot(0, "09:00", "A"), // a lab block: same subject twice at one start
  slot(4, "09:00", "B"),
];

describe("buildWeekPlan", () => {
  it("lists the rest of the week and marks classes that have started", () => {
    const plan = buildWeekPlan(TT, { dayIndex: 0, minutes: 10 * 60 });
    expect(plan.nextWeek).toBe(false);
    expect(plan.days).toEqual([0, 2, 4]);
    const byId = Object.fromEntries(plan.slots.map((s) => [s.id, s.upcoming]));
    expect(byId["0-09:00-A"]).toBe(false);
    expect(byId["0-09:00-A-2"]).toBe(false);
    expect(byId["0-11:00-B"]).toBe(true);
    expect(byId["2-09:00-A"]).toBe(true);
    expect(byId["4-09:00-B"]).toBe(true);
  });

  it("gives every class a unique id and a stable colour per subject", () => {
    const plan = buildWeekPlan(TT, { dayIndex: 0, minutes: 0 });
    expect(new Set(plan.slots.map((s) => s.id)).size).toBe(plan.slots.length);
    const colours = new Map<string, number>();
    for (const s of plan.slots) {
      colours.set(s.code, colours.get(s.code) ?? s.cat);
      expect(s.cat).toBe(colours.get(s.code));
    }
  });

  it("counts a class as started at its start minute", () => {
    const plan = buildWeekPlan(TT, { dayIndex: 0, minutes: 11 * 60 });
    expect(plan.slots.find((s) => s.id === "0-11:00-B")!.upcoming).toBe(false);
  });

  it("shows the coming week once the last class is over", () => {
    for (const clock of [
      { dayIndex: 6, minutes: 0 },
      { dayIndex: 4, minutes: 12 * 60 },
    ]) {
      const plan = buildWeekPlan(TT, clock);
      expect(plan.nextWeek).toBe(true);
      expect(plan.slots.every((s) => s.upcoming)).toBe(true);
    }
  });

  it("copes with an empty timetable", () => {
    expect(buildWeekPlan([], { dayIndex: 2, minutes: 600 })).toEqual({
      slots: [],
      days: [],
      nextWeek: false,
    });
  });
});

describe("upcomingHours", () => {
  it("counts only upcoming classes per subject", () => {
    const plan = buildWeekPlan(TT, { dayIndex: 0, minutes: 10 * 60 });
    expect(upcomingHours(plan.slots)).toEqual(
      new Map([
        ["B", 2],
        ["A", 1],
      ]),
    );
  });
});
