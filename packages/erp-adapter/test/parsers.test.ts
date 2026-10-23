import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SELECTORS,
  ParseError,
  dayIndex,
  detectLoginFailure,
  headerMatches,
  isLoginPage,
  parseAttendance,
  parseComponentHeader,
  parseFees,
  parseFraction,
  parseLoginForm,
  parseMarks,
  parseNotifications,
  parseProfile,
  parseResults,
  parseTime,
  parseTimeRange,
  parseTimetable,
  toIsoDate,
  toIsoDateTime,
  toNumber,
  toSemester,
  type ErpSelectors,
} from "../src/parsers/index";

/**
 * Parser tests against the SYNTHETIC fixtures in ../fixtures.
 *
 * To test against a real saved page instead, point `load` at
 * captures/erp/<page>.html (or set ERP_FIXTURES_DIR) and adjust
 * src/parsers/selectors.ts until these go green. Exact-value assertions are
 * tied to the synthetic student and will need updating for real data.
 */
const FIXTURES_DIR = process.env.ERP_FIXTURES_DIR;
const load = (name: string): string =>
  FIXTURES_DIR
    ? readFileSync(`${FIXTURES_DIR}/${name}`, "utf8")
    : readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

const BASE = "https://erp.sathyabama.ac.in/Student/Page.aspx";

/** Expect `fn` to throw a ParseError for `page`. */
function expectParseError(fn: () => unknown, page: string): ParseError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ParseError);
    expect((e as ParseError).page).toBe(page);
    return e as ParseError;
  }
  throw new Error("expected a ParseError, nothing was thrown");
}

