import { describe, expect, it } from "vitest";
import type { HourlyDay, TimetableSlot } from "@usp/core";
import {
  OD_FETCH_MAX_DAYS,
  OD_MAX_ENTRIES,
  OD_MAX_NOTE,
  OD_VERSION,
  advisorText,
  checkEntry,
  cleanHours,
  coverageChanged,
  daysBetween,
  defaultCounted,
  draftFromEntry,
  emptyDraft,
  entryDateLabel,
  entryHours,
  entryHoursLabel,
  erpHours,
  formatHourList,
  hourOptions,
  hoursLabel,
  justUpdated,
  nextLastSeen,
  odFetchRange,
  odProjection,
  odSummary,
  parseOdEntry,
  parseOdState,
  recentAbsences,
  serializeOdState,
  shortTitle,
  slotsForDate,
  subjectCounts,
  timetableDayOf,
  validateDraft,
  type OdDraft,
  type OdEntry,
  type OdState,
  type OdSubject,
} from "../od";

const TODAY = "2026-10-28"; // Wednesday
const TUE = "2026-10-20"; // absent all day in the fixtures below
const WED = "2026-10-14"; // hour 2 absent

const PERIODS = ["09:00", "09:50", "11:00", "11:50", "13:30", "14:20", "15:10"];
const TITLES: Record<string, string> = {
  CN: "Computer Networks",
  OS: "Operating Systems",
  DBMS: "Database Management Systems",
  SE: "Software Engineering",
  PQT: "Probability and Queueing Theory",
  DAA: "Design and Analysis of Algorithms",
  WTL: "Web Technology Laboratory",
};
/** day (0 = Monday) -> code per period; null is a free hour. */
const WEEK: (string | null)[][] = [
  ["CN", "OS", "DBMS", "PQT", "DAA", "SE", null],
  ["WTL", "WTL", "CN", "OS", "PQT", "DBMS", "SE"],
  ["PQT", "DAA", "SE", "CN", "OS", "DBMS", null],
  ["DBMS", null, "DAA", "PQT", "WTL", "WTL", null], // hour 2 free: hour 3 is still DAA
  ["OS", "CN", "PQT", "DAA", "SE", "DBMS", null],
  ["DAA", "CN", "DBMS", null, null, null, null],
];
const TIMETABLE: TimetableSlot[] = WEEK.flatMap((codes, day) =>
  codes.flatMap((code, i) =>
    code ? [{ day, startTime: PERIODS[i]!, endTime: "00:00", courseCode: code, courseTitle: TITLES[code]! }] : [],
  ),
);

const SUBJECTS: OdSubject[] = [
  { code: "CN", title: TITLES.CN!, attended: 42, totalClasses: 48 },
  { code: "OS", title: TITLES.OS!, attended: 40, totalClasses: 46 },
  { code: "DBMS", title: TITLES.DBMS!, attended: 41, totalClasses: 50 },
  { code: "SE", title: TITLES.SE!, attended: 38, totalClasses: 46 },
  { code: "PQT", title: TITLES.PQT!, attended: 36, totalClasses: 45 },
  { code: "DAA", title: TITLES.DAA!, attended: 30, totalClasses: 48 },
  { code: "WTL", title: TITLES.WTL!, attended: 22, totalClasses: 24 },
];

const day = (
  date: string,
  present: number[],
  absent: number[] = [],
  notGiven: number[] = [],
): HourlyDay => ({
  date,
  totalHours: present.length + absent.length + notGiven.length,
  present: present.length,
  absent: absent.length,
  notGiven: notGiven.length,
  presentHours: present,
  absentHours: absent,
  notGivenHours: notGiven,
});
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const entry = (over: Partial<OdEntry> = {}): OdEntry => ({
  id: "e1",
  kind: "od",
  from: TUE,
  to: TUE,
  hours: null,
  note: "",
  counted: true,
  createdAt: "2026-10-21T10:00:00.000Z",
  ...over,
});

