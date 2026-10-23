import { describe, expect, it } from "vitest";
import type { Assignment, CalendarEvent } from "@usp/core";
import { campusClock, daysUntil, formatDate, relativeTime } from "../utils";
import { mockDayOffset, shiftDates, withCurrentDates } from "../mock-clock";
import { isDuplicateDeadline, normalizeTitle } from "../timeline";

describe("campus clock (Asia/Kolkata, independent of server TZ)", () => {
  it("is already Sunday on campus while UTC is still Saturday evening", () => {
    // 2026-10-10 20:00 UTC = 2026-10-11 01:30 IST (a Sunday)
    const c = campusClock(new Date("2026-10-10T20:00:00Z"));
    expect(c.dayIndex).toBe(6);
    expect(c.hour).toBe(1);
    expect(c.minutes).toBe(90);
  });

  it("counts calendar days on campus, not in UTC", () => {
    const now = new Date("2026-10-10T20:00:00Z"); // Sun 01:30 IST
    expect(daysUntil("2026-10-11T23:59:00+05:30", now)).toBe(0);
    expect(daysUntil("2026-10-12T00:10:00+05:30", now)).toBe(1);
    expect(daysUntil("2026-10-10T23:00:00+05:30", now)).toBe(-1);
  });

  it("formats dates in campus time", () => {
    // 20:00 UTC on the 10th is already the 11th in India
    expect(formatDate("2026-10-10T20:00:00Z")).toContain("11");
  });

  it("never renders past items as future with pastOnly", () => {
    const now = new Date("2026-10-11T08:00:00Z");
    expect(relativeTime("2026-10-11T13:00:00Z", now)).toBe("in 5 hours");
    expect(relativeTime("2026-10-11T13:00:00Z", now, { pastOnly: true })).toBe("just now");
  });
});

describe("mock clock", () => {
  it("offsets from the 2026-10-11 anchor in campus days", () => {
    expect(mockDayOffset(new Date("2026-10-11T12:00:00+05:30"))).toBe(0);
    expect(mockDayOffset(new Date("2026-10-20T12:00:00+05:30"))).toBe(9);
  });

  it("shifts only date fields, keeping date-only values date-only", () => {
    const out = shiftDates(
      { date: "2026-10-11T10:00:00+05:30", paidDate: "2026-07-18", title: "2026-10-11", nested: [{ dueDate: "2026-10-15T23:59:00+05:30" }] },
      3,
    );
    expect(out.date).toBe("2026-10-14T04:30:00.000Z");
    expect(out.paidDate).toBe("2026-07-21");
    expect(out.title).toBe("2026-10-11"); // not a date field
    expect(out.nested[0]?.dueDate).toBe("2026-10-18T18:29:00.000Z");
  });

  it("wraps getters but leaves authenticate untouched", async () => {
    const adapter = {
      authenticate: async () => ({ ok: true, date: "2026-10-11" }),
      getThings: async () => [{ date: "2026-10-11" }],
    };
    const wrapped = withCurrentDates(adapter, 1);
    expect(await wrapped.getThings()).toEqual([{ date: "2026-10-12" }]);
    expect(await wrapped.authenticate()).toEqual({ ok: true, date: "2026-10-11" });
  });

  it("leaves day-wise and hour-wise attendance alone: they are built for the real dates asked", async () => {
    const adapter = {
      getDailyAttendance: async () => ({ days: [{ date: "2026-10-12", status: "present" }] }),
      getHourlyAttendance: async () => [{ date: "2026-10-12" }],
    };
    const wrapped = withCurrentDates(adapter, 3);
    expect(await wrapped.getDailyAttendance()).toEqual({ days: [{ date: "2026-10-12", status: "present" }] });
    expect(await wrapped.getHourlyAttendance()).toEqual([{ date: "2026-10-12" }]);
  });
});

describe("deadline de-duplication", () => {
  const assignment: Assignment = {
    id: 5001,
    courseId: 101,
    courseName: "DAA",
    name: "Lab 4: Dynamic Programming — Matrix Chain & LCS",
    dueDate: "2026-10-15T23:59:00+05:30",
    submitted: false,
    grade: null,
  };
  const event = (over: Partial<CalendarEvent>): CalendarEvent => ({
    id: "lms-event-1",
    title: "Due: Lab 4 — Dynamic Programming",
    date: "2026-10-15T23:59:00+05:30",
    source: "lms",
    type: "assignment",
    ...over,
  });

  it("normalizes Moodle's due-date titles", () => {
    expect(normalizeTitle("Due: Lab 4 — Dynamic Programming")).toBe("lab 4 dynamic programming");
    expect(normalizeTitle("Quiz 2 is due")).toBe("quiz 2");
  });

  it("drops the calendar copy of an assignment deadline", () => {
    expect(isDuplicateDeadline(event({}), [assignment])).toBe(true);
  });

  it("keeps a same-named event on a different day", () => {
    expect(isDuplicateDeadline(event({ date: "2026-10-20T10:00:00+05:30" }), [assignment])).toBe(false);
  });

  it("matches by link even when titles differ", () => {
    const url = "https://lms.example.edu/mod/assign/view.php?id=5001";
    expect(
      isDuplicateDeadline(event({ title: "Something else", url }), [{ ...assignment, url }]),
    ).toBe(true);
  });

  it("never drops exams or other event types", () => {
    expect(isDuplicateDeadline(event({ type: "exam" }), [assignment])).toBe(false);
  });
});
