import { describe, expect, it } from "vitest";
import type { Assignment, AttendanceSubject, CalendarEvent, SubjectMarks, TimetableSlot } from "@usp/core";
import {
  attendanceLine,
  buildBrief,
  campusDayKey,
  dueLines,
  examLine,
  markKey,
  marksLine,
  noticeMarks,
  odLine,
  parseBriefMemory,
  readBriefCookie,
  selectLines,
  serializeBriefMemory,
  shortHash,
  type BriefLine,
  type BriefMemory,
} from "../brief";

/** Wednesday 28 Oct 2026 (timetable day 2), at a campus time. */
const wed = (hhmm: string) => new Date(`2026-10-28T${hhmm}:00+05:30`);

const subj = (code: string, title: string, attended: number, totalClasses: number): AttendanceSubject => ({
  code,
  title,
  attended,
  totalClasses,
  percentage: (attended / totalClasses) * 100,
});

const slot = (day: number, startTime: string, endTime: string, courseCode: string, courseTitle = courseCode): TimetableSlot => ({
  day,
  startTime,
  endTime,
  courseCode,
  courseTitle,
});

const DBMS = subj("SCSA5103", "Database Management Systems", 38, 48); // 79.17%, below 80
const CN = subj("SCSA5101", "Computer Networks", 42, 48); // 87.5%, safe
const OS = subj("SCSA5102", "Operating Systems", 33, 40); // 82.5%, close
const LAB = subj("SCSA5106", "Web Technology Laboratory", 19, 24); // 79.17%, below
const opts = { threshold: 80, timeFormat: "12h" as const };

describe("attendanceLine", () => {
  it("names an at-risk subject with a class later today, with its time and percentage", () => {
    const line = attendanceLine([DBMS, CN], [slot(2, "14:20", "15:10", "SCSA5103"), slot(2, "09:00", "09:50", "SCSA5101")], wed("08:00"), opts);
    expect(line).toMatchObject({
      kind: "attendance",
      tone: "danger",
      text: "Attend Database Management Systems at 2:20 pm, you're at 79.2%",
      href: "/attendance",
    });
    expect(line?.detail).toBeUndefined();
  });

  it("counts two separate classes, but a lab block as one", () => {
    const two = attendanceLine([DBMS], [slot(2, "09:00", "09:50", "SCSA5103"), slot(2, "14:20", "15:10", "SCSA5103")], wed("08:00"), opts);
    expect(two?.text).toBe("Attend both Database Management Systems classes today, you're at 79.2%");
    const lab = attendanceLine([LAB], [slot(2, "09:00", "09:50", "SCSA5106"), slot(2, "09:50", "10:40", "SCSA5106")], wed("08:00"), opts);
    expect(lab?.text).toBe("Attend Web Technology Laboratory at 9:00 am, you're at 79.2%");
  });

  it("skips classes that are over, and says now for one in progress", () => {
    const tt = [slot(2, "09:00", "09:50", "SCSA5103"), slot(2, "14:20", "15:10", "SCSA5103")];
    expect(attendanceLine([DBMS], tt, wed("10:00"), opts)?.text).toBe("Attend Database Management Systems at 2:20 pm, you're at 79.2%");
    expect(attendanceLine([DBMS], tt, wed("14:30"), opts)?.text).toBe("Attend Database Management Systems now, you're at 79.2%");
    expect(attendanceLine([DBMS], tt, wed("15:10"), opts)).toBeNull();
  });

  it("leaves out safe subjects and at-risk subjects with no class today", () => {
    expect(attendanceLine([CN], [slot(2, "09:00", "09:50", "SCSA5101")], wed("08:00"), opts)).toBeNull();
    expect(attendanceLine([DBMS], [slot(3, "09:00", "09:50", "SCSA5103")], wed("08:00"), opts)).toBeNull();
  });

  it("puts the worst subject first and lists the rest", () => {
    const tt = [slot(2, "09:00", "09:50", "SCSA5102"), slot(2, "11:00", "11:50", "SCSA5103"), slot(2, "13:30", "14:20", "SCSA5106")];
    const line = attendanceLine([OS, DBMS, LAB], tt, wed("08:00"), opts);
    expect(line?.text).toMatch(/^Attend (Database Management Systems|Web Technology Laboratory) at/);
    expect(line?.tone).toBe("danger");
    expect(line?.detail).toBe("Also attend 2 other at-risk subjects today");
    const two = attendanceLine([OS, DBMS], tt, wed("08:00"), opts);
    expect(two?.detail).toBe("Also attend Operating Systems today");
  });

  it("goes by the campus day, not the server's", () => {
    // 19:00 UTC on Tuesday is 00:30 on Wednesday on campus.
    const now = new Date("2026-10-27T19:00:00Z");
    const tt = [slot(1, "14:20", "15:10", "SCSA5103"), slot(2, "09:00", "09:50", "SCSA5103")];
    expect(attendanceLine([DBMS], tt, now, opts)?.text).toBe("Attend Database Management Systems at 9:00 am, you're at 79.2%");
  });

  it("follows the 24-hour clock preference", () => {
    const line = attendanceLine([DBMS], [slot(2, "14:20", "15:10", "SCSA5103")], wed("08:00"), { threshold: 80, timeFormat: "24h" });
    expect(line?.text).toContain("at 14:20,");
  });
});

