import { describe, expect, it } from "vitest";
import type { FeeRecord, TimetableSlot } from "@usp/core";
import { campusClock } from "../utils";
import { describeLink, formatPosted, formatStamp, groupNotices, linkify } from "../notice-format";
import { groupFees, shortAcademicYear, splitFeeDescription, summarizeFees } from "../fee-ledger";
import { buildWeek, clockTime, findNowNext, formatDuration, slotState } from "../week";

describe("notice date grouping (campus days)", () => {
  const now = new Date("2026-10-11T09:00:00+05:30"); // Sunday

  it("buckets into today / yesterday / this week / earlier and drops empty buckets", () => {
    const items = [
      { id: "a", date: "2026-10-11T08:00:00+05:30" },
      { id: "b", date: "2026-10-10T23:50:00+05:30" },
      { id: "c", date: "2026-10-07T15:15:00+05:30" },
      { id: "d", date: "2026-10-02T07:44:00+05:30" },
    ];
    const groups = groupNotices(items, now);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ["Today", ["a"]],
      ["Yesterday", ["b"]],
      ["This week", ["c"]],
      ["Earlier", ["d"]],
    ]);
    expect(groupNotices([items[3]!], now).map((g) => g.key)).toEqual(["earlier"]);
  });

  it("treats future-dated and unparseable notices safely", () => {
    const groups = groupNotices(
      [{ date: "2026-10-12T10:00:00+05:30" }, { date: "garbage" }],
      now,
    );
    expect(groups.map((g) => g.key)).toEqual(["today", "earlier"]);
  });

  it("uses campus time at the day boundary, not UTC", () => {
    // 2026-10-10 19:00 UTC is already 11 Oct 00:30 IST -> today.
    const g = groupNotices([{ date: "2026-10-10T19:00:00Z" }], now);
    expect(g[0]!.key).toBe("today");
  });

  it("formats stamps", () => {
    expect(formatPosted("2026-10-09T11:21:00+05:30", now)).toBe("Posted 9 Oct, 11:21 am");
    expect(formatPosted("2025-12-30T15:05:00+05:30", now)).toBe("Posted 30 Dec 2025, 3:05 pm");
    expect(formatStamp("2026-10-11T08:00:00+05:30", "today")).toBe("8:00 am");
    expect(formatStamp("2026-10-07T15:15:00+05:30", "week")).toBe("Wed, 3:15 pm");
    expect(formatStamp("2026-10-02T07:44:00+05:30", "earlier")).toBe("2 Oct, 7:44 am");
  });
});

describe("linkify", () => {
  it("splits text and links, trimming sentence punctuation", () => {
    expect(linkify("Join: https://youtu.be/w1VD79WzuRQ. Thanks")).toEqual([
      { type: "text", value: "Join: " },
      { type: "link", value: "https://youtu.be/w1VD79WzuRQ", href: "https://youtu.be/w1VD79WzuRQ" },
      { type: "text", value: ". Thanks" },
    ]);
  });

  it("keeps balanced parentheses and drops an unbalanced closing one", () => {
    expect(linkify("(see https://a.org/x)")[1]).toMatchObject({ value: "https://a.org/x" });
    expect(linkify("https://en.wikipedia.org/wiki/Foo_(bar)")[0]).toMatchObject({
      value: "https://en.wikipedia.org/wiki/Foo_(bar)",
    });
  });

  it("handles www. links and never emits javascript: or html", () => {
    expect(linkify("www.sathyabama.ac.in")[0]).toMatchObject({ href: "https://www.sathyabama.ac.in" });
    const segs = linkify("javascript:alert(1) <script>x</script>");
    expect(segs.every((s) => s.type === "text")).toBe(true);
  });

  it("returns plain text untouched", () => {
    expect(linkify("nothing here")).toEqual([{ type: "text", value: "nothing here" }]);
    expect(linkify("")).toEqual([]);
  });
});

describe("describeLink", () => {
  it("recognises files and plain links", () => {
    expect(describeLink("https://s3.example.com/DocumentStorage/circ%20one.pdf")).toEqual({
      isFile: true,
      host: "s3.example.com",
      fileName: "circ one.pdf",
    });
    expect(describeLink("https://www.youtube.com/watch?v=abc")).toEqual({
      isFile: false,
      host: "youtube.com",
      fileName: undefined,
    });
  });
});

