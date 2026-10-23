import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DailyAttendanceSchema, HourlyDaySchema } from "@usp/core";
import {
  clampRange,
  createLiveErpAdapter,
  createMockErpAdapter,
  parseDailyReply,
  parseErpDate,
  parseHourlyRow,
  parseHourlyRows,
} from "../src/index";

const fixture = (name: string) =>
  JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8")) as {
    responseData: unknown;
  };

const DAILY = fixture("StudentDailyAttendance__StudentWiseAttendance");
const HOURLY_COUNTS = fixture("StudentAttendanceHourly__generateStudentwiseReport.counts");
const HOURLY_LISTS = fixture("StudentAttendanceHourly__generateStudentwiseReport.lists");

// Monday 12 Oct 2026, 4 pm IST (after the 3 pm cut-off) and 11 am IST.
const AFTERNOON = new Date("2026-10-12T10:30:00Z");
const MORNING = new Date("2026-10-12T05:30:00Z");

afterEach(() => vi.restoreAllMocks());

describe("parseErpDate", () => {
  it("reads the ERP's date formats as campus dates", () => {
    expect(parseErpDate("06/10/2026")).toBe("2026-10-06");
    expect(parseErpDate("6-10-2026")).toBe("2026-10-06");
    expect(parseErpDate("2026-10-06")).toBe("2026-10-06");
    expect(parseErpDate("2026-10-06T00:00:00")).toBe("2026-10-06");
    expect(parseErpDate("2026-10-06 00:00:00")).toBe("2026-10-06");
    // Midnight IST sent as UTC is still the 7th on campus.
    expect(parseErpDate("2026-10-06T18:30:00.000Z")).toBe("2026-10-07");
  });

  it("rejects anything else", () => {
    for (const v of ["", "not a date", "31/02/2026", "2026/10/06", 20261006, null, undefined]) {
      expect(parseErpDate(v)).toBeNull();
    }
  });
});

describe("parseDailyReply", () => {
  it("reads absences, holidays, timetable days, working days and the academic window", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const reply = parseDailyReply(DAILY.responseData);
    expect(reply.absentDates).toEqual(["2026-10-06", "2026-10-08"]);
    expect(reply.holidays).toEqual([
      { date: "2026-10-02", label: "Gandhi Jayanti" },
      { date: "2026-10-10", label: "Second Saturday" },
    ]);
    expect(reply.timeSetDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(reply.workingDays).toHaveLength(10);
    expect(reply.workingDays).not.toContain("2026-10-11");
    expect(reply.academicWindow).toEqual({ from: "2026-07-01", to: "2026-11-30" });
  });

  it("warns in development about unreadable dates without printing them", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    parseDailyReply(DAILY.responseData);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).not.toContain("not a date");
  });

  it("refuses a reply with no working days rather than marking every day present", () => {
    expect(() => parseDailyReply(null)).toThrow(/no day-wise attendance/);
    expect(() => parseDailyReply({ AttendanceDetails: [] })).toThrow(/no working days/);
  });

  it("accepts a timetable-details array and missing optional lists", () => {
    const reply = parseDailyReply({
      ActualWorkingDays: ["2026-10-05"],
      TimetableDetails: [{ TimeSetDays: "1,2,3,4,5" }],
    });
    expect(reply).toEqual({
      absentDates: [],
      holidays: [],
      timeSetDays: [1, 2, 3, 4, 5],
      workingDays: ["2026-10-05"],
      academicWindow: null,
    });
  });
});

