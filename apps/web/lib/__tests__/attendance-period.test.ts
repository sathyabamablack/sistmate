import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDailyAttendance, dateRange, type DailyAttendance, type HourlyDay } from "@usp/core";
import { createCache } from "@usp/cache";

// The period loader is server-only and borrows the data layer's adapter and cache.
// Here the adapter is a fake ERP that behaves like the live one (it narrows day-wise
// ranges to its academic window) and the cache is the real one, in the temp dir.
vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  erp: {} as Record<string, unknown>,
  scope: "",
  cache: null as unknown,
}));

vi.mock("../data", () => ({
  periodErpContext: async () => ({
    erp: state.erp,
    scope: state.scope,
    cache: state.cache,
    ttlMs: 180_000,
    deadline: new AbortController().signal,
  }),
}));

const { getAttendancePeriod } = await import("../attendance-period");

const NOW = new Date("2026-10-12T10:30:00Z"); // 4 pm in Chennai
const cache = createCache({ dir: path.join(os.tmpdir(), "usp-period-test"), negativeTtlMs: 0 });

function fakeErp(window: { from: string; to: string } | null) {
  const daily: [string, string][] = [];
  const hourly: [string, string][] = [];
  state.erp = {
    async getDailyAttendance(from: string, to: string): Promise<DailyAttendance> {
      daily.push([from, to]);
      let r = { from, to };
      if (window) {
        const f = from > window.from ? from : window.from;
        const t = to < window.to ? to : window.to;
        if (f !== from || t !== to) daily.push([f, t]); // the live adapter asks a second time
        r = { from: f, to: t };
      }
      const range = dateRange(r.from, r.to);
      const built = buildDailyAttendance(
        { ...r, absentDates: [], holidays: [], timeSetDays: [1, 2, 3, 4, 5, 6], workingDays: range },
        NOW,
      );
      return window ? { ...built, academicWindow: window } : built;
    },
    async getHourlyAttendance(from: string, to: string): Promise<HourlyDay[]> {
      hourly.push([from, to]);
      return dateRange(from, to).map((date) => ({ date, totalHours: 6, present: 5, absent: 1, notGiven: 0 }));
    },
  };
  return { daily, hourly };
}