/** The last 14 days as the dashboard has them, plus the Wednesday before. */
const HOURLY: HourlyDay[] = [
  day(WED, [1, 3, 4, 5, 6], [2]),
  day("2026-10-19", range(1, 6)),
  day(TUE, [], range(1, 7)),
  day("2026-10-21", range(1, 6)),
  day("2026-10-27", range(1, 7)),
  day(TODAY, [1, 2], [], [3, 4, 5, 6]),
];
const ERP = erpHours(HOURLY, [{ from: "2026-10-15", to: TODAY }]);
const ERP_WITH_OLDER = erpHours(HOURLY, [{ from: "2026-10-01", to: TODAY }]);

/* ------------------------------- parsing ------------------------------- */

describe("parseOdState", () => {
  it("returns an empty list for missing, broken or foreign data", () => {
    for (const raw of [null, undefined, "", "not json", "[]", "{}", '{"v":2,"entries":[]}', '{"v":1,"entries":{}}', "null"]) {
      expect(parseOdState(raw)).toEqual({ v: OD_VERSION, entries: [] });
    }
  });

  it("round-trips what it saves", () => {
    const state: OdState = {
      v: OD_VERSION,
      entries: [
        entry({ note: "Hackathon at IIT Madras", last: { status: "pending", since: TUE, on: "2026-10-21" } }),
        entry({ id: "e2", kind: "medical", from: "2026-10-05", to: "2026-10-07", hours: [5, 6], counted: false }),
      ],
    };
    expect(parseOdState(serializeOdState(state))).toEqual(state);
  });

  it("repairs what it can and drops what it cannot", () => {
    const raw = JSON.stringify({
      v: 1,
      entries: [
        { id: "a", kind: "od", from: "2026-10-07", to: "2026-10-05", hours: [3, 3, 1, 0, 13, 2.5, "4"], note: "  x  " },
        { id: "b", kind: "party", from: TUE, hours: [] },
        { id: "c", kind: "medical", from: TUE, to: "2026-02-31", hours: null },
        { id: "", kind: "od", from: TUE },
        { id: "d", kind: "od", from: "2026-02-30" },
        { id: "a", kind: "od", from: TUE },
        "junk",
        { id: "e", kind: "od", from: "2026-09-01", to: "2026-12-31", note: "y".repeat(500) },
      ],
    });
    const { entries } = parseOdState(raw);
    expect(entries.map((e) => e.id)).toEqual(["a", "b", "c", "e"]);
    expect(entries[0]).toMatchObject({ from: "2026-10-05", to: "2026-10-07", hours: [1, 3], note: "x", counted: true });
    // Unknown kind becomes Other (not counted by default); empty hours mean the whole day.
    expect(entries[1]).toMatchObject({ kind: "other", to: TUE, hours: null, counted: false });
    expect(entries[2]).toMatchObject({ kind: "medical", to: TUE, counted: false });
    // Longer than 31 days: cut to 31; notes capped.
    expect(entries[3]).toMatchObject({ from: "2026-09-01", to: "2026-10-01" });
    expect(entries[3]!.note).toHaveLength(OD_MAX_NOTE);
  });

  it("keeps a valid saved ERP status and drops a broken one", () => {
    expect(parseOdEntry({ ...entry(), last: { status: "updated", since: null, on: TODAY, was: "pending" } })?.last).toEqual({
      status: "updated",
      since: null,
      on: TODAY,
      was: "pending",
    });
    expect(parseOdEntry({ ...entry(), last: { status: "done", on: TODAY } })?.last).toBeUndefined();
    expect(parseOdEntry({ ...entry(), last: { status: "pending", since: "nope", on: "nope" } })?.last).toBeUndefined();
    // `was` equal to the status says nothing.
    expect(parseOdEntry({ ...entry(), last: { status: "pending", since: TUE, on: TODAY, was: "pending" } })?.last).toEqual({
      status: "pending",
      since: TUE,
      on: TODAY,
    });
  });

  it(`keeps at most ${OD_MAX_ENTRIES} entries`, () => {
    const many = Array.from({ length: OD_MAX_ENTRIES + 20 }, (_, i) => entry({ id: `e${i}` }));
    expect(parseOdState(JSON.stringify({ v: 1, entries: many })).entries).toHaveLength(OD_MAX_ENTRIES);
  });

  it("cleans hour lists", () => {
    expect(cleanHours([4, 2, 2, 0, -1, 1.5, 12, 13, "3"])).toEqual([2, 4, 12]);
    expect(cleanHours("1,2")).toEqual([]);
  });
});

