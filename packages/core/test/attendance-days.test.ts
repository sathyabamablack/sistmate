import { describe, expect, it } from "vitest";
import {
  DailyAttendanceSchema,
  addDays,
  buildDailyAttendance,
  campusNow,
  dailyPercentage,
  dateRange,
  isDateKey,
  monthEnd,
  monthStart,
  weekdayOf,
  type ErpDailyInput,
} from "../src/index";

// Monday 12 Oct 2026. 15:00 IST is 09:30 UTC.
const BEFORE_3PM = new Date("2026-10-12T09:29:00Z");
const AT_3PM = new Date("2026-10-12T09:30:00Z");

const MON_SAT = [1, 2, 3, 4, 5, 6];

function input(over: Partial<ErpDailyInput> = {}): ErpDailyInput {
  return {
    from: "2026-10-05",
    to: "2026-10-14",
    absentDates: [],
    holidays: [],
    timeSetDays: MON_SAT,
    workingDays: dateRange("2026-10-01", "2026-10-31"),
    ...over,
  };
}

const statusOf = (r: ReturnType<typeof buildDailyAttendance>, date: string) =>
  r.days.find((d) => d.date === date);

describe("date helpers", () => {
  it("reads the campus date and time, not the server's", () => {
    expect(campusNow(new Date("2026-10-11T20:00:00Z"))).toEqual({ date: "2026-10-12", minutes: 90 });
    expect(campusNow(AT_3PM)).toEqual({ date: "2026-10-12", minutes: 900 });
  });

  it("walks dates, weekdays and month edges", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(weekdayOf("2026-10-11")).toBe(0); // Sunday
    expect(weekdayOf("2026-10-12")).toBe(1);
    expect(monthStart("2026-10-12")).toBe("2026-10-01");
    expect(monthEnd("2026-02-10")).toBe("2026-02-28");
    expect(dateRange("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(dateRange("2026-10-02", "2026-10-01")).toEqual([]);
    expect(dateRange("nope", "2026-10-01")).toEqual([]);
    expect(isDateKey("2026-02-28")).toBe(true);
    expect(isDateKey("2026-02-31")).toBe(false);
  });
});

describe("buildDailyAttendance (the ERP's daily rule)", () => {
  it("marks a listed date absent", () => {
    const r = buildDailyAttendance(input({ absentDates: ["2026-10-07"] }), AT_3PM);
    expect(statusOf(r, "2026-10-07")).toEqual({ date: "2026-10-07", status: "absent" });
  });

  it("an absence wins over a holiday on the same date", () => {
    const r = buildDailyAttendance(
      input({ absentDates: ["2026-10-07"], holidays: [{ date: "2026-10-07", label: "Puja" }] }),
      AT_3PM,
    );
    expect(statusOf(r, "2026-10-07")?.status).toBe("absent");
  });

  it("treats a Sunday as a holiday when the timetable runs on Sundays", () => {
    const r = buildDailyAttendance(input({ timeSetDays: [0, ...MON_SAT] }), AT_3PM);
    expect(statusOf(r, "2026-10-11")).toEqual({ date: "2026-10-11", status: "holiday", label: "Sunday" });
  });

  it("leaves Sundays out when the timetable does not run on them", () => {
    const r = buildDailyAttendance(input(), AT_3PM);
    expect(statusOf(r, "2026-10-11")).toBeUndefined();
  });

  it("labels a listed holiday with the ERP's comment", () => {
    const r = buildDailyAttendance(
      input({ holidays: [{ date: "2026-10-09", label: "Ayudha Puja" }, { date: "2026-10-10", label: "" }] }),
      AT_3PM,
    );
    expect(statusOf(r, "2026-10-09")).toEqual({ date: "2026-10-09", status: "holiday", label: "Ayudha Puja" });
    expect(statusOf(r, "2026-10-10")?.label).toBe("Holiday");
  });

  it("today is not marked yet before 3 pm campus time", () => {
    const r = buildDailyAttendance(input(), BEFORE_3PM);
    expect(statusOf(r, "2026-10-12")).toEqual({ date: "2026-10-12", status: "pending", label: "Not marked yet" });
  });

  it("today counts as present from 3 pm campus time", () => {
    const r = buildDailyAttendance(input(), AT_3PM);
    expect(statusOf(r, "2026-10-12")?.status).toBe("present");
  });

  it("today is absent at any time when the ERP lists it", () => {
    const r = buildDailyAttendance(input({ absentDates: ["2026-10-12"] }), BEFORE_3PM);
    expect(statusOf(r, "2026-10-12")?.status).toBe("absent");
  });

  it("future dates are upcoming", () => {
    const r = buildDailyAttendance(input(), AT_3PM);
    expect(statusOf(r, "2026-10-13")?.status).toBe("upcoming");
    expect(statusOf(r, "2026-10-14")?.status).toBe("upcoming");
  });

  it("past working days with no absence are present", () => {
    const r = buildDailyAttendance(input(), AT_3PM);
    expect(statusOf(r, "2026-10-05")?.status).toBe("present");
    expect(statusOf(r, "2026-10-10")?.status).toBe("present");
  });

  it("skips dates that are not actual working days, even when listed absent", () => {
    const working = dateRange("2026-10-01", "2026-10-31").filter((d) => d !== "2026-10-08");
    const r = buildDailyAttendance(input({ workingDays: working, absentDates: ["2026-10-08"] }), AT_3PM);
    expect(statusOf(r, "2026-10-08")).toBeUndefined();
  });

  it("skips weekdays the timetable does not run on", () => {
    const r = buildDailyAttendance(input({ timeSetDays: [1, 2, 3, 4, 5] }), AT_3PM);
    expect(statusOf(r, "2026-10-10")).toBeUndefined(); // Saturday
    expect(statusOf(r, "2026-10-09")?.status).toBe("present");
  });

  it("counts every date when the ERP sends no working-day or timetable-day list", () => {
    const r = buildDailyAttendance(input({ timeSetDays: null, workingDays: null }), AT_3PM);
    expect(r.days).toHaveLength(10);
    expect(statusOf(r, "2026-10-11")?.label).toBe("Sunday");
  });

  it("summarises present, absent and holidays; the percentage ignores holidays and future days", () => {
    const r = buildDailyAttendance(
      input({
        absentDates: ["2026-10-06"],
        holidays: [{ date: "2026-10-09", label: "Ayudha Puja" }],
      }),
      AT_3PM,
    );
    // 5,7,8,10,12 present; 6 absent; 9 holiday; 13,14 upcoming
    expect(r.summary).toEqual({ present: 5, absent: 1, holidays: 1, percentage: 83.33 });
    expect(r.window).toEqual({ from: "2026-10-05", to: "2026-10-14" });
    expect(r.days.map((d) => d.date)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
    ]);
    expect(DailyAttendanceSchema.safeParse(r).success).toBe(true);
  });

  it("has no percentage before any day is decided", () => {
    expect(dailyPercentage(0, 0)).toBeNull();
    const r = buildDailyAttendance(input({ from: "2026-10-13", to: "2026-10-14" }), AT_3PM);
    expect(r.summary.percentage).toBeNull();
  });
});