const assignment = (id: number, dueDate: string | null, submitted = false, name = `Lab ${id}`): Assignment => ({
  id,
  courseId: 104,
  courseName: "Computer Networks",
  name,
  dueDate,
  submitted,
  grade: null,
});

const event = (id: string, type: CalendarEvent["type"], date: string, title = id, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  title,
  date,
  source: "lms",
  type,
  ...extra,
});

describe("dueLines", () => {
  /** Monday 26 Oct, 23:30 on campus. */
  const now = new Date("2026-10-26T23:30:00+05:30");

  it("lists unsubmitted work due in the next 48 hours, soonest first, linking to the assignment", () => {
    const lines = dueLines(
      [
        assignment(2, "2026-10-28T23:00:00+05:30"), // 47.5 hours away
        assignment(1, "2026-10-27T00:30:00+05:30"), // 1 hour away, after campus midnight
      ],
      [],
      now,
    );
    expect(lines.map((l) => l.text)).toEqual([
      "Submit Lab 1 by 12:30 am tomorrow",
      "Submit Lab 2 by 11:00 pm on Wednesday",
    ]);
    expect(lines[0]).toMatchObject({ kind: "assignment", detail: "Computer Networks", href: "/courses/104/assignments/1" });
  });

  it("leaves out submitted work, past deadlines and anything past 48 hours", () => {
    const lines = dueLines(
      [
        assignment(1, "2026-10-27T23:59:00+05:30", true),
        assignment(2, "2026-10-26T23:00:00+05:30"),
        assignment(3, "2026-10-28T23:45:00+05:30"), // 48.25 hours away
        assignment(4, null),
      ],
      [],
      now,
    );
    expect(lines).toEqual([]);
  });

  it("says today for work due before campus midnight", () => {
    const morning = new Date("2026-10-27T08:00:00+05:30");
    expect(dueLines([assignment(1, "2026-10-27T23:59:00+05:30")], [], morning)[0]?.text).toBe("Submit Lab 1 by 11:59 pm today");
    // A date with no time is due by the end of that day.
    expect(dueLines([assignment(2, "2026-10-28")], [], morning)[0]?.text).toBe("Submit Lab 2 by tomorrow");
  });

  it("adds deadlines only Moodle's calendar knows, but not copies of the assignments", () => {
    const a = { ...assignment(1, "2026-10-27T23:59:00+05:30"), url: "https://lms/mod/assign/view.php?id=1" };
    const lines = dueLines(
      [a],
      [
        event("assignment:1", "assignment", a.dueDate!, a.name),
        event("evt-1", "assignment", a.dueDate!, "Due: Lab 1", { url: a.url }),
        event("evt-quiz", "assignment", "2026-10-27T18:00:00+05:30", "Due: Quiz 2", { courseName: "Operating Systems" }),
        event("evt-exam", "exam", "2026-10-27T10:00:00+05:30"),
      ],
      now,
    );
    expect(lines.map((l) => l.text)).toEqual(["Submit Quiz 2 by 6:00 pm tomorrow", "Submit Lab 1 by 11:59 pm tomorrow"]);
    expect(lines[0]).toMatchObject({ detail: "Operating Systems", href: "/courses" });
  });

  it("counts the rest in one line when more than two are due", () => {
    const lines = dueLines(
      [1, 2, 3].map((i) => assignment(i, `2026-10-27T1${i}:00:00+05:30`)),
      [],
      now,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]?.text).toBe("Submit Lab 1 by 11:00 am tomorrow");
    expect(lines[1]).toMatchObject({ text: "Submit 2 more assignments due in the next 2 days", detail: "Lab 2 and Lab 3" });
  });
});

const marks = (code: string, title: string, comps: [string, number, number | null][]): SubjectMarks => ({
  code,
  title,
  components: comps.map(([name, max, scored]) => ({ name, max, scored })),
  total: null,
  maxTotal: null,
});

