import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionExpiredError } from "@usp/core";

// The data layer is server-only and talks to Next. These tests replace those edges
// (cookies, the session, the live adapters) and exercise the real cache and validation.
vi.hoisted(() => {
  process.env.VERCEL = "1"; // use the OS temp dir for the cache, not the repo
});
vi.mock("server-only", () => ({}));
// `redirect` throws in Next; here it throws a plain error carrying the target.
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));

const state = vi.hoisted(() => ({
  session: { username: "", erpSession: undefined as string | undefined, lmsToken: undefined as string | undefined },
  erp: {} as Record<string, () => Promise<unknown>>,
}));

vi.mock("../session", () => ({
  dataSource: () => "live",
  getSession: async () => state.session,
}));
vi.mock("@usp/erp-adapter", () => ({
  createMockErpAdapter: () => ({}),
  createLiveErpAdapter: () => state.erp,
}));
vi.mock("@usp/lms-adapter", () => ({
  createMockLmsAdapter: () => ({}),
  createLiveLmsAdapter: () => ({}),
}));

const { getDashboardData, requireDashboardData, invalidateDashboardData, NotSignedInError } = await import("../data");
const { isStaleIssue } = await import("../issues");

const profile = { registerNumber: "R1", name: "Test Student", program: "B.E.", department: "CSE", semester: 5 };
const attendance = [{ code: "CS101", title: "Networks", totalClasses: 40, attended: 36, percentage: 90 }];

function healthyErp(overrides: Record<string, () => Promise<unknown>> = {}) {
  return {
    getProfile: async () => profile,
    getAttendance: async () => attendance,
    getMarks: async () => [],
    getResults: async () => [],
    getTimetable: async () => [],
    getFees: async () => [],
    getNotifications: async () => [],
    ...overrides,
  };
}

