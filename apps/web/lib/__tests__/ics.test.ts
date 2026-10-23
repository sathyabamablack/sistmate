import { describe, expect, it } from "vitest";
import type { CalendarEvent, StudentProfile, TimetableSlot } from "@usp/core";
import { buildCalendar, escapeText, foldLine, mergeSlots, type CalendarInput } from "../ics";

// 2026-10-10 20:00 UTC = Sunday 2026-10-11 01:30 IST (still Saturday in UTC).
const SAT_NIGHT_UTC = new Date("2026-10-10T20:00:00Z");

const profile: StudentProfile = {
  registerNumber: "41110001",
  name: "Test Student",
  program: "B.E. CSE",
  department: "CSE",
  semester: 5,
};

const slot = (over: Partial<TimetableSlot>): TimetableSlot => ({
  day: 0,
  startTime: "09:00",
  endTime: "09:50",
  courseCode: "CS101",
  courseTitle: "Data Structures",
  room: "LH-101",
  faculty: "Dr. Rao",
  ...over,
});

const event = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: "assignment:1",
  title: "Lab record",
  date: "2026-10-15T23:59:00+05:30",
  source: "lms",
  courseName: "Data Structures",
  type: "assignment",
  ...over,
});

function build(input: Partial<CalendarInput>, now = SAT_NIGHT_UTC, weeks?: number): string {
  return buildCalendar({ profile, timetable: [], events: [], ...input }, { now, weeks });
}

/** Unfold (RFC 5545 §3.1) and split into logical content lines. */
function logicalLines(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n").filter(Boolean);
}

/** Split into VEVENT blocks (logical lines). */
function vevents(ics: string): string[][] {
  const out: string[][] = [];
  let cur: string[] | null = null;
  for (const line of logicalLines(ics)) {
    if (line === "BEGIN:VEVENT") cur = [];
    else if (line === "END:VEVENT" && cur) {
      out.push(cur);
      cur = null;
    } else cur?.push(line);
  }
  return out;
}

const prop = (ev: string[], name: string) =>
  ev.find((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));