/* ======================================================================== */
describe("value normalisers", () => {
  it("toNumber handles %, fractions, currency, blanks and NA", () => {
    expect(toNumber("85.5%")).toBe(85.5);
    expect(toNumber(" 87.50 % ")).toBe(87.5);
    expect(toNumber("12 / 15")).toBe(12);
    expect(toNumber("Rs. 1,25,000.00")).toBe(125000);
    expect(toNumber("Rs.45,000")).toBe(45000);
    expect(toNumber("\u00A0")).toBeNull();
    expect(toNumber("")).toBeNull();
    expect(toNumber("-")).toBeNull();
    expect(toNumber("NA")).toBeNull();
    expect(toNumber("n/a")).toBeNull();
    expect(toNumber("-5")).toBe(-5);
    expect(toNumber("CIA-1")).toBe(1);
  });

  it("parseFraction reads 'a / b'", () => {
    expect(parseFraction("12 / 15")).toEqual({ num: 12, den: 15 });
    expect(parseFraction("38 out of 50")).toEqual({ num: 38, den: 50 });
    expect(parseFraction("42")).toBeNull();
  });

  it("toIsoDate handles dd-mm-yyyy, dd/mm/yyyy, dd-MMM-yyyy, yyyy-mm-dd", () => {
    expect(toIsoDate("05-08-2026")).toBe("2026-08-05");
    expect(toIsoDate("05/08/2026")).toBe("2026-08-05");
    expect(toIsoDate("05.08.2026")).toBe("2026-08-05");
    expect(toIsoDate("05-Aug-2026")).toBe("2026-08-05");
    expect(toIsoDate("5 August 2026")).toBe("2026-08-05");
    expect(toIsoDate("2026-08-05")).toBe("2026-08-05");
    expect(toIsoDate("Aug 5, 2026")).toBe("2026-08-05");
    expect(toIsoDate("31-02-2026")).toBeNull();
    expect(toIsoDate("-")).toBeNull();
  });

  it("toIsoDateTime adds time and IST offset", () => {
    expect(toIsoDateTime("09-Oct-2026 10:30 AM")).toBe("2026-10-09T10:30:00+05:30");
    expect(toIsoDateTime("02 Oct 2026, 2:20 pm")).toBe("2026-10-02T14:20:00+05:30");
    expect(toIsoDateTime("28/09/2026")).toBe("2026-09-28T00:00:00+05:30");
  });

  it("parseTime / parseTimeRange", () => {
    expect(parseTime("9:00 AM")).toBe("09:00");
    expect(parseTime("1:30 pm")).toBe("13:30");
    expect(parseTime("12:15 AM")).toBe("00:15");
    expect(parseTime("09:00")).toBe("09:00");
    expect(parseTime("09.00")).toBe("09:00");
    expect(parseTimeRange("09.00-09.50")).toEqual({ start: "09:00", end: "09:50" });
    expect(parseTimeRange("I 09.00 - 09.50")).toEqual({ start: "09:00", end: "09:50" });
    expect(parseTimeRange("1:00 - 1:50 PM")).toEqual({ start: "13:00", end: "13:50" });
    expect(parseTimeRange("08:00 to 08:50")).toEqual({ start: "08:00", end: "08:50" });
    expect(parseTimeRange("01.30 - 02.20", { assumePmBelowHour: 8 })).toEqual({ start: "13:30", end: "14:20" });
    expect(parseTimeRange("12.40 - 01.30", { assumePmBelowHour: 8 })).toEqual({ start: "12:40", end: "13:30" });
    expect(parseTimeRange("Lunch")).toBeNull();
  });

  it("dayIndex maps names to 0..6 with Monday = 0", () => {
    expect(dayIndex("Monday")).toBe(0);
    expect(dayIndex("TUE")).toBe(1);
    expect(dayIndex(" sat. ")).toBe(5);
    expect(dayIndex("SUNDAY")).toBe(6);
    expect(dayIndex("Day 1")).toBeNull();
    expect(dayIndex("Day 1", { "day 1": 0 })).toBe(0);
  });

  it("toSemester reads numbers and roman numerals", () => {
    expect(toSemester("V")).toBe(5);
    expect(toSemester("5")).toBe(5);
    expect(toSemester("Semester - III")).toBe(3);
    expect(toSemester("III Year / VI Sem")).toBe(6);
    expect(toSemester("5th Sem")).toBe(5);
    expect(toSemester("III / VI")).toBe(6);
    expect(toSemester("")).toBeNull();
  });

  it("headerMatches is case/whitespace/punctuation-insensitive", () => {
    expect(headerMatches("  No.\u00A0of  Present ", ["no. of present"])).toBe(true);
    expect(headerMatches("CLASSES ATTENDED", ["classes attended"])).toBe(true);
    expect(headerMatches("Percentage (%)", ["percentage"])).toBe(true);
    expect(headerMatches("Percentage (%)", ["percentage"], true)).toBe(false);
    expect(headerMatches("Total Hours", ["total"])).toBe(false);
  });
});