describe("noticeMarks", () => {
  const before = [marks("SCSA5103", "Database Management Systems", [["CIA-1", 20, 18], ["CIA-2", 20, null]])];
  const after = [marks("SCSA5103", "Database Management Systems", [["CIA-1", 20, 18], ["CIA-2", 20, 19]])];
  const who = { user: "u1", today: "2026-10-28" };

  it("treats everything as seen on the first visit", () => {
    const r = noticeMarks(after, {}, who);
    expect(r.fresh).toEqual([]);
    expect(r.memory.seen).toEqual([markKey("SCSA5103", "CIA-1", 18, 20), markKey("SCSA5103", "CIA-2", 19, 20)]);
    expect(r.memory.user).toBe("u1");
  });

  it("finds marks graded since the last visit and keeps them new for the rest of the day", () => {
    const first = noticeMarks(before, {}, who).memory;
    const visit = noticeMarks(after, first, who);
    expect(visit.fresh.map((m) => `${m.name} ${m.scored}/${m.max}`)).toEqual(["CIA-2 19/20"]);
    expect(visit.memory.fresh).toEqual({ day: "2026-10-28", keys: [markKey("SCSA5103", "CIA-2", 19, 20)] });

    expect(noticeMarks(after, visit.memory, who).fresh).toHaveLength(1);
    expect(noticeMarks(after, visit.memory, { ...who, today: "2026-10-29" }).fresh).toEqual([]);
  });

  it("counts a corrected score as new", () => {
    const seen = noticeMarks(after, {}, who).memory;
    const corrected = [marks("SCSA5103", "Database Management Systems", [["CIA-1", 20, 17], ["CIA-2", 20, 19]])];
    expect(noticeMarks(corrected, seen, who).fresh.map((m) => m.scored)).toEqual([17]);
  });

  it("keeps the memory when no marks loaded, so nothing looks new next time", () => {
    const seen = noticeMarks(after, {}, who).memory;
    const r = noticeMarks([], seen, who);
    expect(r).toEqual({ fresh: [], memory: seen });
    expect(noticeMarks(after, r.memory, who).fresh).toEqual([]);
  });

  it("starts over for another student on the same browser", () => {
    const seen = noticeMarks(before, {}, who).memory;
    const r = noticeMarks(after, seen, { ...who, user: "u2" });
    expect(r.fresh).toEqual([]);
    expect(r.memory.user).toBe("u2");
  });
});

describe("marksLine", () => {
  const one = { key: "k1", code: "SCSA5103", title: "Database Management Systems", name: "CIA-2", scored: 19, max: 20 };
  it("names a single new mark and links to its subject", () => {
    expect(marksLine([one])).toMatchObject({
      text: "See your CIA-2 mark for Database Management Systems: 19/20",
      href: "/marks#m-SCSA5103",
    });
  });

  it("counts several, naming the first two", () => {
    const line = marksLine([one, { ...one, key: "k2", name: "CIA-1" }, { ...one, key: "k3", title: "Operating Systems" }]);
    expect(line).toMatchObject({ text: "See 3 new marks", href: "/marks" });
    expect(line?.detail).toBe("CIA-2 for Database Management Systems, CIA-1 for Database Management Systems and 1 more");
    expect(marksLine([])).toBeNull();
  });
});

describe("odLine", () => {
  it("counts ODs still absent in the ERP, and nudges once one has waited a week", () => {
    expect(odLine({ pending: 0, oldestDays: null })).toBeNull();
    expect(odLine(null)).toBeNull();
    expect(odLine({ pending: 1, oldestDays: 2 })).toMatchObject({ text: "Check an OD not updated in the ERP yet", href: "/attendance/od" });
    const late = odLine({ pending: 2, oldestDays: 9 });
    expect(late?.text).toBe("Check 2 ODs not updated in the ERP yet");
    expect(late?.detail).toBe("The oldest has waited 9 days, time to follow it up");
    expect(late?.tone).toBe("warning");
  });
});

describe("examLine", () => {
  const exam = (date: string) => [event("cia2", "exam", date, "CIA-2 Examination: Operating Systems", { courseName: "Operating Systems" })];

  it("links an exam within two weeks to its prep page, with the countdown", () => {
    const line = examLine(exam("2026-11-08T10:00:00+05:30"), wed("08:00"), { examCode: () => "SCSA5102" });
    expect(line).toMatchObject({
      kind: "exam",
      text: "Prepare for CIA-2 Examination: Operating Systems",
      detail: "In 11 days, Sun 8 Nov",
      href: "/prep/SCSA5102",
      tone: "primary",
    });
  });

  it("says today or tomorrow with the time, and falls back to the prep list", () => {
    expect(examLine(exam("2026-10-28T14:00:00+05:30"), wed("08:00"))).toMatchObject({ detail: "Today at 2:00 pm", href: "/prep", tone: "warning" });
    expect(examLine(exam("2026-10-29T10:00:00+05:30"), wed("08:00"))?.detail).toBe("Tomorrow at 10:00 am");
  });

  it("leaves out exams more than two weeks away, and ones already over", () => {
    expect(examLine(exam("2026-11-12T10:00:00+05:30"), wed("08:00"))).toBeNull();
    expect(examLine(exam("2026-11-11T10:00:00+05:30"), wed("08:00"))).not.toBeNull();
    expect(examLine(exam("2026-10-28T07:00:00+05:30"), wed("08:00"))).toBeNull();
  });
});