describe("clampRange", () => {
  const win = { from: "2026-07-01", to: "2026-11-30" };
  it("keeps a range inside the window", () => {
    expect(clampRange({ from: "2026-10-01", to: "2026-10-12" }, win)).toEqual({ from: "2026-10-01", to: "2026-10-12" });
  });
  it("trims the part outside the window", () => {
    expect(clampRange({ from: "2026-06-25", to: "2026-07-03" }, win)).toEqual({ from: "2026-07-01", to: "2026-07-03" });
    expect(clampRange({ from: "2026-11-20", to: "2026-12-05" }, win)).toEqual({ from: "2026-11-20", to: "2026-11-30" });
  });
  it("falls back to the window's nearest month when there is no overlap", () => {
    expect(clampRange({ from: "2026-12-01", to: "2026-12-12" }, win)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(clampRange({ from: "2026-06-01", to: "2026-06-12" }, win)).toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });
});

describe("parseHourlyRows", () => {
  it("reads counts as numbers or numeric strings and drops unreadable rows", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const days = parseHourlyRows(HOURLY_COUNTS.responseData);
    expect(days).toEqual([
      { date: "2026-10-09", totalHours: 6, present: 0, absent: 6, notGiven: 0 },
      { date: "2026-10-10", totalHours: 3, present: 3, absent: 0, notGiven: 0 },
      { date: "2026-10-12", totalHours: 6, present: 4, absent: 1, notGiven: 1 },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toMatch(/skipped 2 row/);
    for (const d of days) expect(HourlyDaySchema.safeParse(d).success).toBe(true);
  });

  it("reads hour lists, ISO dates and fills in hours the row does not name", () => {
    const days = parseHourlyRows(HOURLY_LISTS.responseData);
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
    expect(byDate["2026-10-12"]).toEqual({
      date: "2026-10-12",
      totalHours: 6,
      present: 4,
      absent: 1,
      notGiven: 1,
      presentHours: [1, 2, 3, 4],
      absentHours: [5],
      notGivenHours: [6],
    });
    expect(byDate["2026-10-09"]).toMatchObject({ totalHours: 7, present: 7, absent: 0, notGiven: 0 });
    // "2026-10-07T18:30:00.000Z" is the 8th on campus; hour 6 is not named, so not entered.
    expect(byDate["2026-10-08"]).toMatchObject({
      totalHours: 6,
      present: 4,
      absent: 1,
      notGiven: 1,
      presentHours: [1, 3, 4, 5],
      absentHours: [2],
      notGivenHours: [6],
    });
    for (const d of days) expect(HourlyDaySchema.safeParse(d).success).toBe(true);
  });

  it("reads lone numbers as counts unless only the hour-list reading adds up", () => {
    const byDate = Object.fromEntries(parseHourlyRows(HOURLY_LISTS.responseData).map((d) => [d.date, d]));
    // 2 + 1 + 3 = 6 hours: counts.
    expect(byDate["2026-10-06"]).toEqual({ date: "2026-10-06", totalHours: 6, present: 2, absent: 1, notGiven: 3 });
    // 1 + 2 + 3 is not 3, but hours 1, 2 and 3 are: lists.
    expect(byDate["2026-10-05"]).toMatchObject({ totalHours: 3, present: 1, absent: 1, notGiven: 1, absentHours: [2] });
  });

  it("derives the total and the hours not entered when they are missing", () => {
    expect(parseHourlyRow({ AttendanceDate: "12/10/2026", Present: 3, Absent: 1 })).toEqual({
      date: "2026-10-12",
      totalHours: 4,
      present: 3,
      absent: 1,
      notGiven: 0,
    });
    expect(parseHourlyRow({ AttendanceDate: "12/10/2026", TotalHours: 6, Present: 3, Absent: 1 })).toMatchObject({
      totalHours: 6,
      notGiven: 2,
    });
    expect(parseHourlyRow({ attendancedate: "12/10/2026", present: [1, 2], absent: [] })).toMatchObject({
      totalHours: 2,
      presentHours: [1, 2],
    });
  });

  it("ignores unknown fields, keeps one row per date and filters to the range", () => {
    const rows = [
      { AttendanceDate: "11/10/2026", totalHours: 6, Present: 6, Absent: 0, AttNotGiven: 0, Extra: { x: 1 } },
      { AttendanceDate: "12/10/2026", totalHours: 6, Present: 1, Absent: 0, AttNotGiven: 5 },
      { AttendanceDate: "12/10/2026", totalHours: 6, Present: 2, Absent: 0, AttNotGiven: 4 },
      { AttendanceDate: "01/09/2026", totalHours: 6, Present: 6, Absent: 0, AttNotGiven: 0 },
    ];
    const days = parseHourlyRows(rows, { from: "2026-10-01", to: "2026-10-12" });
    expect(days.map((d) => [d.date, d.present])).toEqual([
      ["2026-10-11", 6],
      ["2026-10-12", 2],
    ]);
    expect(parseHourlyRows(null)).toEqual([]);
  });

  it("drops rows with negative, fractional or wordy values", () => {
    expect(parseHourlyRow({ AttendanceDate: "12/10/2026", Present: -1 })).toBeNull();
    expect(parseHourlyRow({ AttendanceDate: "12/10/2026", Present: 1.5 })).toBeNull();
    expect(parseHourlyRow({ AttendanceDate: "12/10/2026", Present: "all" })).toBeNull();
    expect(parseHourlyRow({ AttendanceDate: "12/10/2026" })).toBeNull();
  });
});

/* ------------------------- live adapter wiring ------------------------- */

const SESSION = JSON.stringify({ token: "jwt", regNo: "41110234", studentId: "9001" });

function fakeErp(handler: (path: string, body: Record<string, unknown>) => unknown) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).split("/api/v1.0/")[1] ?? "";
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ path, body });
    return new Response(JSON.stringify(handler(path, body)), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("live adapter: day-wise and hour-wise attendance", () => {
  it("asks StudentWiseAttendance once when the range is inside the academic month", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { calls, fetchImpl } = fakeErp(() => DAILY);
    const erp = createLiveErpAdapter({ baseUrl: "https://erp.example.edu", session: SESSION, fetch: fetchImpl, now: () => AFTERNOON });
    const daily = await erp.getDailyAttendance!("2026-10-01", "2026-10-12");

    expect(calls).toEqual([
      {
        path: "StudentDailyAttendance/StudentWiseAttendance",
        body: { FromDate: "2026-10-01", ToDate: "2026-10-12", StudentId: "9001" },
      },
    ]);
    expect(DailyAttendanceSchema.safeParse(daily).success).toBe(true);
    const status = Object.fromEntries(daily.days.map((d) => [d.date, d.status]));
    expect(status["2026-10-02"]).toBe("holiday");
    expect(status["2026-10-06"]).toBe("absent");
    expect(status["2026-10-08"]).toBe("absent");
    expect(status["2026-10-11"]).toBeUndefined(); // Sunday, not a timetable day
    expect(status["2026-10-12"]).toBe("present");
    // 1,3,5,7,9,12 present; 6,8 absent; 2,10 holidays
    expect(daily.summary).toEqual({ present: 6, absent: 2, holidays: 2, percentage: 75 });
    expect(daily.window).toEqual({ from: "2026-10-01", to: "2026-10-12" });
    // The semester window the reply names, so "This semester" can start at its first day.
    expect(daily.academicWindow).toEqual({ from: "2026-07-01", to: "2026-11-30" });
  });

  it("says today is not marked yet before 3 pm", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { fetchImpl } = fakeErp(() => DAILY);
    const erp = createLiveErpAdapter({ baseUrl: "https://erp.example.edu", session: SESSION, fetch: fetchImpl, now: () => MORNING });
    const daily = await erp.getDailyAttendance!("2026-10-01", "2026-10-12");
    expect(daily.days.at(-1)).toEqual({ date: "2026-10-12", status: "pending", label: "Not marked yet" });
  });

  it("narrows the range to the academic month and asks again, at most twice", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const narrow = structuredClone(DAILY) as { responseData: { TimetableDetails: Record<string, unknown> } };
    narrow.responseData.TimetableDetails.AcademicMonthStartDate = "05/10/2026";
    narrow.responseData.TimetableDetails.AcademicMonthEndDate = "09/10/2026";
    const { calls, fetchImpl } = fakeErp(() => narrow);
    const erp = createLiveErpAdapter({ baseUrl: "https://erp.example.edu", session: SESSION, fetch: fetchImpl, now: () => AFTERNOON });
    const daily = await erp.getDailyAttendance!("2026-10-01", "2026-10-12");

    expect(calls.map((c) => [c.body.FromDate, c.body.ToDate])).toEqual([
      ["2026-10-01", "2026-10-12"],
      ["2026-10-05", "2026-10-09"],
    ]);
    expect(daily.window).toEqual({ from: "2026-10-05", to: "2026-10-09" });
    expect(daily.days.map((d) => d.date)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
  });

  it("fails loudly on an empty daily reply instead of showing every day present", async () => {
    const { fetchImpl } = fakeErp(() => ({ status: false, message: "No Records Found" }));
    const erp = createLiveErpAdapter({ baseUrl: "https://erp.example.edu", session: SESSION, fetch: fetchImpl, now: () => AFTERNOON });
    await expect(erp.getDailyAttendance!("2026-10-01", "2026-10-12")).rejects.toThrow(/no day-wise attendance/);
  });

  it("asks generateStudentwiseReport for the range and parses the rows", async () => {
    const { calls, fetchImpl } = fakeErp(() => HOURLY_LISTS);
    const erp = createLiveErpAdapter({ baseUrl: "https://erp.example.edu", session: SESSION, fetch: fetchImpl });
    const days = await erp.getHourlyAttendance!("2026-09-29", "2026-10-12");
    expect(calls).toEqual([
      {
        path: "StudentAttendanceHourly/generateStudentwiseReport",
        body: { Date: "2026-09-29", DateTo: "2026-10-12", StudentId: "9001" },
      },
    ]);
    expect(days.map((d) => d.date)).toEqual(["2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09", "2026-10-12"]);
  });

  it("returns no hour-wise days when the ERP has no records", async () => {
    const { fetchImpl } = fakeErp(() => ({ status: false, message: "No Records Found", responseData: [] }));
    const erp = createLiveErpAdapter({ baseUrl: "https://erp.example.edu", session: SESSION, fetch: fetchImpl });
    expect(await erp.getHourlyAttendance!("2026-09-29", "2026-10-12")).toEqual([]);
  });
});

