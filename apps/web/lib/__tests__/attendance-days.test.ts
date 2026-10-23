import { describe, expect, it } from "vitest";
import type { DailyAttendance, HourlyDay, TimetableSlot } from "@usp/core";
import {
  HOURLY_NOT_POSTED,
  HOURLY_POSTS_AFTER,
  formatDay,
  formatLongDay,
  formatMonth,
  hourChips,
  hourlySummaryText,
  monthGrid,
  newestFirst,
  notableDays,
  periodStarts,
  subjectForHour,
  todayChipText,
  todayDailyVerdict,
  todayHourlyVerdict,
  todayVerdicts,
} from "../attendance-days";
import { staleIssueMessage } from "../issues";

const TODAY = "2026-10-12"; // Monday

const daily = (over: Partial<DailyAttendance> = {}): DailyAttendance => ({
  days: [
    { date: "2026-10-02", status: "holiday", label: "Gandhi Jayanti" },
    { date: "2026-10-05", status: "present" },
    { date: "2026-10-06", status: "absent" },
    { date: "2026-10-12", status: "present" },
  ],
  summary: { present: 2, absent: 1, holidays: 1, percentage: 66.67 },
  window: { from: "2026-10-01", to: "2026-10-12" },
  ...over,
});

const withToday = (status: DailyAttendance["days"][number]["status"], label?: string) =>
  daily({ days: [{ date: TODAY, status, ...(label ? { label } : {}) }] });

const slot = (day: number, startTime: string, courseTitle: string): TimetableSlot => ({
  day,
  startTime,
  endTime: "00:00",
  courseCode: courseTitle.slice(0, 4).toUpperCase(),
  courseTitle,
});

// Monday has a free second hour; Tuesday uses it.
const TIMETABLE: TimetableSlot[] = [
  slot(0, "09:00", "Networks"),
  slot(0, "11:00", "Databases"),
  slot(1, "09:00", "Algorithms"),
  slot(1, "09:50", "Maths"),
  slot(1, "11:00", "Networks"),
];

const hourly = (over: Partial<HourlyDay> = {}): HourlyDay => ({
  date: TODAY,
  totalHours: 6,
  present: 4,
  absent: 1,
  notGiven: 1,
  ...over,
});

describe("todayDailyVerdict", () => {
  it("reads present, absent, holiday and not-marked-yet from the ERP's day", () => {
    expect(todayDailyVerdict(withToday("present"), TODAY)).toMatchObject({ kind: "present", tone: "success", title: "Present" });
    expect(todayDailyVerdict(withToday("absent"), TODAY)).toMatchObject({ kind: "absent", tone: "danger", title: "Absent" });
    expect(todayDailyVerdict(withToday("holiday", "Diwali"), TODAY)).toMatchObject({
      kind: "holiday",
      title: "Holiday",
      detail: "Diwali",
    });
    expect(todayDailyVerdict(withToday("pending", "Not marked yet"), TODAY)).toMatchObject({
      kind: "pending",
      tone: "muted",
      title: "Not marked yet",
    });
  });

  it("explains a missing day, an old copy and a failed load", () => {
    expect(todayDailyVerdict(daily({ days: [] }), TODAY).kind).toBe("no-day");
    expect(todayDailyVerdict(daily({ days: [], window: { from: "2026-10-01", to: "2026-10-11" } }), TODAY).kind).toBe(
      "outdated",
    );
    expect(todayDailyVerdict(null, TODAY)).toMatchObject({ kind: "unavailable", tone: "warning" });
  });
});

describe("hour-wise text and chips", () => {
  it("says how many hours were present, absent and not entered", () => {
    expect(hourlySummaryText(hourly())).toBe("4 of 6 hours present, 1 absent, 1 not entered yet");
    expect(hourlySummaryText(hourly({ totalHours: 1, present: 1, absent: 0, notGiven: 0 }))).toBe(
      "1 of 1 hour present",
    );
  });

  it("maps hour numbers to the week's period grid, so a free hour does not shift subjects", () => {
    expect(periodStarts(TIMETABLE)).toEqual(["09:00", "09:50", "11:00"]);
    expect(subjectForHour(TIMETABLE, TODAY, 1)).toBe("Networks");
    expect(subjectForHour(TIMETABLE, TODAY, 2)).toBeUndefined();
    expect(subjectForHour(TIMETABLE, TODAY, 3)).toBe("Databases");
    expect(subjectForHour(TIMETABLE, "2026-10-13", 2)).toBe("Maths");
    expect(subjectForHour(TIMETABLE, "2026-10-11", 1)).toBeUndefined(); // Sunday
  });

  it("builds chips only when the ERP names the hours", () => {
    expect(hourChips(hourly(), TIMETABLE)).toEqual([]);
    const chips = hourChips(
      hourly({ totalHours: 3, present: 1, absent: 1, notGiven: 1, presentHours: [1], absentHours: [3], notGivenHours: [2] }),
      TIMETABLE,
    );
    expect(chips).toEqual([
      { hour: 1, status: "present", subject: "Networks" },
      { hour: 2, status: "not-given", subject: undefined },
      { hour: 3, status: "absent", subject: "Databases" },
    ]);
  });

  it("sorts days newest first", () => {
    expect(newestFirst([hourly({ date: "2026-10-09" }), hourly(), hourly({ date: "2026-10-10" })]).map((d) => d.date)).toEqual([
      "2026-10-12",
      "2026-10-10",
      "2026-10-09",
    ]);
  });
});