describe("selectLines", () => {
  const line = (kind: BriefLine["kind"], id: string = kind): BriefLine => ({ id, kind, tone: "primary", text: id, href: "/" });

  it("orders by urgency and keeps four, the exam always among them", () => {
    const picked = selectLines([line("exam"), line("od"), line("marks"), line("assignment", "a1"), line("assignment", "a2"), line("attendance")]);
    expect(picked.map((l) => l.id)).toEqual(["attendance", "a1", "a2", "exam"]);
    expect(selectLines([line("od"), line("attendance")]).map((l) => l.id)).toEqual(["attendance", "od"]);
    expect(selectLines([])).toEqual([]);
  });
});

describe("brief memory", () => {
  it("round-trips through the cookie format and drops what it cannot read", () => {
    const m: BriefMemory = {
      user: shortHash("41110234"),
      dismissed: "2026-10-28",
      seen: ["abc", "1x2y"],
      fresh: { day: "2026-10-28", keys: ["abc"] },
      od: { pending: 2, oldestDays: null },
    };
    const raw = serializeBriefMemory(m);
    expect(raw).toMatch(/^[0-9a-z._-]+$/);
    expect(parseBriefMemory(raw)).toEqual(m);
    expect(parseBriefMemory("d.yesterday_s.ok.NOT!_o.-1.x_zz")).toEqual({ seen: ["ok"] });
    expect(parseBriefMemory(undefined)).toEqual({});
    expect(readBriefCookie(`a=1; usp-brief-v1=${raw}; b=2`)).toEqual(m);
  });

  it("keys the day on the campus calendar", () => {
    expect(campusDayKey(new Date("2026-10-27T19:00:00Z"))).toBe("2026-10-28");
  });
});

describe("buildBrief", () => {
  const data = {
    profile: { registerNumber: "41110234", name: "A", program: "", department: "", semester: 5 },
    attendance: [DBMS],
    timetable: [slot(2, "14:20", "15:10", "SCSA5103", "Database Management Systems")],
    marks: [marks("SCSA5103", "Database Management Systems", [["CIA-1", 20, 18]])],
    assignments: [assignment(1, "2026-10-28T23:59:00+05:30")],
    events: [event("cia2", "exam", "2026-11-08T10:00:00+05:30", "CIA-2 Examination: Operating Systems")],
  };
  const base = { data, now: wed("08:00"), threshold: 80, timeFormat: "12h" as const, memory: {} };
  const user = shortHash("41110234");

  it("gathers today's lines and the memory to keep", () => {
    const b = buildBrief(base);
    expect(b.dismissed).toBe(false);
    expect(b.today).toBe("2026-10-28");
    expect(b.lines.map((l) => l.kind)).toEqual(["attendance", "assignment", "exam"]);
    expect(b.examInBrief).toBe(true);
    expect(b.memory).toMatchObject({ user, seen: [markKey("SCSA5103", "CIA-1", 18, 20)] });
  });

  it("is empty for the rest of a dismissed day, and comes back the next", () => {
    const dismissed = buildBrief({ ...base, memory: { user, dismissed: "2026-10-28" } });
    expect(dismissed).toMatchObject({ dismissed: true, lines: [], examInBrief: false });
    const nextDay = buildBrief({ ...base, memory: { user, dismissed: "2026-10-27" } });
    expect(nextDay.dismissed).toBe(false);
    expect(nextDay.memory.dismissed).toBeUndefined();
    // Another student's dismissal on this browser does not hide this one's brief.
    expect(buildBrief({ ...base, memory: { user: "other", dismissed: "2026-10-28" } }).dismissed).toBe(false);
  });

  it("drops the attendance line on a holiday", () => {
    expect(buildBrief({ ...base, holiday: true }).lines.map((l) => l.kind)).toEqual(["assignment", "exam"]);
  });

  it("has nothing to say on a quiet day", () => {
    const quiet = buildBrief({ ...base, data: { ...data, attendance: [CN], assignments: [], events: [] } });
    expect(quiet.lines).toEqual([]);
    expect(quiet.examInBrief).toBe(false);
  });
});
