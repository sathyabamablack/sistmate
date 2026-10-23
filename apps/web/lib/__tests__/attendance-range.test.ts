import { describe, expect, it } from "vitest";
import type { HourlyDay } from "@usp/core";
import {
  PERIOD_CACHE_SECTIONS,
  campusToday,
  chunkRange,
  dailyViewFromDashboard,
  fitToWindow,
  formatRange,
  groupByMonth,
  hourTotals,
  hourlyViewFromDashboard,
  mergeHourly,
  monthsInRange,
  parseDailyPeriod,
  parseHourlyPeriod,
  periodRange,
  rangeDays,
  shiftMonth,
} from "../attendance-range";

const TODAY = "2026-10-12";
const SEMESTER = { from: "2026-07-15", to: "2026-12-31" };

const hour = (date: string, present: number, absent = 0, notGiven = 0): HourlyDay => ({
  date,
  totalHours: present + absent + notGiven,
  present,
  absent,
  notGiven,
});

describe("parsing the URL", () => {
  it("accepts known periods and falls back to the defaults", () => {
    expect(parseDailyPeriod("last-month")).toBe("last-month");
    expect(parseDailyPeriod(["past-3-months", "x"])).toBe("past-3-months");
    expect(parseDailyPeriod(undefined)).toBe("this-month");
    expect(parseDailyPeriod("last-7-days")).toBe("this-month"); // hour-wise only
    expect(parseDailyPeriod("<script>")).toBe("this-month");
    expect(parseHourlyPeriod("last-7-days")).toBe("last-7-days");
    expect(parseHourlyPeriod("this-semester")).toBe("this-semester");
    expect(parseHourlyPeriod("")).toBe("last-14-days");
  });
});

describe("periodRange", () => {
  it("gives each period's campus dates, never after today", () => {
    expect(periodRange("this-month", TODAY)).toMatchObject({ from: "2026-10-01", to: TODAY });
    expect(periodRange("last-month", TODAY)).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(periodRange("past-3-months", TODAY)).toMatchObject({ from: "2026-08-01", to: TODAY });
    expect(periodRange("last-7-days", TODAY)).toMatchObject({ from: "2026-10-06", to: TODAY });
    expect(periodRange("last-14-days", TODAY)).toMatchObject({ from: "2026-09-29", to: TODAY });
    expect(periodRange("last-30-days", TODAY)).toMatchObject({ from: "2026-09-13", to: TODAY });
  });

  it("crosses year ends and month lengths", () => {
    expect(periodRange("last-month", "2026-01-05")).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
    expect(periodRange("last-month", "2026-03-31")).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange("past-3-months", "2026-02-10")).toMatchObject({ from: "2025-12-01", to: "2026-02-10" });
    expect(periodRange("this-month", "2026-10-01")).toMatchObject({ from: "2026-10-01", to: "2026-10-01" });
  });

  it("uses the academic window for this semester, or the last 6 months and says so", () => {
    expect(periodRange("this-semester", TODAY, SEMESTER)).toEqual({
      from: "2026-07-15",
      to: TODAY,
      semesterUnknown: false,
    });
    expect(periodRange("this-semester", TODAY, null)).toEqual({
      from: "2026-05-01",
      to: TODAY,
      semesterUnknown: true,
    });
    // After the semester has ended it stops at its last day.
    expect(periodRange("this-semester", "2027-01-10", SEMESTER)).toMatchObject({ to: "2026-12-31" });
  });

  it("reads today in campus time", () => {
    // 20:00 UTC on the 12th is already the 13th in Chennai.
    expect(campusToday(new Date("2026-10-12T20:00:00Z"))).toBe("2026-10-13");
    expect(shiftMonth("2026-01-31", -1)).toBe("2025-12-01");
  });
});

describe("fitToWindow", () => {
  it("keeps, trims or empties a range against the academic window", () => {
    expect(fitToWindow({ from: "2026-09-01", to: "2026-09-30" }, SEMESTER)).toEqual({
      range: { from: "2026-09-01", to: "2026-09-30" },
      startsBefore: false,
    });
    expect(fitToWindow({ from: "2026-07-01", to: TODAY }, SEMESTER)).toEqual({
      range: { from: "2026-07-15", to: TODAY },
      startsBefore: true,
    });
    expect(fitToWindow({ from: "2026-06-01", to: "2026-06-30" }, SEMESTER)).toEqual({
      range: null,
      startsBefore: true,
    });
    expect(fitToWindow({ from: "2026-06-01", to: "2026-06-30" }, null).range).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
  });
});