/* -------------------------------- form -------------------------------- */

describe("validateDraft", () => {
  const draft = (over: Partial<OdDraft> = {}): OdDraft => ({ ...emptyDraft(TODAY), from: TUE, ...over });

  it("accepts one whole day", () => {
    expect(validateDraft(draft({ note: "  Symposium  " }), TODAY)).toEqual({
      ok: true,
      value: { kind: "od", from: TUE, to: TUE, hours: null, note: "Symposium", counted: true },
    });
  });

  it("accepts a range with some hours", () => {
    const result = validateDraft(draft({ multi: true, to: "2026-10-22", wholeDay: false, hours: [6, 5, 5] }), TODAY);
    expect(result).toMatchObject({ ok: true, value: { from: TUE, to: "2026-10-22", hours: [5, 6] } });
  });

  it("ignores the last day while it is one day", () => {
    expect(validateDraft(draft({ to: "2026-10-01" }), TODAY)).toMatchObject({ ok: true, value: { to: TUE } });
  });

  it("explains each problem", () => {
    const errors = (d: OdDraft) => {
      const r = validateDraft(d, TODAY);
      return r.ok ? null : r.errors;
    };
    expect(errors(draft({ from: "" }))).toEqual({ from: "Pick a date." });
    expect(errors(draft({ from: "2025-01-01" }))).toEqual({ from: "Pick a date in the last year." });
    expect(errors(draft({ from: "2027-03-01" }))).toEqual({ from: "Pick a date in the next 60 days." });
    expect(errors(draft({ multi: true, to: "" }))).toEqual({ to: "Pick the last day." });
    expect(errors(draft({ multi: true, to: TUE }))).toEqual({ to: "Pick a day after the first day." });
    expect(errors(draft({ multi: true, to: "2026-11-30" }))).toEqual({ to: "Keep it to 31 days or fewer." });
    expect(errors(draft({ wholeDay: false, hours: [] }))).toEqual({ hours: "Pick at least one hour." });
  });

  it("round-trips an entry through the form", () => {
    const e = entry({ kind: "medical", from: "2026-10-05", to: "2026-10-07", hours: [2, 3], note: "Fever", counted: false });
    const result = validateDraft(draftFromEntry(e), TODAY);
    expect(result).toEqual({
      ok: true,
      value: { kind: "medical", from: "2026-10-05", to: "2026-10-07", hours: [2, 3], note: "Fever", counted: false },
    });
  });

  it("counts ODs as attended by default, not leave", () => {
    expect(defaultCounted("od")).toBe(true);
    expect(defaultCounted("medical")).toBe(false);
    expect(defaultCounted("other")).toBe(false);
  });

  it("knows when an edit changes the hours covered", () => {
    const base = entry({ hours: [2] });
    expect(coverageChanged(base, { ...base, note: "x", counted: false, kind: "medical" })).toBe(false);
    expect(coverageChanged(base, { ...base, hours: [2, 3] })).toBe(true);
    expect(coverageChanged(base, { ...base, to: "2026-10-21" })).toBe(true);
    expect(coverageChanged(base, { ...base, hours: null })).toBe(true);
  });
});

/* ----------------------------- timetable ----------------------------- */