describe("todayHourlyVerdict", () => {
  it("summarises today's row", () => {
    const v = todayHourlyVerdict([hourly()], TODAY, TIMETABLE, false);
    expect(v).toMatchObject({ kind: "posted", tone: "danger", title: "4 of 6 hours present, 1 absent, 1 not entered yet" });
  });

  it("is green only when every hour is present", () => {
    const v = todayHourlyVerdict([hourly({ present: 6, absent: 0, notGiven: 0 })], TODAY, TIMETABLE, false);
    expect(v.tone).toBe("success");
  });

  it("says not posted yet when the ERP has nothing, or nothing entered, for today", () => {
    for (const rows of [[], [hourly({ present: 0, absent: 0, notGiven: 6 })]]) {
      const v = todayHourlyVerdict(rows, TODAY, TIMETABLE, false);
      expect(v).toMatchObject({ kind: "not-posted", title: HOURLY_NOT_POSTED, detail: HOURLY_POSTS_AFTER });
    }
  });

  it("says no classes on a day with nothing on the timetable", () => {
    expect(todayHourlyVerdict([], "2026-10-11", TIMETABLE, false).kind).toBe("no-classes");
  });

  it("reports a failed load, but still shows a saved row", () => {
    expect(todayHourlyVerdict([], TODAY, TIMETABLE, true).kind).toBe("unavailable");
    expect(todayHourlyVerdict([hourly()], TODAY, TIMETABLE, true).kind).toBe("posted");
  });
});

describe("todayVerdicts and the dashboard line", () => {
  const now = new Date("2026-10-12T10:30:00Z"); // 4 pm IST

  it("combines both verdicts: present (daily), hours so far", () => {
    const { daily: d, hourly: h, today } = todayVerdicts(
      {
        dailyAttendance: withToday("present"),
        hourlyAttendance: [hourly()],
        timetable: TIMETABLE,
        issues: [],
      },
      now,
    );
    expect(today).toBe(TODAY);
    expect(todayChipText(d, h)).toEqual({ text: "Today: present (daily), 4 of 6 hours so far", tone: "danger" });
  });

  it("reads all-present days as success and says when hours are not posted", () => {
    const present = todayDailyVerdict(withToday("present"), TODAY);
    const full = todayHourlyVerdict([hourly({ present: 6, absent: 0, notGiven: 0 })], TODAY, TIMETABLE, false);
    expect(todayChipText(present, full)).toEqual({ text: "Today: present (daily), 6 of 6 hours", tone: "success" });

    const pending = todayDailyVerdict(withToday("pending", "Not marked yet"), TODAY);
    const none = todayHourlyVerdict([], TODAY, TIMETABLE, false);
    expect(todayChipText(pending, none)).toEqual({
      text: "Today: not marked yet (daily), hours not posted yet",
      tone: "muted",
    });
  });

  it("does not wait for hours on a holiday", () => {
    const { hourly: h } = todayVerdicts(
      { dailyAttendance: withToday("holiday", "Diwali"), hourlyAttendance: [], timetable: TIMETABLE, issues: [] },
      now,
    );
    expect(h).toMatchObject({ kind: "no-classes", detail: "Today is a holiday." });
  });

  it("treats only a real failure, not a stale copy, as a failed hour-wise load", () => {
    const base = { dailyAttendance: null, hourlyAttendance: [], timetable: TIMETABLE };
    const failed = todayVerdicts(
      { ...base, issues: [{ section: "hourly-attendance", source: "erp", message: "ERP down" }] },
      now,
    );
    expect(failed.hourly.kind).toBe("unavailable");
    expect(todayChipText(failed.daily, failed.hourly)).toEqual({
      text: "Today: not loaded (daily), hours not loaded",
      tone: "warning",
    });
    const stale = todayVerdicts(
      { ...base, issues: [{ section: "hourly-attendance", source: "erp", message: staleIssueMessage(now) }] },
      now,
    );
    expect(stale.hourly.kind).toBe("not-posted");
  });
});

describe("monthGrid", () => {
  it("lays the month out Monday first, with statuses, gaps and days still to come", () => {
    const grid = monthGrid(daily(), TODAY);
    expect(grid.month).toBe("2026-10");
    expect(grid.weeks).toHaveLength(5);
    for (const week of grid.weeks) expect(week).toHaveLength(7);
    // 1 October 2026 is a Thursday: three empty cells first.
    expect(grid.weeks[0]!.slice(0, 3)).toEqual([null, null, null]);
    const cells = grid.weeks.flat().filter((c) => c !== null);
    expect(cells).toHaveLength(31);
    const at = (date: string) => cells.find((c) => c.date === date)!;
    expect(at("2026-10-02")).toMatchObject({ status: "holiday", label: "Gandhi Jayanti" });
    expect(at("2026-10-06").status).toBe("absent");
    expect(at("2026-10-11").status).toBe("none"); // Sunday inside the window
    expect(at("2026-10-12")).toMatchObject({ status: "present", isToday: true });
    expect(at("2026-10-20").status).toBe("later");
  });

  it("lists absences and holidays", () => {
    expect(notableDays(daily()).map((d) => d.date)).toEqual(["2026-10-02", "2026-10-06"]);
  });
});

describe("date labels", () => {
  it("formats campus dates without shifting them", () => {
    expect(formatMonth("2026-10")).toBe("October 2026");
    expect(formatDay("2026-10-12")).toBe("Mon, 12 Oct");
    expect(formatLongDay("2026-10-12")).toBe("Monday, 12 October");
  });
});
