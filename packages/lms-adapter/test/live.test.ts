import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SessionExpiredError } from "@usp/core";
import { createLiveLmsAdapter, flattenParams } from "../src/live";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/ws/${name}`, import.meta.url), "utf8"));

const BASE = "https://lms.example.edu";

/** Fake Moodle: routes by wsfunction to the WS fixtures, records calls. */
function fakeMoodle(opts: { tokenOk?: boolean; expired?: boolean } = {}) {
  const calls: string[] = [];
  const statusBundle = fixture("mod_assign_get_submission_status.bundle.json") as Record<
    string,
    unknown
  >;

  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = new URLSearchParams(String(init?.body ?? ""));
    const json = (data: unknown) =>
      new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });

    if (url === `${BASE}/login/token.php`) {
      calls.push("token");
      return json(fixture(opts.tokenOk === false ? "token_error.json" : "token_success.json"));
    }

    const fn = body.get("wsfunction") ?? "";
    calls.push(fn);
    if (opts.expired) return json(fixture("ws_exception_invalidtoken.json"));
    if (fn === "mod_assign_get_submission_status") {
      return json(statusBundle[body.get("assignid") ?? ""] ?? {});
    }
    return json(fixture(`${fn}.json`));
  }) as typeof fetch;

  return { impl, calls };
}

describe("flattenParams", () => {
  it("flattens arrays and nested objects PHP-style", () => {
    const p = flattenParams({ courseids: [1, 2], options: { a: 1 }, skip: undefined });
    expect(p.toString()).toBe("courseids%5B0%5D=1&courseids%5B1%5D=2&options%5Ba%5D=1");
  });
});

describe("live Moodle adapter (fake fetch over fixtures)", () => {
  it("authenticates and returns the token as the session", async () => {
    const { impl } = fakeMoodle();
    const res = await createLiveLmsAdapter({ baseUrl: BASE, fetch: impl }).authenticate({
      username: "u",
      password: "p",
    });
    expect(res.ok).toBe(true);
    expect(typeof res.session).toBe("string");
    expect(res.session).not.toBe("p");
  });

  it("reports a wrong password without throwing", async () => {
    const { impl } = fakeMoodle({ tokenOk: false });
    const res = await createLiveLmsAdapter({ baseUrl: BASE, fetch: impl }).authenticate({
      username: "u",
      password: "bad",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it("loads courses, assignments with submission status, calendar and notifications", async () => {
    const { impl, calls } = fakeMoodle();
    const lms = createLiveLmsAdapter({ baseUrl: BASE, token: "t", fetch: impl });

    const [courses, assignments, events, notes] = await Promise.all([
      lms.getCourses(),
      lms.getAssignments(),
      lms.getCalendar(),
      lms.getNotifications(),
    ]);

    expect(courses.length).toBeGreaterThan(0);
    // names and grades come from the optional enrichment calls
    expect(courses.find((c) => c.id === 101)).toMatchObject({ category: "B.E. CSE / Semester 5", grade: "69 %" });
    // the course list is loaded once even though getAssignments needs it too
    expect(calls.filter((c) => c === "core_enrol_get_users_courses")).toHaveLength(1);
    expect(assignments.length).toBeGreaterThan(0);
    expect(assignments.some((a) => a.submitted)).toBe(true);
    expect(assignments.some((a) => !a.submitted)).toBe(true);
    expect(events.every((e) => e.source === "lms")).toBe(true);
    expect(notes.every((n) => n.source === "lms")).toBe(true);
    // site info is fetched once per adapter instance and shared
    expect(calls.filter((c) => c === "core_webservice_get_site_info")).toHaveLength(1);
  });

  it("maps an invalid token to SessionExpiredError", async () => {
    const { impl } = fakeMoodle({ expired: true });
    const lms = createLiveLmsAdapter({ baseUrl: BASE, token: "stale", fetch: impl });
    await expect(lms.getCourses()).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("treats a missing token as an expired session", async () => {
    const lms = createLiveLmsAdapter({ baseUrl: BASE, fetch: fakeMoodle().impl });
    await expect(lms.getNotifications()).rejects.toBeInstanceOf(SessionExpiredError);
  });
});
