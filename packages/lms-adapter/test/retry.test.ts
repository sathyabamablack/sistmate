import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { SessionExpiredError } from "@usp/core";
import { createLiveLmsAdapter } from "../src/live";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/ws/${name}`, import.meta.url), "utf8"));

const BASE = "https://lms.example.edu";

const json = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
const calendar = () => json(fixture("core_calendar_get_action_events_by_timesort.json"));

function adapter(impl: typeof fetch, extra: Partial<Parameters<typeof createLiveLmsAdapter>[0]> = {}) {
  const sleep = vi.fn(async () => undefined);
  const lms = createLiveLmsAdapter({ baseUrl: BASE, token: "tok", fetch: impl, sleep, ...extra });
  return { lms, sleep };
}

describe("Moodle read retries", () => {
  it("retries once after a network error", async () => {
    const impl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(calendar());
    const { lms, sleep } = adapter(impl);
    await expect(lms.getCalendar()).resolves.toBeInstanceOf(Array);
    expect(impl).toHaveBeenCalledTimes(2);
    const pause = sleep.mock.calls[0]![0] as number;
    expect(pause).toBeGreaterThanOrEqual(300);
    expect(pause).toBeLessThan(700);
  });

  it("retries once after a 5xx, then reports the failure", async () => {
    const impl = vi.fn<typeof fetch>().mockImplementation(async () => new Response("down", { status: 503 }));
    const { lms } = adapter(impl);
    await expect(lms.getCalendar()).rejects.toThrow("HTTP 503");
    expect(impl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx or a timeout", async () => {
    const forbidden = vi.fn<typeof fetch>().mockImplementation(async () => new Response("no", { status: 403 }));
    await expect(adapter(forbidden).lms.getCalendar()).rejects.toThrow("HTTP 403");
    expect(forbidden).toHaveBeenCalledTimes(1);

    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const slow = vi.fn<typeof fetch>().mockRejectedValue(timeout);
    await expect(adapter(slow).lms.getCalendar()).rejects.toBe(timeout);
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it("keeps the expired-token meaning (HTTP 200 + exception JSON, never retried)", async () => {
    const impl = vi.fn<typeof fetch>().mockImplementation(async () => json(fixture("ws_exception_invalidtoken.json")));
    const { lms, sleep } = adapter(impl);
    await expect(lms.getCalendar()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(impl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("stops retrying once the caller's deadline has passed", async () => {
    const controller = new AbortController();
    const impl = vi.fn<typeof fetch>().mockImplementation(async () => {
      controller.abort(new Error("deadline"));
      throw new TypeError("fetch failed");
    });
    const { lms } = adapter(impl, { signal: controller.signal });
    await expect(lms.getCalendar()).rejects.toBeInstanceOf(TypeError);
    expect(impl).toHaveBeenCalledTimes(1);
  });

  it("never retries login", async () => {
    const impl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    const { lms, sleep } = adapter(impl);
    await expect(lms.authenticate({ username: "u", password: "p" })).rejects.toBeInstanceOf(TypeError);
    expect(impl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