function jwt(exp: number): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${enc({ alg: "none" })}.${enc({ exp })}.sig`;
}

let counter = 0;
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  counter += 1;
  // A fresh user each test keeps cache entries apart.
  state.session = { username: `user-${counter}-${Math.random().toString(36).slice(2)}`, erpSession: undefined, lmsToken: undefined };
  state.erp = healthyErp();
});

describe("requireDashboardData", () => {
  it("redirects an expired session to the clearing route with one warning, not an error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.session.erpSession = JSON.stringify({ token: jwt(Math.floor(Date.now() / 1000) - 60), regNo: "R1", studentId: "1" });
    await expect(requireDashboardData()).rejects.toThrow("REDIRECT /api/auth/expired");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("session expired");
    expect(error).not.toHaveBeenCalled();
  });

  it("redirects a visitor who was never signed in to /login without logging", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    state.session.username = "";
    await expect(requireDashboardData()).rejects.toThrow("REDIRECT /login");
    expect(warn).not.toHaveBeenCalled();
  });

  it("passes the data through when signed in", async () => {
    await expect(requireDashboardData()).resolves.toMatchObject({ issues: [] });
  });
});

describe("getDashboardData", () => {
  it("loads every section on the happy path with no issues", async () => {
    const data = await getDashboardData();
    expect(data.attendance).toHaveLength(1);
    expect(data.issues).toEqual([]);
    expect(data.connected).toEqual({ erp: true, lms: false });
  });

  it("leaves day-wise and hour-wise attendance empty, with no issue, when the adapter has neither", async () => {
    const data = await getDashboardData();
    expect(data.dailyAttendance).toBeNull();
    expect(data.hourlyAttendance).toEqual([]);
  });

  it("asks for the month so far (day-wise) and the last 14 days (hour-wise), up to today", async () => {
    const asked: Record<string, [string, string]> = {};
    const daily = {
      days: [{ date: "2026-10-05", status: "present" }],
      summary: { present: 1, absent: 0, holidays: 0, percentage: 100 },
      window: { from: "2026-10-01", to: "2026-10-12" },
    };
    const hourly = [{ date: "2026-10-05", totalHours: 6, present: 6, absent: 0, notGiven: 0 }];
    state.erp = {
      ...healthyErp(),
      getDailyAttendance: (async (from: string, to: string) => {
        asked.daily = [from, to];
        return daily;
      }) as () => Promise<unknown>,
      getHourlyAttendance: (async (from: string, to: string) => {
        asked.hourly = [from, to];
        return hourly;
      }) as () => Promise<unknown>,
    };
    const data = await getDashboardData();
    expect(data.dailyAttendance).toEqual(daily);
    expect(data.hourlyAttendance).toEqual(hourly);
    expect(data.issues).toEqual([]);

    const [dFrom, dTo] = asked.daily!;
    const [hFrom, hTo] = asked.hourly!;
    expect(dFrom).toBe(`${dTo.slice(0, 7)}-01`);
    expect(hTo).toBe(dTo);
    expect((Date.parse(hTo) - Date.parse(hFrom)) / 86_400_000).toBe(13);
  });

  it("turns a malformed section into an issue and an empty fallback, not a crash", async () => {
    state.erp = healthyErp({ getAttendance: async () => [{ code: 7, title: null }] });
    const data = await getDashboardData();
    expect(data.attendance).toEqual([]);
    expect(data.profile.name).toBe("Test Student"); // the other sections still load
    expect(data.issues).toEqual([
      { section: "attendance", source: "erp", message: "The ERP sent data in an unexpected format." },
    ]);
  });

  it("does not log the offending values", async () => {
    state.erp = healthyErp({ getAttendance: async () => [{ code: "SECRET-VALUE-123", title: 5 }] });
    await getDashboardData();
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toContain("SECRET-VALUE-123");
  });

  it("serves the last good copy with a gentle notice when a refresh fails", async () => {
    await getDashboardData(); // fills the cache
    await invalidateDashboardData({ keepStale: true }); // like the Refresh button
    state.erp = healthyErp({
      getAttendance: async () => {
        throw new Error("ERP API down");
      },
    });
    const data = await getDashboardData();
    expect(data.attendance).toEqual(attendance);
    const notice = data.issues.find((i) => i.section === "attendance")!;
    expect(isStaleIssue(notice)).toBe(true);
    expect(notice.message).toMatch(/^Showing data saved at \d{1,2}:\d{2} [ap]m$/);
  });

  it("reports a plain failure when there is no earlier copy", async () => {
    state.erp = healthyErp({
      getFees: async () => {
        throw new Error("ERP API down");
      },
    });
    const data = await getDashboardData();
    expect(data.fees).toEqual([]);
    const issue = data.issues.find((i) => i.section === "fees")!;
    expect(isStaleIssue(issue)).toBe(false);
    expect(issue.message).toBe("ERP API down");
  });

  it("still sends an expired session to sign-in even when old data exists", async () => {
    await getDashboardData();
    await invalidateDashboardData({ keepStale: true });
    state.erp = healthyErp({
      getAttendance: async () => {
        throw new SessionExpiredError("erp");
      },
    });
    await expect(getDashboardData()).rejects.toMatchObject({ name: "NotSignedInError", expired: true });
  });

  it("treats an ERP token whose exp has passed as expired right away", async () => {
    state.session.erpSession = JSON.stringify({ token: jwt(Math.floor(Date.now() / 1000) - 60), regNo: "R1", studentId: "1" });
    const getProfile = vi.fn(async () => profile);
    state.erp = healthyErp({ getProfile });
    const error = await getDashboardData().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotSignedInError);
    expect((error as InstanceType<typeof NotSignedInError>).expired).toBe(true);
    expect(getProfile).not.toHaveBeenCalled();
  });

  it("accepts an ERP token that has not expired yet", async () => {
    state.session.erpSession = JSON.stringify({ token: jwt(Math.floor(Date.now() / 1000) + 3600), regNo: "R1", studentId: "1" });
    await expect(getDashboardData()).resolves.toMatchObject({ issues: [] });
  });
});