/* ======================================================================== */
describe("login", () => {
  it("collects hidden ASP.NET fields, user/password inputs, submit button and captcha", () => {
    const form = parseLoginForm(load("login.html"), { baseUrl: "https://erp.sathyabama.ac.in/" });
    expect(form.action).toBe("./Login.aspx");
    expect(form.method).toBe("POST");
    expect(Object.keys(form.fields)).toEqual(
      expect.arrayContaining(["__EVENTTARGET", "__EVENTARGUMENT", "__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"]),
    );
    expect(form.fields.__VIEWSTATEGENERATOR).toBe("C2EE9ABB");
    expect(form.fields.__EVENTTARGET).toBe("");
    expect(form.fields).not.toHaveProperty("txtUserName");
    expect(form.usernameField).toBe("txtUserName");
    expect(form.passwordField).toBe("txtPassword");
    expect(form.submit).toEqual({ name: "btnLogin", value: "Login" });
    expect(form.hasCaptcha).toBe(true);
    expect(form.captchaField).toBe("txtCaptcha");
    expect(form.captchaImageUrl).toMatch(/^https:\/\/erp\.sathyabama\.ac\.in\/CaptchaImage\.aspx\?guid=/);
  });

  it("reports no captcha on a plain form, and detects reCAPTCHA widgets", () => {
    const plain = `
      <form method="post" action="/auth/login">
        <input type="hidden" name="csrf_token" value="abc123">
        <input name="email" type="email" placeholder="Email">
        <input name="pwd" type="password">
        <button type="submit" name="login" value="1">Sign in</button>
      </form>`;
    const form = parseLoginForm(plain);
    expect(form.hasCaptcha).toBe(false);
    expect(form.fields).toEqual({ csrf_token: "abc123" });
    expect(form.usernameField).toBe("email");
    expect(form.passwordField).toBe("pwd");
    expect(form.submit).toEqual({ name: "login", value: "1" });

    const withWidget = plain.replace("</form>", `<div class="g-recaptcha" data-sitekey="x"></div></form>`);
    expect(parseLoginForm(withWidget).hasCaptcha).toBe(true);
  });

  it("throws ParseError when there is no form", () => {
    expectParseError(() => parseLoginForm("<html><body>Maintenance</body></html>"), "login");
  });

  it("detectLoginFailure finds error labels and alert() scripts, ignores validation functions", () => {
    const page = load("login.html");
    expect(detectLoginFailure(page)).toBeNull(); // has alert('Please enter...') only inside a function

    const withLabel = page.replace(
      `<span id="lblErrorMsg" class="text-danger"></span>`,
      `<span id="lblErrorMsg" class="text-danger">Invalid Username or Password</span>`,
    );
    expect(detectLoginFailure(withLabel)).toBe("Invalid Username or Password");

    const withAlert = page.replace(
      "</form>",
      `</form><script type="text/javascript">alert('Incorrect captcha code. Please try again.');</script>`,
    );
    expect(detectLoginFailure(withAlert)).toBe("Incorrect captcha code. Please try again.");
  });

  it("isLoginPage spots a password box (session expired redirect)", () => {
    expect(isLoginPage(load("login.html"))).toBe(true);
    expect(isLoginPage(load("profile.html"))).toBe(false);
  });
});

/* ======================================================================== */
describe("profile", () => {
  it("parses label/value pairs from tables and <label> blocks", () => {
    const p = parseProfile(load("profile.html"), { baseUrl: "https://erp.sathyabama.ac.in/StudentProfile.aspx" });
    expect(p).toEqual({
      registerNumber: "41110234",
      name: "Arjun Ramkumar",
      program: "B.E. Computer Science and Engineering",
      department: "Computer Science and Engineering",
      semester: 5,
      section: "B",
      batch: "2023-2027",
      email: "arjun.ramkumar2023@sathyabama.ac.in",
      phone: "+91 98840 11234",
      photoUrl: "https://erp.sathyabama.ac.in/photos/41110234.jpg",
      advisor: "Dr. S. Karthik",
    });
  });

  it("handles 'Label : Value' cells and other aliases", () => {
    const html = `
      <div class="profile"><table>
        <tr><td>Reg. No. : 41110999</td></tr>
        <tr><td>Student Name : Test Student</td></tr>
        <tr><td>Programme : B.Tech - Information Technology</td></tr>
        <tr><td>Year / Sem : III / VI</td></tr>
      </table></div>`;
    const p = parseProfile(html);
    expect(p.registerNumber).toBe("41110999");
    expect(p.name).toBe("Test Student");
    expect(p.program).toBe("B.Tech Information Technology");
    expect(p.department).toBe("Information Technology");
    expect(p.semester).toBe(6);
    expect(p.photoUrl).toBeUndefined();
  });

  it("throws ParseError when the register number is missing", () => {
    expectParseError(() => parseProfile("<table><tr><td>Name</td><td>X</td></tr></table>"), "profile");
  });
});