describe("dates to timetable slots", () => {
  it("numbers weekdays from Monday", () => {
    expect(timetableDayOf("2026-10-19")).toBe(0); // Monday
    expect(timetableDayOf(TUE)).toBe(1);
    expect(timetableDayOf("2026-10-25")).toBe(6); // Sunday
  });

  it("maps hour N to the N-th period of the week, so a free hour does not shift the rest", () => {
    expect(slotsForDate(TIMETABLE, TUE).map((s) => [s.hour, s.code])).toEqual([
      [1, "WTL"],
      [2, "WTL"],
      [3, "CN"],
      [4, "OS"],
      [5, "PQT"],
      [6, "DBMS"],
      [7, "SE"],
    ]);
    // Thursday's second hour is free; hour 3 is still DAA at 11:00.
    expect(slotsForDate(TIMETABLE, "2026-10-22").map((s) => [s.hour, s.code, s.start])).toEqual([
      [1, "DBMS", "09:00"],
      [3, "DAA", "11:00"],
      [4, "PQT", "11:50"],
      [5, "WTL", "13:30"],
      [6, "WTL", "14:20"],
    ]);
    expect(slotsForDate(TIMETABLE, "2026-10-25")).toEqual([]);
  });

  it("offers each hour with its subject for one day", () => {
    const options = hourOptions(TIMETABLE, WED);
    expect(options).toHaveLength(6);
    expect(options[1]).toEqual({ hour: 2, start: "09:50", subject: { code: "DAA", title: TITLES.DAA } });
  });

  it("offers every hour across a range, with a subject only when it is the same each day", () => {
    // Saturday and Sunday: Saturday has hours 1-3, Sunday none.
    expect(hourOptions(TIMETABLE, "2026-10-24", "2026-10-25").map((o) => o.subject?.code)).toEqual(["DAA", "CN", "DBMS"]);
    // Monday and Tuesday share nothing in hour 1.
    const two = hourOptions(TIMETABLE, "2026-10-19", TUE);
    expect(two.map((o) => o.hour)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(two[0]!.subject).toBeUndefined();
    expect(two[6]!.subject).toBeUndefined(); // only Tuesday has hour 7
    expect(hourOptions(TIMETABLE, "bad")).toEqual([]);
  });

  it("shortens long subject titles to initials", () => {
    expect(shortTitle("Design and Analysis of Algorithms")).toBe("DAA");
    expect(shortTitle("Database Management Systems")).toBe("DBMS");
    expect(shortTitle("Web Technology Laboratory")).toBe("WTL");
    expect(shortTitle("Physics")).toBe("Physics");
  });
});

/* --------------------------- ERP comparison --------------------------- */

describe("checkEntry", () => {
  it("still absent: not updated yet, with the hours, subjects and days waited", () => {
    const check = checkEntry(entry(), ERP, TIMETABLE, TODAY);
    expect(check.status).toBe("pending");
    expect(check.hours).toHaveLength(7);
    expect(check.hours[0]).toEqual({ date: TUE, hour: 1, code: "WTL", title: TITLES.WTL, status: "pending" });
    expect(check.pendingSince).toBe(TUE);
    expect(check.pendingDays).toBe(8);
    expect(check.followUp).toBe(true);
    expect(check.fromLastCheck).toBe(false);
  });

  it("flags a follow-up only after more than a week", () => {
    expect(checkEntry(entry(), ERP, TIMETABLE, "2026-10-27").followUp).toBe(false); // 7 days
    expect(checkEntry(entry(), ERP, TIMETABLE, "2026-10-28").followUp).toBe(true); // 8 days
  });

  it("present now: updated in the ERP", () => {
    const check = checkEntry(entry({ from: "2026-10-27", to: "2026-10-27" }), ERP, TIMETABLE, TODAY);
    expect(check.status).toBe("updated");
    expect(check.pendingDays).toBeNull();
    expect(check.followUp).toBe(false);
  });

  it("partly updated is still pending, counting from the oldest absent date", () => {
    const erp = erpHours([day(TUE, [1, 2, 3], [4, 5, 6, 7]), day("2026-10-21", [], [1, 2])], [{ from: "2026-10-15", to: TODAY }]);
    const check = checkEntry(entry({ to: "2026-10-21" }), erp, TIMETABLE, TODAY);
    expect(check.status).toBe("pending");
    expect(check.hours.filter((h) => h.status === "updated")).toHaveLength(3);
    expect(check.pendingSince).toBe(TUE);
  });

  it("covers only the chosen hours", () => {
    const check = checkEntry(entry({ from: WED, to: WED, hours: [2] }), ERP_WITH_OLDER, TIMETABLE, TODAY);
    expect(check.status).toBe("pending");
    expect(check.hours).toEqual([{ date: WED, hour: 2, code: "DAA", title: TITLES.DAA, status: "pending" }]);
  });

  it("drops chosen hours with no class that day", () => {
    const check = checkEntry(entry({ from: "2026-10-27", to: "2026-10-27", hours: [9] }), ERP, TIMETABLE, TODAY);
    expect(check.hours).toEqual([]);
    expect(check.status).toBe("no-classes");
  });

  it("hours the faculty has not entered yet", () => {
    const check = checkEntry(entry({ from: TODAY, to: TODAY }), ERP, TIMETABLE, TODAY);
    expect(check.status).toBe("not-entered");
    expect(check.hours.map((h) => h.status)).toEqual(["updated", "updated", "not-entered", "not-entered", "not-entered", "not-entered"]);
  });

  it("a date the ERP has no record for yet reads as not entered", () => {
    expect(checkEntry(entry({ from: "2026-10-26", to: "2026-10-26" }), ERP, TIMETABLE, TODAY).status).toBe("not-entered");
  });

  it("future dates are upcoming", () => {
    const check = checkEntry(entry({ from: "2026-10-30", to: "2026-10-31" }), ERP, TIMETABLE, TODAY);
    expect(check.status).toBe("upcoming");
    expect(check.hours).toHaveLength(9); // Friday 6 + Saturday 3
  });

  it("dates that are not loaded are unchecked, or show the last visit's status", () => {
    const old = entry({ from: "2026-10-06", to: "2026-10-06" });
    expect(checkEntry(old, ERP, TIMETABLE, TODAY).status).toBe("unchecked");
    const remembered = checkEntry(
      { ...old, last: { status: "pending", since: "2026-10-06", on: "2026-10-10" } },
      ERP,
      TIMETABLE,
      TODAY,
    );
    expect(remembered).toMatchObject({ status: "pending", pendingSince: "2026-10-06", pendingDays: 22, followUp: true, fromLastCheck: true });
  });

  it("skips holidays inside a range once the ERP has posted the other days", () => {
    // 2026-10-24 (Saturday) has no record although the range is loaded; 25th is a Sunday.
    const check = checkEntry(entry({ from: "2026-10-23", to: "2026-10-26" }), erpHours([day("2026-10-23", range(1, 6))], [{ from: "2026-10-15", to: TODAY }]), TIMETABLE, TODAY);
    expect([...new Set(check.hours.map((h) => h.date))]).toEqual(["2026-10-23"]);
    expect(check.status).toBe("updated");
  });

  it("works from counts when the ERP does not name the hours", () => {
    const counts = (absent: number, notGiven = 0): HourlyDay => ({ date: TUE, totalHours: 7, present: 7 - absent - notGiven, absent, notGiven });
    const at = (d: HourlyDay) => checkEntry(entry({ hours: [3] }), erpHours([d]), TIMETABLE, TODAY).status;
    expect(at(counts(0))).toBe("updated");
    expect(at(counts(2))).toBe("pending");
    expect(at(counts(0, 2))).toBe("not-entered");
  });

  it("uses the ERP's own hours for a whole day when it names them", () => {
    // A special day: the ERP lists 3 hours although the timetable has 7.
    const hours = entryHours(entry(), erpHours([day(TUE, [], [1, 2, 3])]), TIMETABLE, TODAY);
    expect(hours.map((h) => h.hour)).toEqual([1, 2, 3]);
  });
});

describe("remembering the ERP's answer", () => {
  it("saves the first status, keeps it while unchanged, and notes a change", () => {
    const e = entry();
    const pending = checkEntry(e, ERP, TIMETABLE, TODAY);
    const first = nextLastSeen(e, pending, TODAY);
    expect(first).toEqual({ status: "pending", since: TUE, on: TODAY });
    const saved = { ...e, last: first };
    expect(nextLastSeen(saved, pending, "2026-10-29")).toBe(first);

    const updatedErp = erpHours([day(TUE, range(1, 7))], [{ from: "2026-10-15", to: TODAY }]);
    const updated = checkEntry(saved, updatedErp, TIMETABLE, "2026-10-30");
    const next = nextLastSeen(saved, updated, "2026-10-30");
    expect(next).toEqual({ status: "updated", since: null, on: "2026-10-30", was: "pending" });
    expect(justUpdated({ last: next }, "2026-10-30")).toBe(true);
    expect(justUpdated({ last: next }, "2026-10-31")).toBe(false);
  });

  it("is not a celebration when the hours were present from the start", () => {
    const e = entry({ from: "2026-10-27", to: "2026-10-27" });
    const next = nextLastSeen(e, checkEntry(e, ERP, TIMETABLE, TODAY), TODAY);
    expect(next).toEqual({ status: "updated", since: null, on: TODAY });
    expect(justUpdated({ last: next }, TODAY)).toBe(false);
  });

  it("does not overwrite with a status it could not check", () => {
    const e = entry({ from: "2026-10-06", to: "2026-10-06", last: { status: "pending", since: "2026-10-06", on: "2026-10-07" } });
    expect(nextLastSeen(e, checkEntry(e, ERP, TIMETABLE, TODAY), TODAY)).toBe(e.last);
    const fresh = entry({ from: "2026-11-02", to: "2026-11-02" });
    expect(nextLastSeen(fresh, checkEntry(fresh, ERP, TIMETABLE, TODAY), TODAY)).toBeUndefined();
  });
});

describe("odSummary", () => {
  it("counts entries still absent and the oldest one's age", () => {
    const entries = [
      entry(),
      entry({ id: "e2", from: "2026-10-27", to: "2026-10-27" }),
      entry({ id: "e3", from: "2026-10-06", to: "2026-10-06", last: { status: "pending", since: "2026-10-06", on: "2026-10-07" } }),
      entry({ id: "e4", from: "2026-11-02", to: "2026-11-02" }),
    ];
    expect(odSummary(entries, HOURLY, TIMETABLE, { today: TODAY, from: "2026-10-15" })).toEqual({ pending: 2, oldestPendingDays: 22 });
    expect(odSummary([], HOURLY, TIMETABLE, { today: TODAY })).toEqual({ pending: 0, oldestPendingDays: null });
  });

  it("reads coverage from the days it is given", () => {
    expect(odSummary([entry()], HOURLY, TIMETABLE, { today: TODAY })).toEqual({ pending: 1, oldestPendingDays: 8 });
    expect(odSummary([entry()], [], TIMETABLE, { today: TODAY })).toEqual({ pending: 0, oldestPendingDays: null });
  });
});

describe("odFetchRange", () => {
  const WINDOW = "2026-10-15";

  it("asks for nothing when the dashboard's days cover every entry", () => {
    expect(odFetchRange([entry()], WINDOW, TODAY)).toBeNull();
    expect(odFetchRange([], WINDOW, TODAY)).toBeNull();
  });

  it("asks for the older part of the entries that need it", () => {
    const entries = [
      entry({ id: "a", from: "2026-10-06", to: "2026-10-06" }),
      entry({ id: "b", from: "2026-10-12", to: "2026-10-16" }),
      entry({ id: "c", from: "2026-09-20", to: "2026-09-21", last: { status: "updated", since: null, on: "2026-09-30" } }),
      entry({ id: "d", from: "2026-11-02", to: "2026-11-02" }),
    ];
    expect(odFetchRange(entries, WINDOW, TODAY)).toEqual({ from: "2026-10-06", to: "2026-10-14" });
  });

  it(`keeps to the newest ${OD_FETCH_MAX_DAYS} days`, () => {
    const entries = [entry({ id: "a", from: "2026-03-02", to: "2026-03-02" }), entry({ id: "b", from: "2026-10-10", to: "2026-10-10" })];
    const r = odFetchRange(entries, WINDOW, TODAY)!;
    expect(r.to).toBe("2026-10-10");
    expect(daysBetween(r.from, r.to) + 1).toBe(OD_FETCH_MAX_DAYS);
  });

  it("asks up to today when the dashboard's hour-wise section did not load", () => {
    expect(odFetchRange([entry()], null, TODAY)).toEqual({ from: TUE, to: TUE });
    expect(odFetchRange([entry({ to: "2026-11-01" })], null, TODAY)).toEqual({ from: TUE, to: TODAY });
  });
});

/* ------------------------------ projection ----------------------------- */

describe("odProjection", () => {
  const items = (...entries: OdEntry[]) => entries.map((e) => ({ entry: e, check: checkEntry(e, ERP_WITH_OLDER, TIMETABLE, TODAY) }));

  it("moves still-absent hours to attended and keeps the total", () => {
    const p = odProjection(items(entry()), SUBJECTS, 80);
    const wtl = p.rows.find((r) => r.code === "WTL")!;
    expect(wtl).toMatchObject({ attended: 22, total: 24, hours: 2, verdict: "above" });
    expect(wtl.after).toBe(100);
    expect(p.rows.map((r) => r.code)).toEqual(["PQT", "DBMS", "SE", "OS", "CN", "WTL"]); // lowest now first
    expect(p.rows.find((r) => r.code === "CN")!.after).toBeCloseTo((43 / 48) * 100);
    expect(p.overall!.now).toBeCloseTo((249 / 307) * 100);
    expect(p.overall!.after).toBeCloseTo((256 / 307) * 100);
  });

  it("says when a subject is still below the threshold, and when it gets back to it", () => {
    // DAA: 30 of 48 (62.5%); four DAA hours bring it to 34 of 48 (70.8%).
    const daa = [WED, "2026-10-05", "2026-10-07", "2026-10-09"];
    const erp = erpHours(
      daa.map((d) => day(d, [], [1, 2, 3, 4, 5, 6])),
      [{ from: "2026-10-01", to: TODAY }],
    );
    const list = [
      entry({ id: "a", from: WED, to: WED, hours: [2] }), // Wednesday hour 2
      entry({ id: "b", from: "2026-10-05", to: "2026-10-05", hours: [5] }), // Monday hour 5
      entry({ id: "c", from: "2026-10-07", to: "2026-10-07", hours: [2] }),
      entry({ id: "d", from: "2026-10-09", to: "2026-10-09", hours: [4] }), // Friday hour 4
    ].map((e) => ({ entry: e, check: checkEntry(e, erp, TIMETABLE, TODAY) }));
    const row = odProjection(list, SUBJECTS, 80).rows[0]!;
    expect(row).toMatchObject({ code: "DAA", hours: 4, verdict: "still-below" });
    expect(row.after).toBeCloseTo((34 / 48) * 100);
    expect(odProjection(list, SUBJECTS, 70).rows[0]!.verdict).toBe("back-above");
  });

  it("counts an hour two entries share once, and leaves out entries that do not count", () => {
    const p = odProjection(
      items(
        entry({ id: "a", hours: [3] }),
        entry({ id: "b", hours: [3, 4] }),
        entry({ id: "c", kind: "medical", counted: false, hours: [4, 5] }),
      ),
      SUBJECTS,
      80,
    );
    expect(p.rows.map((r) => [r.code, r.hours])).toEqual([
      ["OS", 1],
      ["CN", 1],
    ]);
    expect(p.uncounted).toBe(1); // hour 5; hour 4 is counted through entry b
  });

  it("matches subjects by title when codes differ, and reports what it cannot match", () => {
    const renamed = SUBJECTS.map((s) => ({ ...s, code: `X${s.code}` })).filter((s) => s.code !== "XSE");
    const p = odProjection(items(entry({ hours: [3, 7] })), renamed, 80);
    expect(p.rows.map((r) => r.code)).toEqual(["XCN"]);
    expect(p.unmatched).toBe(1);
  });

  it("never goes past the total, and is empty with nothing pending", () => {
    const full = [{ code: "WTL", title: TITLES.WTL!, attended: 24, totalClasses: 24 }];
    expect(odProjection(items(entry({ hours: [1, 2] })), full, 80).rows[0]!.after).toBe(100);
    expect(odProjection(items(entry({ from: "2026-10-27", to: "2026-10-27" })), SUBJECTS, 80)).toEqual({
      rows: [],
      overall: null,
      uncounted: 0,
      unmatched: 0,
    });
  });
});

/* ------------------------------- wording ------------------------------- */

describe("wording", () => {
  it("formats hour lists", () => {
    expect(formatHourList([1, 2, 3, 5])).toBe("1–3, 5");
    expect(formatHourList([2, 3])).toBe("2, 3");
    expect(formatHourList([7, 1, 1])).toBe("1, 7");
    expect(hoursLabel([2])).toBe("Hour 2");
    expect(hoursLabel([1, 2, 3, 4, 5, 6, 7])).toBe("Hours 1–7");
  });

  it("labels dates and hours", () => {
    expect(entryDateLabel(entry())).toBe("Tue, 20 Oct");
    expect(entryDateLabel(entry({ from: "2026-10-05", to: "2026-10-07" }))).toBe("Mon, 5 Oct to Wed, 7 Oct");
    expect(entryHoursLabel(entry())).toBe("Whole day");
    expect(entryHoursLabel(entry({ hours: [5, 6] }))).toBe("Hours 5, 6");
  });

  it("counts subjects in hour order", () => {
    expect(subjectCounts(checkEntry(entry(), ERP, TIMETABLE, TODAY).hours).slice(0, 2)).toEqual([
      { title: TITLES.WTL, count: 2 },
      { title: TITLES.CN, count: 1 },
    ]);
  });
});

describe("advisorText", () => {
  it("lists entries still absent, oldest first, with hours, subjects and notes", () => {
    const list = [
      entry({ id: "a", note: "Hackathon at IIT Madras" }),
      entry({ id: "b", kind: "medical", from: WED, to: WED, hours: [2], counted: false }),
      entry({ id: "c", from: "2026-10-27", to: "2026-10-27" }), // updated: left out
    ].map((e) => ({ entry: e, check: checkEntry(e, ERP_WITH_OLDER, TIMETABLE, TODAY) }));
    expect(advisorText(list, { name: "Arjun Ramkumar", registerNumber: "41110234" })).toBe(
      [
        "OD and leave not yet updated in the ERP",
        "Arjun Ramkumar, 41110234",
        "",
        "1. Medical leave: Wed, 14 Oct",
        "   Hour 2: Design and Analysis of Algorithms",
        "",
        "2. On duty: Tue, 20 Oct",
        "   Hours 1–7: Web Technology Laboratory, Computer Networks, Operating Systems, Probability and Queueing Theory, Database Management Systems, Software Engineering",
        "   Note: Hackathon at IIT Madras",
      ].join("\n"),
    );
  });

  it("puts the date on each line for a range, and lists only hours still absent", () => {
    const erp = erpHours([day(TUE, [1, 2, 3, 4, 5], [6, 7]), day("2026-10-21", [], [1, 2, 3, 4, 5, 6])], [{ from: "2026-10-15", to: TODAY }]);
    const e = entry({ to: "2026-10-21" });
    expect(advisorText([{ entry: e, check: checkEntry(e, erp, TIMETABLE, TODAY) }])).toBe(
      [
        "OD and leave not yet updated in the ERP",
        "",
        "1. On duty: Tue, 20 Oct to Wed, 21 Oct",
        "   Tue, 20 Oct, hours 6, 7: Database Management Systems, Software Engineering",
        "   Wed, 21 Oct, hours 1–6: Probability and Queueing Theory, Design and Analysis of Algorithms, Software Engineering, Computer Networks, Operating Systems, Database Management Systems",
      ].join("\n"),
    );
  });

  it("is empty when nothing is pending", () => {
    expect(advisorText([])).toBe("");
  });
});

describe("recentAbsences", () => {
  it("suggests recent absent days that no entry covers, newest first", () => {
    expect(recentAbsences(HOURLY, [], TODAY)).toEqual([
      { date: TUE, hours: range(1, 7), wholeDay: true, absent: 7 },
      { date: WED, hours: [2], wholeDay: false, absent: 1 },
    ]);
    expect(recentAbsences(HOURLY, [], TODAY, 1)).toHaveLength(1);
  });

  it("leaves out days already logged", () => {
    expect(recentAbsences(HOURLY, [entry()], TODAY).map((s) => s.date)).toEqual([WED]);
    expect(recentAbsences(HOURLY, [entry({ from: WED, to: WED, hours: [2] })], TODAY).map((s) => s.date)).toEqual([TUE]);
    // Logging a different hour does not cover the absent one.
    expect(recentAbsences(HOURLY, [entry({ from: WED, to: WED, hours: [3] })], TODAY).map((s) => s.date)).toEqual([TUE, WED]);
  });
});
