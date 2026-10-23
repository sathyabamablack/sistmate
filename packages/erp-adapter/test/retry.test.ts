import { describe, expect, it, vi } from "vitest";
import { SessionExpiredError } from "@usp/core";
import { createLiveErpAdapter } from "../src/index";

const BASE = "https://erp.example.edu";
const SESSION = JSON.stringify({ token: "jwt-test-token-123", regNo: "41110234", studentId: "9001" });

const ok = () =>
  new Response(JSON.stringify({ status: 1, responseData: [] }), {
    headers: { "Content-Type": "application/json" },
  });

function adapter(impl: typeof fetch, extra: Partial<Parameters<typeof createLiveErpAdapter>[0]> = {}) {
  const sleep = vi.fn(async () => undefined);
  const erp = createLiveErpAdapter({ baseUrl: BASE, session: SESSION, fetch: impl, sleep, ...extra });
  return { erp, sleep };
}

describe("ERP read retries", () => {
  it("retries once after a network error, with a 300-700 ms pause", async () => {
    const impl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(ok());
    const { erp, sleep } = adapter(impl);
    await expect(erp.getAttendance()).resolves.toEqual([]);
    expect(impl).toHaveBeenCalledTimes(2);
    const pause = sleep.mock.calls[0]![0] as number;
    expect(pause).toBeGreaterThanOrEqual(300);
    expect(pause).toBeLessThan(700);
  });

  it("retries once after a 5xx and then succeeds", async () => {
    const impl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
      .mockResolvedValueOnce(ok());
    const { erp } = adapter(impl);
    await expect(erp.getAttendance()).resolves.toEqual([]);
    expect(impl).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry", async () => {
    const impl = vi.fn<typeof fetch>().mockImplementation(async () => new Response("down", { status: 503 }));
    const { erp } = adapter(impl);
    await expect(erp.getAttendance()).rejects.toThrow("HTTP 503");
    expect(impl).toHaveBeenCalledTimes(2);
  });

  it("never retries a 401 or 403 and keeps the SessionExpiredError meaning", async () => {
    for (const status of [401, 403]) {
      const impl = vi.fn<typeof fetch>().mockImplementation(async () => new Response("no", { status }));
      const { erp, sleep } = adapter(impl);
      await expect(erp.getAttendance()).rejects.toBeInstanceOf(SessionExpiredError);
      expect(impl).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    }
  });

  it("does not treat an HTML 403 (bot protection) as an expired session", async () => {
    const impl = vi.fn<typeof fetch>().mockImplementation(
      async () => new Response("<html>blocked</html>", { status: 403, headers: { "Content-Type": "text/html" } }),
    );
    const { erp } = adapter(impl);
    const err = await erp.getAttendance().catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(SessionExpiredError);
    expect((err as Error).message).toMatch(/refused a request/);
  });

  it("does not retry other 4xx answers", async () => {
    const impl = vi.fn<typeof fetch>().mockImplementation(async () => new Response("nope", { status: 400 }));
    const { erp } = adapter(impl);
    await expect(erp.getAttendance()).rejects.toThrow("HTTP 400");
    expect(impl).toHaveBeenCalledTimes(1);
  });

  it("does not retry our own timeout", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    const impl = vi.fn<typeof fetch>().mockRejectedValue(timeout);
    const { erp } = adapter(impl);
    await expect(erp.getAttendance()).rejects.toBe(timeout);
    expect(impl).toHaveBeenCalledTimes(1);
  });

  it("stops at once when the caller's deadline has passed", async () => {
    const controller = new AbortController();
    const impl = vi.fn<typeof fetch>().mockImplementation(async () => {
      controller.abort(new Error("deadline"));
      throw new TypeError("fetch failed");
    });
    const { erp } = adapter(impl, { signal: controller.signal });
    await expect(erp.getAttendance()).rejects.toBeInstanceOf(TypeError);
    expect(impl).toHaveBeenCalledTimes(1);
  });

  it("passes a combined abort signal to fetch", async () => {
    const controller = new AbortController();
    const impl = vi.fn<typeof fetch>().mockImplementation(async () => ok());
    const { erp } = adapter(impl, { signal: controller.signal });
    await erp.getAttendance();
    const signal = impl.mock.calls[0]![1]!.signal!;
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it("never retries login", async () => {
    const impl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    const { erp, sleep } = adapter(impl, { session: undefined });
    const result = await erp.authenticate({ username: "41110234", password: "x" });
    expect(result.ok).toBe(false);
    expect(impl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("explains an unreadable reply instead of leaking a parser error", async () => {
    const impl = vi.fn<typeof fetch>().mockImplementation(async () => new Response("<html>", { status: 200 }));
    const { erp } = adapter(impl);
    await expect(erp.getAttendance()).rejects.toThrow(/can't read/);
  });
});