describe("chunkRange", () => {
  it("splits long ranges into 31-day pieces, newest first", () => {
    expect(chunkRange({ from: "2026-09-29", to: TODAY })).toEqual({
      chunks: [{ from: "2026-09-29", to: TODAY }],
      trimmedFrom: null,
    });
    const three = chunkRange({ from: "2026-08-01", to: TODAY });
    expect(three.chunks).toEqual([
      { from: "2026-09-12", to: "2026-10-12" },
      { from: "2026-08-12", to: "2026-09-11" },
      { from: "2026-08-01", to: "2026-08-11" },
    ]);
    expect(three.trimmedFrom).toBeNull();
    for (const c of three.chunks) expect(rangeDays(c)).toBeLessThanOrEqual(31);
  });

  it("keeps the newest four pieces of a longer range", () => {
    const r = chunkRange({ from: "2026-05-01", to: TODAY });
    expect(r.chunks).toHaveLength(4);
    expect(r.trimmedFrom).toBe(r.chunks.at(-1)!.from);
    expect(rangeDays({ from: r.trimmedFrom!, to: TODAY })).toBe(124);
  });
});

describe("months and hour totals", () => {
  it("lists the months a range touches, newest first", () => {
    expect(monthsInRange({ from: "2026-07-15", to: TODAY })).toEqual(["2026-10", "2026-09", "2026-08", "2026-07"]);
    expect(monthsInRange({ from: "2025-12-20", to: "2026-01-03" })).toEqual(["2026-01", "2025-12"]);
    expect(monthsInRange({ from: TODAY, to: "2026-10-01" })).toEqual([]);
  });

  it("merges pieces by date and groups by month", () => {
    const merged = mergeHourly([[hour("2026-10-12", 4)], [hour("2026-09-30", 5), hour("2026-10-12", 6)]]);
    expect(merged.map((d) => d.date)).toEqual(["2026-09-30", "2026-10-12"]);
    expect(merged[1]!.present).toBe(6);
    expect(groupByMonth(merged).map((g) => g.month)).toEqual(["2026-10", "2026-09"]);
  });

  it("counts present out of entered hours", () => {
    expect(hourTotals([hour("2026-10-12", 5, 1, 2), hour("2026-10-09", 6)])).toEqual({
      present: 11,
      absent: 1,
      notGiven: 2,
      percentage: (11 / 12) * 100,
    });
    expect(hourTotals([hour("2026-10-12", 0, 0, 6)]).percentage).toBeNull();
  });

  it("formats ranges", () => {
    expect(formatRange({ from: "2026-08-01", to: TODAY })).toBe("1 Aug to 12 Oct 2026");
    expect(formatRange({ from: "2025-12-15", to: "2026-01-12" })).toBe("15 Dec 2025 to 12 Jan 2026");
    expect(formatRange({ from: TODAY, to: TODAY })).toBe("12 Oct 2026");
  });
});

describe("default views from the dashboard", () => {
  const daily = {
    days: [],
    summary: { present: 0, absent: 0, holidays: 0, percentage: null },
    window: { from: "2026-10-05", to: TODAY },
    academicWindow: { from: "2026-10-05", to: "2027-03-31" },
  };

  it("says when this month starts before the semester", () => {
    const view = dailyViewFromDashboard({ dailyAttendance: daily, issues: [] }, TODAY);
    expect(view).toMatchObject({ period: "this-month", windowStart: "2026-10-05", error: null });
  });

  it("carries a failed section's message but not a stale notice", () => {
    expect(
      dailyViewFromDashboard(
        { dailyAttendance: null, issues: [{ section: "daily-attendance", source: "erp", message: "Down." }] },
        TODAY,
      ).error,
    ).toBe("Down.");
    expect(
      hourlyViewFromDashboard(
        {
          hourlyAttendance: [],
          issues: [{ section: "hourly-attendance", source: "erp", message: "Showing data saved at 9:12 pm" }],
        },
        TODAY,
      ).error,
    ).toBeNull();
  });

  it("names a cache section for every non-default period", () => {
    expect(PERIOD_CACHE_SECTIONS).toContain("daily-attendance@last-month");
    expect(PERIOD_CACHE_SECTIONS).toContain("hourly-attendance@last-7-days");
    expect(PERIOD_CACHE_SECTIONS).not.toContain("daily-attendance@this-month");
    expect(PERIOD_CACHE_SECTIONS).not.toContain("hourly-attendance@last-14-days");
  });
});