/* ======================================================================== */
describe("attendance", () => {
  it("parses every subject and skips the Total footer", () => {
    const rows = parseAttendance(load("attendance.html"));
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.code)).not.toContain("Total");
    expect(rows[0]).toEqual({
      code: "SCSA5101",
      title: "Computer Networks",
      totalClasses: 48,
      attended: 42,
      percentage: 87.5,
    });
    const dbms = rows.find((r) => r.code === "SCSA5103");
    expect(dbms?.title).toBe("Database Management Systems");
    expect(rows.find((r) => r.code === "SCSA5105")?.percentage).toBe(62.5);
  });

  it("computes the percentage when the cell is blank", () => {
    const se = parseAttendance(load("attendance.html")).find((r) => r.code === "SCSA5104");
    expect(se).toEqual({ code: "SCSA5104", title: "Software Engineering", totalClasses: 46, attended: 35, percentage: 76.09 });
  });

  it("matches columns by header alias regardless of order; computes % when there is no column", () => {
    const html = `
      <table>
        <tr><th>Present</th><th>Subject</th><th>Sub&nbsp;Code</th><th>TOTAL</th></tr>
        <tr><td>12</td><td>Compiler Design</td><td>SCSA6101</td><td>15</td></tr>
        <tr><td>9</td><td>Cloud Computing</td><td>SCSA6102</td><td>9</td></tr>
      </table>`;
    expect(parseAttendance(html)).toEqual([
      { code: "SCSA6101", title: "Compiler Design", totalClasses: 15, attended: 12, percentage: 80 },
      { code: "SCSA6102", title: "Cloud Computing", totalClasses: 9, attended: 9, percentage: 100 },
    ]);
  });

  it("reads a combined 'attended / total' column", () => {
    const html = `
      <table>
        <tr><th>Course Code</th><th>Course Name</th><th>Attended/Total</th><th>%</th></tr>
        <tr><td>SCSA6101</td><td>Compiler Design</td><td>12 / 15</td><td></td></tr>
      </table>`;
    expect(parseAttendance(html)[0]).toMatchObject({ attended: 12, totalClasses: 15, percentage: 80 });
  });

  it("throws ParseError when the table is missing or lacks number columns", () => {
    const err = expectParseError(() => parseAttendance("<html><body><p>Session expired</p></body></html>"), "attendance");
    expect(err.message).toContain("[erp:attendance]");
    expectParseError(
      () => parseAttendance("<table><tr><th>Course Code</th><th>Course Name</th></tr><tr><td>A</td><td>B</td></tr></table>"),
      "attendance",
    );
  });
});

/* ======================================================================== */
describe("marks", () => {
  it("turns each non code/title column into a component with max from the header", () => {
    const marks = parseMarks(load("marks.html"));
    expect(marks).toHaveLength(7);
    expect(marks[0]).toEqual({
      code: "SCSA5101",
      title: "Computer Networks",
      components: [
        { name: "CIA-1", max: 20, scored: 17 },
        { name: "CIA-2", max: 20, scored: 18 },
        { name: "Assignment", max: 10, scored: 9 },
        { name: "Model Exam", max: 100, scored: null },
      ],
      total: 44,
      maxTotal: 50,
    });
    const dbms = marks.find((m) => m.code === "SCSA5103");
    expect(dbms?.total).toBe(135);
    expect(dbms?.maxTotal).toBe(150);
    const maths = marks.find((m) => m.code === "SMAT5101");
    expect(maths?.components.find((c) => c.name === "Assignment")?.scored).toBeNull(); // "NA"
  });

  it("supports a separate Max Marks row, AB = 0, 'x / y' cells and a Total column", () => {
    const html = `
      <table>
        <tr><th>Code</th><th>Title</th><th>CIA-1</th><th>CIA-2</th><th>Total</th></tr>
        <tr><td>Max Marks</td><td></td><td>50</td><td>50</td><td>100</td></tr>
        <tr><td>SCSA6101</td><td>Compiler Design</td><td>42</td><td>AB</td><td>42</td></tr>
        <tr><td>SCSA6102</td><td>Cloud Computing</td><td>38 / 50</td><td>-</td><td>-</td></tr>
      </table>`;
    const [cd, cc] = parseMarks(html);
    expect(cd).toEqual({
      code: "SCSA6101",
      title: "Compiler Design",
      components: [
        { name: "CIA-1", max: 50, scored: 42 },
        { name: "CIA-2", max: 50, scored: 0 },
      ],
      total: 42,
      maxTotal: 100,
    });
    expect(cc?.components[0]).toEqual({ name: "CIA-1", max: 50, scored: 38 });
    expect(cc?.components[1]?.scored).toBeNull();
    expect(cc?.total).toBeNull();
    expect(cc?.maxTotal).toBeNull();
  });

  it("parses component headers", () => {
    expect(parseComponentHeader("CIA - 1 (20)")).toEqual({ name: "CIA-1", max: 20 });
    expect(parseComponentHeader("Model Exam [Max. Marks: 100]")).toEqual({ name: "Model Exam", max: 100 });
    expect(parseComponentHeader("Assignment/10")).toEqual({ name: "Assignment", max: 10 });
    expect(parseComponentHeader("Quiz")).toEqual({ name: "Quiz", max: null });
  });

  it("fails loudly without max marks unless defaultMax is configured", () => {
    const html = `<table><tr><th>Code</th><th>Quiz</th></tr><tr><td>SCSA6101</td><td>7</td></tr></table>`;
    expectParseError(() => parseMarks(html), "marks");
    const selectors: ErpSelectors = { ...DEFAULT_SELECTORS, marks: { ...DEFAULT_SELECTORS.marks, defaultMax: 10 } };
    expect(parseMarks(html, { selectors })[0]?.components).toEqual([{ name: "Quiz", max: 10, scored: 7 }]);
  });

  it("throws ParseError when there is no marks table", () => {
    expectParseError(() => parseMarks(load("fees.html")), "marks");
  });
});