/* ------------------------------ mock data ------------------------------ */

describe("mock adapter: day-wise and hour-wise attendance", () => {
  const mock = (now: Date) => createMockErpAdapter({ now: () => now });

  it("has absences and holidays in the month, and a valid shape", async () => {
    const daily = await mock(AFTERNOON).getDailyAttendance!("2026-10-01", "2026-10-12");
    expect(DailyAttendanceSchema.safeParse(daily).success).toBe(true);
    const status = Object.fromEntries(daily.days.map((d) => [d.date, d]));
    expect(status["2026-10-02"]).toMatchObject({ status: "holiday", label: "Gandhi Jayanti" });
    expect(status["2026-10-10"]).toMatchObject({ status: "holiday", label: "Second Saturday" });
    expect(status["2026-10-06"]?.status).toBe("absent");
    expect(status["2026-10-11"]).toBeUndefined(); // Sunday
    expect(status["2026-10-12"]?.status).toBe("present");
    expect(daily.summary.absent).toBeGreaterThanOrEqual(1);
    expect(daily.summary.holidays).toBeGreaterThanOrEqual(1);
  });

  it("follows the 3 pm rule for today", async () => {
    const daily = await mock(MORNING).getDailyAttendance!("2026-10-01", "2026-10-12");
    expect(daily.days.at(-1)?.status).toBe("pending");
  });

  it("matches the mock timetable hour for hour, with today's later hours not entered yet", async () => {
    const days = await mock(MORNING).getHourlyAttendance!("2026-09-29", "2026-10-12");
    for (const d of days) expect(HourlyDaySchema.safeParse(d).success).toBe(true);
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
    // No Sundays, holidays or future dates.
    expect(byDate["2026-10-11"]).toBeUndefined();
    expect(byDate["2026-10-02"]).toBeUndefined();
    expect(byDate["2026-10-10"]).toBeUndefined();
    // Saturday 3 Oct is a half day: three hours.
    expect(byDate["2026-10-03"]?.totalHours).toBe(3);
    // The absent day is absent for every hour; another day misses hour 2.
    expect(byDate["2026-10-06"]).toMatchObject({ totalHours: 7, present: 0, absent: 7 });
    expect(byDate["2026-10-01"]).toMatchObject({ present: 6, absent: 0, notGiven: 0 });
    // Today (Monday, 11 am): hour 1 ended and is entered, hour 2 just ended, the rest are to come.
    expect(byDate["2026-10-12"]).toMatchObject({
      totalHours: 6,
      present: 1,
      absent: 0,
      notGiven: 5,
      presentHours: [1],
      notGivenHours: [2, 3, 4, 5, 6],
    });
  });

  it("answers any range like the live ERP: narrowed to a semester window it names", async () => {
    const erp = mock(AFTERNOON);
    const semester = await erp.getDailyAttendance!("2026-05-01", "2026-10-12");
    expect(semester.academicWindow).toEqual({ from: "2026-07-15", to: "2026-12-31" });
    expect(semester.window).toEqual({ from: "2026-07-15", to: "2026-10-12" });
    expect(DailyAttendanceSchema.safeParse(semester).success).toBe(true);
    const lastMonth = await erp.getDailyAttendance!("2026-09-01", "2026-09-30");
    expect(lastMonth.window).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(lastMonth.days.every((d) => d.status !== "upcoming" && d.status !== "pending")).toBe(true);
    // The same dates read the same in a longer range.
    const inSemester = semester.days.filter((d) => d.date.startsWith("2026-09"));
    expect(inSemester).toEqual(lastMonth.days);
  });

  it("misses one hour on the first class day after the 14th", async () => {
    const days = await mock(new Date("2026-10-20T12:00:00Z")).getHourlyAttendance!("2026-10-14", "2026-10-20");
    const partial = days.find((d) => d.date === "2026-10-14");
    expect(partial).toMatchObject({ absent: 1, absentHours: [2] });
  });
});