describe("fee ledger", () => {
  const real: FeeRecord[] = [
    { description: "Tuition fee · 2026-2027", amount: 0, paid: true, status: "paid" },
    { description: "Tuition fee · 2025-2026", amount: 0, paid: true, status: "paid" },
    { description: "Tuition fee · 2027-2028", amount: 0, paid: false, status: "upcoming" },
  ];

  it("summarises status-only data without rupee totals", () => {
    const s = summarizeFees(real);
    expect(s.hasAmounts).toBe(false);
    expect(s.phrase).toBe("2 years paid · 1 upcoming · nothing due");
  });

  it("groups by kind and sorts years ascending", () => {
    const [g] = groupFees(real);
    expect(g!.kind).toBe("Tuition fee");
    expect(g!.rows.map((r) => r.period)).toEqual(["2025-2026", "2026-2027", "2027-2028"]);
  });

  it("keeps totals and due counts when amounts exist (mock shape, no status)", () => {
    const mock: FeeRecord[] = [
      { description: "Tuition & Lab Fee - Semester 5 (2026-27 Odd)", amount: 92500, paid: true },
      { description: "Hostel & Mess Fee - Semester 6 (2026-27 Even)", amount: 68000, paid: false },
    ];
    const s = summarizeFees(mock);
    expect(s).toMatchObject({ paid: 1, due: 1, paidTotal: 92500, dueTotal: 68000, hasAmounts: true });
    expect(s.phrase).toBe("1 paid · 1 due");
    expect(splitFeeDescription(mock[0]!.description)).toEqual({
      kind: "Tuition & Lab Fee",
      period: "Semester 5 (2026-27 Odd)",
    });
  });

  it("shortens academic years", () => {
    expect(shortAcademicYear("2025-2026")).toBe("2025–26");
    expect(shortAcademicYear("2026-27")).toBe("2026–27");
    expect(shortAcademicYear("Semester 5")).toBe("Semester 5");
  });
});

describe("week model", () => {
  const slot = (day: number, startTime: string, endTime: string, code: string): TimetableSlot => ({
    day,
    startTime,
    endTime,
    courseCode: code,
    courseTitle: `Course ${code}`,
  });
  const slots = [
    slot(0, "09:00", "10:00", "A"),
    slot(0, "10:00", "11:00", "B"),
    slot(0, "12:15", "13:15", "A"),
    slot(1, "09:00", "10:00", "C"),
    slot(1, "12:15", "13:15", "B"),
  ];

  it("inserts break rows for gaps between periods and keeps Mon-Fri columns", () => {
    const w = buildWeek(slots);
    expect(w.days).toEqual([0, 1, 2, 3, 4]);
    expect(w.rows.map((r) => r.type)).toEqual(["period", "period", "break", "period"]);
    const brk = w.rows[2]!;
    expect(brk).toMatchObject({ start: "11:00", end: "12:15", minutes: 75 });
    expect(formatDuration(75)).toBe("1 h 15 min");
    expect(formatDuration(15)).toBe("15 min");
  });

  it("adds Saturday only when it has classes, and gives subjects stable accents", () => {
    expect(buildWeek([...slots, slot(5, "09:00", "10:00", "A")]).days).toEqual([0, 1, 2, 3, 4, 5]);
    const w = buildWeek(slots);
    expect(w.subjects.get("A")!.periods).toBe(2);
    expect(w.subjects.get("A")!.accent).not.toBe(w.subjects.get("B")!.accent);
  });

  it("finds the current and next class on the campus clock", () => {
    const w = buildWeek(slots);
    // Monday 2026-10-05 10:30 IST
    const during = campusClock(new Date("2026-10-05T10:30:00+05:30"));
    expect(slotState(slots[1]!, during)).toBe("now");
    expect(slotState(slots[0]!, during)).toBe("done");
    expect(findNowNext(w, during)).toMatchObject({ now: slots[1], next: slots[2] });

    // Monday evening: nothing left today, following class is Tuesday 09:00
    const evening = campusClock(new Date("2026-10-05T18:00:00+05:30"));
    expect(findNowNext(w, evening)).toMatchObject({ following: slots[3] });

    // Sunday: wraps to Monday
    const sunday = campusClock(new Date("2026-10-11T10:00:00+05:30"));
    expect(findNowNext(w, sunday).following).toBe(slots[0]);
  });

  it("formats clock times without a meridiem", () => {
    expect(clockTime("13:15")).toBe("1:15");
    expect(clockTime("09:00")).toBe("9:00");
    expect(clockTime("00:30")).toBe("12:30");
  });
});