/* ======================================================================== */
describe("results", () => {
  it("groups by semester and reads SGPA/credits from the summary table", () => {
    const sems = parseResults(load("results.html"));
    expect(sems.map((s) => s.semester)).toEqual([1, 2, 3, 4]);
    expect(sems.map((s) => s.gpa)).toEqual([8.3, 7.95, 8.65, 8.16]);
    expect(sems.map((s) => s.credits)).toEqual([20, 20, 20, 19]);
    expect(sems[0]?.results).toHaveLength(6);
    expect(sems[0]?.results[0]).toEqual({
      code: "SHSA1101",
      title: "Technical English",
      credits: 3,
      grade: "A",
      gradePoint: 8,
    });
    expect(sems[1]?.results.find((r) => r.code === "SCSA1201")?.gradePoint).toBe(9); // A+
  });

  it("computes GPA with computeGpa when the page has no summary", () => {
    const html = load("results.html").replace(/<table[^>]*id="ContentPlaceHolder1_gvGpa"[\s\S]*?<\/table>/, "");
    const sems = parseResults(html);
    expect(sems.map((s) => s.gpa)).toEqual([8.3, 7.95, 8.65, 8.16]);
    expect(sems.map((s) => s.credits)).toEqual([20, 20, 20, 19]);
  });

  it("handles one table per semester (heading above), U grades and the exclusion policy", () => {
    const html = `
      <div class="results">
        <h4>Semester - I</h4>
        <table>
          <tr><th>Subject Code</th><th>Subject Name</th><th>Credits</th><th>Grade</th></tr>
          <tr><td>AAA1001</td><td>Maths</td><td>4</td><td>A+</td></tr>
          <tr><td>AAA1002</td><td>Physics</td><td>3</td><td>U</td></tr>
          <tr><td>AAA1003</td><td>Chemistry</td><td>3</td><td>o</td></tr>
        </table>
        <h4>Semester - II</h4>
        <table>
          <tr><th>Subject Code</th><th>Subject Name</th><th>Credits</th><th>Grade</th></tr>
          <tr><td>BBB2001</td><td>Programming</td><td>3</td><td>B+</td></tr>
        </table>
      </div>`;
    const [s1, s2] = parseResults(html);
    expect(s1?.semester).toBe(1);
    expect(s1?.results).toHaveLength(3);
    expect(s1?.results.find((r) => r.code === "AAA1002")).toMatchObject({ grade: "U", gradePoint: 0 });
    expect(s1?.gpa).toBe(9.43); // (4*9 + 3*10) / 7, failed course excluded
    expect(s1?.credits).toBe(7);
    expect(s2).toMatchObject({ semester: 2, gpa: 7, credits: 3 });

    const inclusive: ErpSelectors = {
      ...DEFAULT_SELECTORS,
      results: { ...DEFAULT_SELECTORS.results, excludeFailedFromGpa: false },
    };
    const [i1] = parseResults(html, { selectors: inclusive });
    expect(i1?.gpa).toBe(6.6); // 66 / 10
    expect(i1?.credits).toBe(10);
  });

  it("throws ParseError when there is no results table", () => {
    expectParseError(() => parseResults(load("attendance.html")), "results");
  });
});

