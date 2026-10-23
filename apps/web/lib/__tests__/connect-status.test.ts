import { describe, expect, it } from "vitest";
import { formatUntil, summarizeConnection } from "../connect/status";

// 12 Oct 2026, 15:00 IST
const now = new Date("2026-10-12T09:30:00Z");

describe("summarizeConnection", () => {
  it("says when a healthy connection ends, in campus time", () => {
    // 21:40 IST the same day
    const s = summarizeConnection({ status: "connected", expiresAt: new Date("2026-10-12T16:10:00Z") }, now);
    expect(s).toEqual({ tone: "ok", label: "Connected until 9:40 pm", reconnect: false });
  });

  it("supports 24-hour time and names the day when it ends tomorrow", () => {
    const at = new Date("2026-10-13T04:10:00Z"); // Tue 09:40 IST
    expect(formatUntil(at, now, "24h")).toBe("Tue 09:40");
    expect(formatUntil(at, now)).toBe("Tue 9:40 am");
  });

  it("offers Reconnect when little time is left", () => {
    const s = summarizeConnection({ status: "connected", expiresAt: new Date("2026-10-12T10:00:00Z") }, now);
    expect(s.tone).toBe("warn");
    expect(s.reconnect).toBe(true);
  });

  it("covers expired, unknown and missing tokens", () => {
    expect(summarizeConnection({ status: "expired", expiresAt: new Date(0) }, now)).toMatchObject({
      label: "Session expired",
      reconnect: true,
    });
    expect(summarizeConnection({ status: "unknown" }, now)).toMatchObject({ label: "Connected", reconnect: false });
    expect(summarizeConnection({ status: "none" }, now)).toMatchObject({ label: "Not connected", reconnect: true });
  });
});
