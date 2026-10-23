import { describe, expect, it } from "vitest";
import { formatTime, formatTimeLower } from "../utils";
import { clockTime } from "../week";

describe("formatTime", () => {
  it("writes 12-hour times in lowercase by default", () => {
    expect(formatTime("09:00")).toBe("9:00 am");
    expect(formatTime("13:15")).toBe("1:15 pm");
    expect(formatTime("00:30")).toBe("12:30 am");
    expect(formatTime("12:00")).toBe("12:00 pm");
    expect(formatTime("23:59", "12h")).toBe("11:59 pm");
  });

  it("writes 24-hour times with a leading zero", () => {
    expect(formatTime("9:05", "24h")).toBe("09:05");
    expect(formatTime("13:15", "24h")).toBe("13:15");
    expect(formatTime("00:30", "24h")).toBe("00:30");
  });

  it("converts ISO timestamps and dates to campus time", () => {
    // 03:30 UTC is 09:00 in India
    expect(formatTime("2026-10-12T03:30:00Z")).toBe("9:00 am");
    expect(formatTime(new Date("2026-10-12T10:00:00Z"), "24h")).toBe("15:30");
    expect(formatTime("2026-10-09T11:21:00+05:30")).toBe("11:21 am");
  });

  it("leaves input that is not a time alone", () => {
    expect(formatTime("soon")).toBe("soon");
    expect(formatTime(new Date("nope"))).toBe("—");
  });

  it("keeps formatTimeLower as an alias", () => {
    expect(formatTimeLower("14:00")).toBe("2:00 pm");
    expect(formatTimeLower("14:00", "24h")).toBe("14:00");
  });
});

describe("clockTime (timetable grid)", () => {
  it("drops am/pm in 12-hour mode and zero-pads in 24-hour mode", () => {
    expect(clockTime("13:15")).toBe("1:15");
    expect(clockTime("13:15", "12h")).toBe("1:15");
    expect(clockTime("09:00", "24h")).toBe("09:00");
    expect(clockTime("13:15", "24h")).toBe("13:15");
  });
});