let counter = 0;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  counter += 1;
  state.scope = `test:${process.pid}:${Date.now()}:${counter}`;
  state.cache = cache;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("getAttendancePeriod", () => {
  it("leaves the default periods to the dashboard and asks the ERP nothing", async () => {
    const calls = fakeErp({ from: "2026-07-15", to: "2026-12-31" });
    expect(await getAttendancePeriod("this-month", "last-14-days")).toEqual({ daily: null, hourly: null });
    expect(calls.daily).toEqual([]);
    expect(calls.hourly).toEqual([]);
  });

  it("reads last month in one call and caches it", async () => {
    const calls = fakeErp({ from: "2026-07-15", to: "2026-12-31" });
    const { daily } = await getAttendancePeriod("last-month", "last-14-days");
    expect(calls.daily).toEqual([["2026-09-01", "2026-09-30"]]);
    expect(daily).toMatchObject({
      period: "last-month",
      range: { from: "2026-09-01", to: "2026-09-30" },
      windowStart: null,
      semesterUnknown: false,
      error: null,
    });
    expect(daily?.daily?.window).toEqual({ from: "2026-09-01", to: "2026-09-30" });

    await getAttendancePeriod("last-month", "last-14-days");
    expect(calls.daily).toHaveLength(1);
  });

  it("finds the semester's start from the ERP's reply when it is not known yet", async () => {
    const calls = fakeErp({ from: "2026-07-15", to: "2026-12-31" });
    const { daily } = await getAttendancePeriod("this-semester", "last-14-days");
    // 6-month fallback, narrowed by the adapter: two adapter-level calls, no third.
    expect(calls.daily).toEqual([
      ["2026-05-01", "2026-10-12"],
      ["2026-07-15", "2026-10-12"],
    ]);
    expect(daily).toMatchObject({ range: { from: "2026-07-15", to: "2026-10-12" }, semesterUnknown: false });
  });

  it("asks once more when the semester began before the 6-month fallback", async () => {
    const calls = fakeErp({ from: "2026-03-02", to: "2026-12-31" });
    const { daily } = await getAttendancePeriod("this-semester", "last-14-days");
    expect(calls.daily).toEqual([
      ["2026-05-01", "2026-10-12"],
      ["2026-03-02", "2026-10-12"],
    ]);
    expect(daily?.daily?.window).toEqual({ from: "2026-03-02", to: "2026-10-12" });
  });

  it("falls back to the last 6 months and says so when the ERP names no window", async () => {
    const calls = fakeErp(null);
    const { daily } = await getAttendancePeriod("this-semester", "last-14-days");
    expect(calls.daily).toEqual([["2026-05-01", "2026-10-12"]]);
    expect(daily).toMatchObject({ semesterUnknown: true, range: { from: "2026-05-01" } });
  });

  it("says there are no day-wise records before the semester, without asking again", async () => {
    const calls = fakeErp({ from: "2026-10-05", to: "2027-03-31" });
    await getAttendancePeriod("past-3-months", "last-14-days"); // learns the window
    expect(calls.daily).toEqual([
      ["2026-08-01", "2026-10-12"],
      ["2026-10-05", "2026-10-12"],
    ]);
    const { daily } = await getAttendancePeriod("last-month", "last-14-days");
    expect(calls.daily).toHaveLength(2); // nothing to ask: September is before the window
    expect(daily).toMatchObject({ daily: null, windowStart: "2026-10-05", error: null });
  });

  it("marks a period that starts before the semester", async () => {
    fakeErp({ from: "2026-08-20", to: "2026-12-31" });
    const { daily } = await getAttendancePeriod("past-3-months", "last-14-days");
    expect(daily).toMatchObject({ windowStart: "2026-08-20" });
    expect(daily?.daily?.window.from).toBe("2026-08-20");
  });

  it("reads long hour-wise periods in 31-day pieces and merges them", async () => {
    const calls = fakeErp({ from: "2026-07-15", to: "2026-12-31" });
    const { hourly, daily } = await getAttendancePeriod("this-month", "past-3-months");
    expect(daily).toBeNull();
    expect(calls.hourly).toEqual([
      ["2026-09-12", "2026-10-12"],
      ["2026-08-12", "2026-09-11"],
      ["2026-08-01", "2026-08-11"],
    ]);
    expect(hourly?.days).toHaveLength(73);
    expect(hourly?.days[0]?.date).toBe("2026-08-01");
    expect(hourly?.trimmedFrom).toBeNull();
  });

  it("asks at most four pieces and says where the shown part starts", async () => {
    const calls = fakeErp(null);
    const { hourly } = await getAttendancePeriod("this-month", "this-semester");
    expect(calls.hourly).toHaveLength(4);
    expect(hourly).toMatchObject({ semesterUnknown: true, trimmedFrom: "2026-06-11", range: { from: "2026-06-11" } });
  });

  it("reads seven days in one call", async () => {
    const calls = fakeErp(null);
    const { hourly } = await getAttendancePeriod("this-month", "last-7-days");
    expect(calls.hourly).toEqual([["2026-10-06", "2026-10-12"]]);
    expect(hourly?.days).toHaveLength(7);
  });

  it("turns an ERP failure into a message, never a crash", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.erp = {
      getDailyAttendance: async () => {
        throw new Error("The ERP is down.");
      },
      getHourlyAttendance: async () => [{ date: "bad" }],
    };
    const { daily, hourly } = await getAttendancePeriod("last-month", "last-7-days");
    expect(daily).toMatchObject({ daily: null, error: "The ERP is down." });
    expect(hourly).toMatchObject({ days: [], error: "The ERP sent data in an unexpected format." });
  });
});