/* ======================================================================== */
describe("timetable", () => {
  const slots = parseTimetable(load("timetable.html"));

  it("parses the grid, skipping Lunch / Free / Library / empty cells", () => {
    expect(slots).toHaveLength(34);
    expect(slots[0]).toEqual({
      day: 0,
      startTime: "09:00",
      endTime: "09:50",
      courseCode: "SCSA5101",
      courseTitle: "Computer Networks",
      room: "Block-II / Room 204",
      faculty: "Dr. R. Priya",
    });
    expect(slots.some((s) => s.startTime === "12:40")).toBe(false); // lunch column
    expect(slots.filter((s) => s.day === 5)).toHaveLength(3); // Saturday half day
  });

  it("converts afternoon header times without AM/PM to 24h", () => {
    const mon = slots.filter((s) => s.day === 0);
    expect(mon.map((s) => s.startTime)).toEqual(["09:00", "09:50", "11:00", "11:50", "13:30", "14:20"]);
    expect(mon[4]).toMatchObject({ courseCode: "SCSA5105", endTime: "14:20", room: "Block-II / Room 206" });
  });

  it("expands colspan labs to one slot per period and reads 'CODE - room' cells", () => {
    const lab = slots.filter((s) => s.day === 1 && s.courseCode === "SCSA5106");
    expect(lab.map((s) => [s.startTime, s.endTime])).toEqual([
      ["09:00", "09:50"],
      ["09:50", "10:40"],
    ]);
    expect(lab[0]).toMatchObject({ room: "CSE Lab-3", courseTitle: "Web Technology Laboratory", faculty: "Mr. A. Bhaskar" });
    expect(slots.find((s) => s.courseCode === "SMAT5101")?.room).toBe("Block-I / Room 118");
  });

  it("merges consecutive periods when mergeSpans is on", () => {
    const selectors: ErpSelectors = {
      ...DEFAULT_SELECTORS,
      timetable: { ...DEFAULT_SELECTORS.timetable, mergeSpans: true },
    };
    const merged = parseTimetable(load("timetable.html"), { selectors });
    expect(merged).toHaveLength(32);
    const labs = merged.filter((s) => s.courseCode === "SCSA5106");
    expect(labs.map((s) => [s.day, s.startTime, s.endTime])).toEqual([
      [1, "09:00", "10:40"],
      [3, "13:30", "15:10"],
    ]);
  });

  it("works without a legend, with AM/PM headers and labelled room/faculty lines", () => {
    const html = `
      <table class="timetable">
        <tr><th>Day</th><th>9:00 AM - 9:50 AM</th><th>10:00 AM-10:50 AM</th><th>1:00 PM - 1:50 PM</th></tr>
        <tr><td>Mon</td><td>CS6101<br>Room: 301<br>Dr. A. Kumar</td><td>Free</td><td>Lunch</td></tr>
        <tr><td>Tue</td><td>&nbsp;</td><td>CS6102 Compilers</td><td>CS6101</td></tr>
      </table>`;
    expect(parseTimetable(html)).toEqual([
      { day: 0, startTime: "09:00", endTime: "09:50", courseCode: "CS6101", courseTitle: "CS6101", room: "301", faculty: "Dr. A. Kumar" },
      { day: 1, startTime: "10:00", endTime: "10:50", courseCode: "CS6102", courseTitle: "Compilers" },
      { day: 1, startTime: "13:00", endTime: "13:50", courseCode: "CS6101", courseTitle: "CS6101" },
    ]);
  });

  it("throws ParseError when there is no day grid", () => {
    expectParseError(() => parseTimetable(load("fees.html")), "timetable");
  });
});

