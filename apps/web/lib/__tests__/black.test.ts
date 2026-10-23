import { describe, expect, it } from "vitest";
import { OPENS_AT, blackPhase, pad2, splitCountdown } from "../black";

describe("sathyabama black countdown", () => {
  it("opens Wednesday 28 October 2026 at 11:00 IST", () => {
    const d = new Date(OPENS_AT);
    expect(d.toISOString()).toBe("2026-10-28T05:30:00.000Z");
    expect(new Date(OPENS_AT + 5.5 * 3600_000).getUTCDay()).toBe(3);
  });

  it("splits milliseconds into days, hours, minutes and seconds", () => {
    expect(splitCountdown(((4 * 24 + 14) * 3600 + 5 * 60 + 27) * 1000)).toEqual({
      days: 4,
      hours: 14,
      minutes: 5,
      seconds: 27,
    });
  });

  it("never goes negative and ignores partial seconds", () => {
    expect(splitCountdown(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(splitCountdown(1999).seconds).toBe(1);
  });

  it("switches phase at the opening time", () => {
    expect(blackPhase(OPENS_AT - 1)).toBe("before");
    expect(blackPhase(OPENS_AT)).toBe("open");
  });

  it("pads to two digits", () => {
    expect(pad2(4)).toBe("04");
    expect(pad2(27)).toBe("27");
  });
});