describe("buildCalendar: envelope", () => {
  const ics = build({ timetable: [slot({})], events: [event({})] });

  it("uses CRLF line endings everywhere and ends with one", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("has the required calendar properties and an IST VTIMEZONE", () => {
    const lines = logicalLines(ics);
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    for (const l of [
      "VERSION:2.0",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-TIMEZONE:Asia/Kolkata",
      "BEGIN:VTIMEZONE",
      "TZID:Asia/Kolkata",
      "BEGIN:STANDARD",
      "DTSTART:19700101T000000",
      "TZOFFSETFROM:+0530",
      "TZOFFSETTO:+0530",
      "TZNAME:IST",
    ]) {
      expect(lines).toContain(l);
    }
    expect(lines.some((l) => l.startsWith("PRODID:"))).toBe(true);
    expect(lines.some((l) => l.startsWith("X-WR-CALNAME:") && l.includes("Test Student"))).toBe(true);
  });

  it("honours a custom PRODID", () => {
    const custom = buildCalendar(
      { profile, timetable: [], events: [] },
      { now: SAT_NIGHT_UTC, prodId: "-//Test//X//EN" },
    );
    expect(logicalLines(custom)).toContain("PRODID:-//Test//X//EN");
  });

  it("stamps every event with DTSTAMP from `now`", () => {
    for (const ev of vevents(ics)) expect(prop(ev, "DTSTAMP")).toBe("DTSTAMP:20261010T200000Z");
  });
});

describe("folding and escaping", () => {
  it("escapes backslash, semicolon, comma and newlines in TEXT values", () => {
    expect(escapeText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
    const ics = build({ events: [event({ title: "Intro; part 1, draft\\v2\nfinal" })] });
    const summary = prop(vevents(ics)[0]!, "SUMMARY");
    expect(summary).toBe("SUMMARY:Intro\\; part 1\\, draft\\\\v2\\nfinal");
  });

  it("keeps every physical line within 75 octets, including long non-ASCII titles", () => {
    const longTitle = "தரவு கட்டமைப்புகள் மற்றும் வழிமுறைகள் — Advanced Algorithms ✓ 日本語のテキスト ".repeat(4);
    const ics = build({
      timetable: [slot({ courseTitle: longTitle })],
      events: [event({ title: longTitle, url: `https://lms.example.edu/mod/assign/view.php?id=${"9".repeat(120)}` })],
    });
    const enc = new TextEncoder();
    const physical = ics.split("\r\n");
    expect(physical.some((l) => l.startsWith(" "))).toBe(true); // something was folded
    for (const l of physical) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
    // Unfolding restores the exact value (no characters lost or split).
    expect(prop(vevents(ics)[0]!, "SUMMARY")).toBe(`SUMMARY:${escapeText(longTitle.trim())}`);
  });

  it("never splits a multi-byte character or surrogate pair", () => {
    const folded = foldLine(`SUMMARY:${"😀".repeat(40)}`);
    for (const part of folded.split("\r\n")) {
      expect(part).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"😀".repeat(40)}`);
  });

  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:short")).toBe("SUMMARY:short");
  });
});

describe("timetable classes", () => {
  it("recurs weekly from the next weekday in IST, even when UTC is still Saturday", () => {
    const ics = build({
      timetable: [
        slot({ day: 0 }), // Monday
        slot({ day: 5, courseCode: "MA201", courseTitle: "Maths", startTime: "14:00", endTime: "14:50" }), // Saturday
        slot({ day: 6, courseCode: "SP100", courseTitle: "Sports", startTime: "07:00", endTime: "08:00" }), // Sunday, later today
      ],
    });
    const [mon, sat, sun] = vevents(ics);
    // Campus "today" is Sun 2026-10-11, so Monday is 10-12 (not 10-12 via UTC's Saturday 10-10 + 2).
    expect(prop(mon!, "DTSTART")).toBe("DTSTART;TZID=Asia/Kolkata:20261012T090000");
    expect(prop(mon!, "DTEND")).toBe("DTEND;TZID=Asia/Kolkata:20261012T095000");
    // Saturday is next week's, not "today in UTC" (10-10).
    expect(prop(sat!, "DTSTART")).toBe("DTSTART;TZID=Asia/Kolkata:20261017T140000");
    // A Sunday class later today (07:00 > 01:30 IST) starts today.
    expect(prop(sun!, "DTSTART")).toBe("DTSTART;TZID=Asia/Kolkata:20261011T070000");
    // 16 weeks by default: 16th Monday is 2027-01-25; UNTIL = 23:59:59 IST that day in UTC.
    expect(prop(mon!, "RRULE")).toBe("RRULE:FREQ=WEEKLY;UNTIL=20270125T182959Z");
  });

  it("starts next week when today's class has already ended", () => {
    const sundayEvening = new Date("2026-10-11T14:30:00Z"); // 20:00 IST Sunday
    const ics = build({ timetable: [slot({ day: 6, startTime: "09:00", endTime: "09:50" })] }, sundayEvening, 2);
    const [ev] = vevents(ics);
    expect(prop(ev!, "DTSTART")).toBe("DTSTART;TZID=Asia/Kolkata:20261018T090000");
    expect(prop(ev!, "RRULE")).toBe("RRULE:FREQ=WEEKLY;UNTIL=20261025T182959Z");
  });

  it("maps title, room and code + faculty", () => {
    const [ev] = vevents(build({ timetable: [slot({})] }));
    expect(prop(ev!, "SUMMARY")).toBe("SUMMARY:Data Structures");
    expect(prop(ev!, "LOCATION")).toBe("LOCATION:LH-101");
    expect(prop(ev!, "DESCRIPTION")).toBe("DESCRIPTION:CS101 · Dr. Rao");
  });

  it("merges consecutive periods of the same course on the same day (labs)", () => {
    const timetable = [
      slot({ courseCode: "CS191", courseTitle: "DS Lab", startTime: "10:40", endTime: "11:30", room: "Lab-3" }),
      slot({ courseCode: "CS191", courseTitle: "DS Lab", startTime: "11:30", endTime: "12:20", room: "Lab-3" }),
      slot({}), // 09:00 CS101 stays separate
      slot({ day: 1, courseCode: "CS191", courseTitle: "DS Lab", startTime: "11:30", endTime: "12:20" }), // other day
      slot({ courseCode: "CS191", courseTitle: "DS Lab", startTime: "15:00", endTime: "15:50" }), // same day, not consecutive
    ];
    expect(mergeSlots(timetable)).toHaveLength(4);
    const events = vevents(build({ timetable }));
    expect(events).toHaveLength(4);
    const lab = events.find((e) => prop(e, "DTSTART")?.endsWith("T104000"));
    expect(prop(lab!, "DTEND")).toBe("DTEND;TZID=Asia/Kolkata:20261012T122000");
    expect(prop(lab!, "LOCATION")).toBe("LOCATION:Lab-3");
  });

  it("skips malformed slots instead of emitting broken events", () => {
    const ics = build({ timetable: [slot({ startTime: "TBA" }), slot({ startTime: "10:00", endTime: "09:00" })] });
    expect(vevents(ics)).toHaveLength(0);
  });
});

describe("deadlines and events", () => {
  const now = SAT_NIGHT_UTC;

  it("emits a timed UTC event with a 30-minute duration", () => {
    const [ev] = vevents(build({ events: [event({ date: "2026-10-15T23:59:00+05:30" })] }, now));
    expect(prop(ev!, "DTSTART")).toBe("DTSTART:20261015T182900Z");
    expect(prop(ev!, "DTEND")).toBe("DTEND:20261015T185900Z");
  });

  it("emits an all-day event at campus midnight and for bare dates", () => {
    const events = vevents(
      build(
        {
          events: [
            event({ id: "exam:1", type: "exam", title: "Model exam", date: "2026-10-20T00:00:00+05:30" }),
            event({ id: "fee:tuition", type: "fee", source: "erp", title: "Fee due: Tuition", date: "2026-12-15" }),
          ],
        },
        now,
      ),
    );
    expect(prop(events[0]!, "DTSTART")).toBe("DTSTART;VALUE=DATE:20261020");
    expect(prop(events[0]!, "DTEND")).toBe("DTEND;VALUE=DATE:20261021");
    expect(prop(events[1]!, "DTSTART")).toBe("DTSTART;VALUE=DATE:20261215");
  });

  it("does not treat UTC midnight (05:30 IST) as all-day", () => {
    const [ev] = vevents(build({ events: [event({ date: "2026-10-20T00:00:00Z" })] }, now));
    expect(prop(ev!, "DTSTART")).toBe("DTSTART:20261020T000000Z");
  });

  it("adds 1-day and 1-hour DISPLAY alarms for assignments, exams and fees only", () => {
    const ics = build(
      {
        events: [
          event({ id: "a", type: "assignment" }),
          event({ id: "e", type: "exam" }),
          event({ id: "f", type: "fee" }),
          event({ id: "o", type: "other" }),
        ],
      },
      now,
    );
    const blocks = ics.split("BEGIN:VEVENT").slice(1);
    for (const b of blocks.slice(0, 3)) {
      expect(b.match(/BEGIN:VALARM/g)).toHaveLength(2);
      expect(b).toContain("TRIGGER:-P1D");
      expect(b).toContain("TRIGGER:-PT1H");
      expect(b).toContain("ACTION:DISPLAY");
    }
    expect(blocks[3]).not.toContain("VALARM");
  });

  it("skips class-type events and anything older than one day", () => {
    const events = vevents(
      build(
        {
          events: [
            event({ id: "c", type: "class", date: "2026-10-12T09:00:00+05:30" }),
            event({ id: "old", title: "Old", date: "2026-10-09T10:00:00+05:30" }), // ~1.6 days ago
            event({ id: "recent", title: "Recent", date: "2026-10-10T10:00:00+05:30" }), // ~15.5h ago
            event({ id: "bad", title: "Bad", date: "not a date" }),
          ],
        },
        now,
      ),
    );
    expect(events.map((e) => prop(e, "SUMMARY"))).toEqual(["SUMMARY:Recent"]);
  });

  it("includes a URL property for http(s) links", () => {
    const [ev] = vevents(build({ events: [event({ url: "https://lms.example.edu/a?id=1" })] }, now));
    expect(prop(ev!, "URL")).toBe("URL:https://lms.example.edu/a?id=1");
  });
});

describe("stable UIDs", () => {
  const input: Partial<CalendarInput> = {
    timetable: [slot({}), slot({ day: 2, courseCode: "MA201", courseTitle: "Maths" })],
    events: [event({ id: "assignment:7" }), event({ id: "fee:x", type: "fee", source: "erp" })],
  };
  const uids = (ics: string) => vevents(ics).map((e) => prop(e, "UID"));

  it("is identical across calls and across weeks", () => {
    const a = uids(build(input, SAT_NIGHT_UTC));
    const b = uids(build(input, SAT_NIGHT_UTC));
    const nextWeek = uids(build(input, new Date("2026-10-13T06:00:00Z")));
    expect(a).toEqual(b);
    expect(nextWeek).toEqual(a);
    expect(a.every((u) => /^UID:[0-9a-f]{16}@unified-student-portal$/.test(u ?? ""))).toBe(true);
  });

  it("is unique per item and per student", () => {
    const a = uids(build(input));
    expect(new Set(a).size).toBe(a.length);
    const other = buildCalendar(
      { profile: { ...profile, registerNumber: "41110002" }, timetable: input.timetable!, events: input.events! },
      { now: SAT_NIGHT_UTC },
    );
    expect(uids(other).some((u) => a.includes(u))).toBe(false);
  });

  it("keeps a deadline's UID when its date or title changes (re-import updates)", () => {
    const before = uids(build({ events: [event({ id: "assignment:9" })] }));
    const after = uids(
      build({ events: [event({ id: "assignment:9", title: "Renamed", date: "2026-10-18T23:59:00+05:30" })] }),
    );
    expect(after).toEqual(before);
  });
});