/* ======================================================================== */
describe("fees", () => {
  it("parses records, ISO dates and paid status; skips Total", () => {
    expect(parseFees(load("fees.html"))).toEqual([
      {
        description: "Tuition & Lab Fee - Semester 5 (2025-26 Odd)",
        amount: 92500,
        paid: true,
        paidDate: "2025-07-18",
        receiptNo: "SU/FEE/2025/0045128",
      },
      {
        description: "Hostel & Mess Fee - Semester 6 (2025-26 Even)",
        amount: 68000,
        dueDate: "2025-12-15",
        paid: false,
      },
    ]);
  });

  it("falls back to a Balance column for paid status", () => {
    const html = `
      <table>
        <tr><th>Particulars</th><th>Fee Amount</th><th>Balance</th></tr>
        <tr><td>Exam Fee</td><td>\u20B9 2,450</td><td>0</td></tr>
        <tr><td>Library Fine</td><td>150</td><td>150</td></tr>
      </table>`;
    expect(parseFees(html).map((f) => [f.description, f.amount, f.paid])).toEqual([
      ["Exam Fee", 2450, true],
      ["Library Fine", 150, false],
    ]);
  });

  it("throws ParseError when there is no fees table", () => {
    expectParseError(() => parseFees(load("profile.html")), "fees");
  });
});

/* ======================================================================== */
describe("notifications", () => {
  it("parses notice items with ISO dates, read flags and resolved links", () => {
    const list = parseNotifications(load("notifications.html"), { baseUrl: BASE });
    expect(list).toHaveLength(5);
    expect(list.every((n) => n.source === "erp")).toBe(true);
    expect(list.map((n) => n.date)).toEqual([
      "2026-10-09T10:30:00+05:30",
      "2026-10-07T09:00:00+05:30",
      "2026-10-05T16:45:00+05:30",
      "2026-10-02T14:20:00+05:30",
      "2026-09-28T11:15:00+05:30",
    ]);
    expect(list.map((n) => n.read)).toEqual([false, false, true, false, true]);
    expect(list[0]).toMatchObject({
      title: "CIA-II Timetable Released - Sem 5",
      url: "https://erp.sathyabama.ac.in/notifications/cia2-sem5",
      body: "The CIA-II internal examination schedule for all V semester B.E./B.Tech programmes is now published. Exams commence 20-Oct-2026.",
    });
    expect(list[1]?.title).toBe("Reminder: Semester 6 Fee Payment");
    expect(list[1]?.url).toBe("https://erp.sathyabama.ac.in/fees");
    expect(list[3]?.url).toBeUndefined(); // javascript:__doPostBack link dropped
  });

  it("gives stable, unique ids", () => {
    const a = parseNotifications(load("notifications.html"));
    const b = parseNotifications(load("notifications.html"));
    expect(a.map((n) => n.id)).toEqual(b.map((n) => n.id));
    expect(new Set(a.map((n) => n.id)).size).toBe(a.length);
    expect(a.every((n) => /^erp-[0-9a-z]+$/.test(n.id))).toBe(true);
    expect(a[0]?.url).toBe("/notifications/cia2-sem5"); // unresolved without baseUrl
  });

  it("returns [] for an empty board and throws when the board is missing", () => {
    expect(parseNotifications(`<div class="notice-board"><p>No notices</p></div>`)).toEqual([]);
    expectParseError(() => parseNotifications("<html><body><p>Hello</p></body></html>"), "notifications");
  });
});
