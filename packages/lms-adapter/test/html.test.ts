import { describe, it, expect } from "vitest";
import { html, ws, LmsParseError } from "../src/parsers/index";
import { fixture, jsonFixture, NOW, SITE } from "./helpers";

describe("html.parseLoginForm / detectLoginFailure / isLoggedInPage", () => {
  it("extracts action, logintoken and fields from the Boost login page", () => {
    const form = html.parseLoginForm(fixture("html/login.html"), `${SITE}/login/index.php`);
    expect(form.action).toBe("https://lms.example.edu/login/index.php");
    expect(form.method).toBe("POST");
    expect(form.logintoken).toBe("Zk3qT8yVb1mN0rXc2LwP7sHdA9eGjU4o");
    expect(form.usernameField).toBe("username");
    expect(form.passwordField).toBe("password");
    expect(form.fields).toEqual({
      anchor: "",
      logintoken: "Zk3qT8yVb1mN0rXc2LwP7sHdA9eGjU4o",
      username: "",
      password: "",
    });
  });

  it("never pre-fills credentials from a re-rendered (failed) login page", () => {
    const form = html.parseLoginForm(fixture("html/login_failed.html"));
    expect(form.fields.username).toBe("");
    expect(form.fields.password).toBe("");
    expect(form.logintoken).toBe("Hq2wE5rTy7uI9oP1aS3dF6gJ8kL0zXcV");
  });

  it("throws LmsParseError when the page has no login form", () => {
    expect(() => html.parseLoginForm(fixture("html/my_courses.html"))).toThrow(LmsParseError);
  });

  it("detects a failed login and returns Moodle's message", () => {
    expect(html.detectLoginFailure(fixture("html/login_failed.html"))).toBe("Invalid login, please try again");
  });

  it("does not flag the normal login page (info alert only) as a failure", () => {
    expect(html.detectLoginFailure(fixture("html/login.html"))).toBeNull();
  });

  it("recognises logged-in pages", () => {
    expect(html.isLoggedInPage(fixture("html/my_courses.html"))).toBe(true);
    expect(html.isLoggedInPage(fixture("html/login.html"))).toBe(false);
  });
});

describe("html.parseMyCourses", () => {
  it("parses dashboard course cards (sr-only text removed)", () => {
    const courses = html.parseMyCourses(fixture("html/my_courses.html"));
    expect(courses).toHaveLength(6);
    expect(courses[0]).toEqual({
      id: 101,
      shortName: "CS1501",
      fullName: "Design and Analysis of Algorithms",
      progress: 72,
      category: "B.E. CSE / Semester 5",
      url: "https://lms.example.edu/course/view.php?id=101",
    });
    expect(courses.find((c) => c.id === 106)?.progress).toBeNull();
  });

  it("agrees with the WS mapper on the same dataset", () => {
    const fromHtml = html.parseMyCourses(fixture("html/my_courses.html"));
    const fromWs = ws.mapCourses(jsonFixture("ws/core_enrol_get_users_courses.json"), {
      siteUrl: SITE,
      categoryNames: { 12: "B.E. CSE / Semester 5" },
    });
    // The course page doesn't show when the student last opened a course; only the API does.
    expect(fromHtml).toEqual(fromWs.map(({ lastAccess: _lastAccess, ...rest }) => rest));
  });

  it("falls back to the course/index.php coursebox list", () => {
    const courses = html.parseMyCourses(fixture("html/course_index.html"));
    expect(courses.map((c) => c.id)).toEqual([101, 102, 103]);
    expect(courses[1]).toMatchObject({
      fullName: "Database Management Systems",
      shortName: "Database Management Systems", // not shown on this page
      progress: null,
    });
  });

  it("returns [] for a page without courses", () => {
    expect(html.parseMyCourses("<html><body><div id='region-main'></div></body></html>")).toEqual([]);
  });
});

describe("html.matchColumns", () => {
  it("matches stock Moodle headers", () => {
    expect(html.matchColumns(["Topic", "Assignments", "Due date", "Submission", "Grade"])).toEqual({
      name: 1,
      due: 2,
      submission: 3,
      grade: 4,
    });
  });

  it("matches reordered columns by header text, not position", () => {
    expect(html.matchColumns(["Grade", "Submission status", "Assignment", "Due date"])).toEqual({
      grade: 0,
      submission: 1,
      name: 2,
      due: 3,
    });
  });

  it("matches renamed headers via aliases and whole-word containment", () => {
    expect(html.matchColumns(["Marks (out of 20)", "Activity name", "Last date to submit", "My status"])).toEqual({
      grade: 0,
      name: 1,
      due: 2,
      submission: 3,
    });
  });

  it("leaves unknown columns unmapped", () => {
    expect(html.matchColumns(["Topic", "Foo", "Bar"])).toEqual({});
  });
});

describe("html.isSubmittedText", () => {
  it("classifies Moodle submission status text", () => {
    expect(html.isSubmittedText("Submitted for grading")).toBe(true);
    expect(html.isSubmittedText("Submitted")).toBe(true);
    expect(html.isSubmittedText("No submission")).toBe(false);
    expect(html.isSubmittedText("Not submitted")).toBe(false);
    expect(html.isSubmittedText("Draft (not submitted)")).toBe(false);
    expect(html.isSubmittedText("")).toBe(false);
  });
});

describe("html.parseAssignmentIndex", () => {
  it("parses the stock Boost table (course id from body class, name from heading)", () => {
    const list = html.parseAssignmentIndex(fixture("html/assign_index_course102.html"), { now: NOW });
    expect(list).toHaveLength(2); // the colspan divider row is skipped
    expect(list[0]).toEqual({
      id: 5002,
      courseId: 102,
      courseName: "Database Management Systems",
      name: "Assignment 3: Normalization to BCNF",
      dueDate: "2026-10-09T23:59:00+05:30",
      submitted: true,
      grade: "18 / 20",
      url: "https://lms.example.edu/mod/assign/view.php?id=5002",
    });
    expect(list[1]).toMatchObject({ id: 5006, dueDate: null, submitted: false, grade: null });
  });

  it("scraped due date is the same instant as the WS unix timestamp", () => {
    const list = html.parseAssignmentIndex(fixture("html/assign_index_course102.html"));
    expect(Date.parse(list[0]?.dueDate ?? "")).toBe(1791570540 * 1000);
  });

  it("handles a custom theme with reordered/renamed columns and no <thead>", () => {
    const list = html.parseAssignmentIndex(fixture("html/assign_index_course101_custom_theme.html"));
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({
      id: 5007,
      courseId: 101,
      courseName: "Design and Analysis of Algorithms",
      name: "Lab 3: Greedy Algorithms",
      dueDate: "2026-10-01T23:59:00+05:30",
      submitted: true,
      grade: "9.5 / 10",
      url: "https://lms.example.edu/mod/assign/view.php?id=5007",
    });
    expect(list[1]).toMatchObject({
      id: 5001,
      name: "Lab 4: Dynamic Programming — Matrix Chain & LCS",
      dueDate: "2026-10-15T23:59:00+05:30",
      submitted: false,
      grade: null,
    });
  });

  it("matches the WS mapper's submitted/grade results for the same assignments", () => {
    const fromWs = ws.mapAssignments(jsonFixture("ws/mod_assign_get_assignments.json"), {
      siteUrl: SITE,
      submissionStatuses: jsonFixture("ws/mod_assign_get_submission_status.bundle.json") as Record<string, unknown>,
    });
    const fromHtml = [
      ...html.parseAssignmentIndex(fixture("html/assign_index_course102.html")),
      ...html.parseAssignmentIndex(fixture("html/assign_index_course101_custom_theme.html")),
    ];
    for (const h of fromHtml) {
      const w = fromWs.find((a) => a.id === h.id);
      expect(w, `WS assignment ${h.id}`).toBeDefined();
      expect(h.submitted).toBe(w?.submitted);
      expect(h.grade).toBe(w?.grade);
      expect(h.name).toBe(w?.name);
      expect(h.courseId).toBe(w?.courseId);
      expect(h.dueDate === null ? null : Date.parse(h.dueDate)).toBe(
        w?.dueDate === null || w?.dueDate === undefined ? null : Date.parse(w.dueDate),
      );
    }
  });

  it("explicit options override page-derived course id/name and resolve relative URLs", () => {
    const page = `<html><body><table><thead><tr><th>Assignment</th><th>Due date</th></tr></thead>
      <tbody><tr><td><a href="/mod/assign/view.php?id=42">Essay</a></td><td>15/10/2026, 23:59</td></tr></tbody></table></body></html>`;
    const list = html.parseAssignmentIndex(page, {
      courseId: 7,
      courseName: "Elective",
      baseUrl: SITE,
      tzOffset: "Z",
    });
    expect(list).toEqual([
      {
        id: 42,
        courseId: 7,
        courseName: "Elective",
        name: "Essay",
        dueDate: "2026-10-15T23:59:00Z",
        submitted: false,
        grade: null,
        url: "https://lms.example.edu/mod/assign/view.php?id=42",
      },
    ]);
  });

  it("returns [] when Moodle says there are no assignments", () => {
    const page = `<html><body class="course-9"><div id="region-main"><div class="alert">There are no Assignments</div></div></body></html>`;
    expect(html.parseAssignmentIndex(page)).toEqual([]);
  });

  it("throws LmsParseError when no recognisable table exists", () => {
    const page = `<html><body class="course-9"><table><tr><th>Foo</th></tr></table></body></html>`;
    expect(() => html.parseAssignmentIndex(page)).toThrow(LmsParseError);
  });
});

describe("html.parseUpcoming", () => {
  const events = html.parseUpcoming(fixture("html/upcoming.html"), { now: NOW });

  it("parses every event block", () => {
    expect(events.map((e) => e.id)).toEqual([
      "lms-event-806",
      "lms-event-801",
      "lms-event-805",
      "lms-event-802",
      "lms-event-804",
    ]);
    expect(events.every((e) => e.source === "lms")).toBe(true);
  });

  it("reads the exact time from the day link's time= param", () => {
    expect(events[1]).toEqual({
      id: "lms-event-801",
      title: "Lab 4: Dynamic Programming — Matrix Chain & LCS is due",
      date: "2026-10-15T18:29:00.000Z",
      source: "lms",
      courseName: "Design and Analysis of Algorithms",
      type: "assignment",
      url: "https://lms.example.edu/mod/assign/view.php?id=5001",
    });
    expect(events.find((e) => e.id === "lms-event-804")?.type).toBe("exam");
  });

  it("falls back to parsing the year-less date text", () => {
    const user = events[0];
    expect(user).toMatchObject({ title: "Project review meeting with guide", type: "other" });
    expect(user?.date).toBe("2026-10-14T15:00:00+05:30");
    expect(user?.courseName).toBeUndefined(); // site/user event
  });

  it("course events: type other, url falls back to the course link", () => {
    expect(events.find((e) => e.id === "lms-event-805")).toMatchObject({
      type: "other",
      courseName: "Database Management Systems",
      url: "https://lms.example.edu/course/view.php?id=102",
    });
  });

  it("agrees with the WS upcoming view on ids, titles, instants, types and courses", () => {
    const fromWs = ws.mapCalendarEvents(jsonFixture("ws/core_calendar_get_calendar_upcoming_view.json"));
    expect(events.map((e) => e.id)).toEqual(fromWs.map((e) => e.id));
    for (const h of events) {
      const w = fromWs.find((e) => e.id === h.id);
      expect(w).toBeDefined();
      expect(h.title).toBe(w?.title);
      expect(Date.parse(h.date)).toBe(Date.parse(w?.date ?? ""));
      expect(h.type).toBe(w?.type);
      expect(h.courseName).toBe(w?.courseName);
    }
  });

  it("returns [] when there are no upcoming events", () => {
    expect(html.parseUpcoming("<html><body><div class='eventlist'>There are no upcoming events</div></body></html>")).toEqual([]);
  });
});

describe("html.parseMoodleDate", () => {
  it("parses common Moodle date formats with the IST default", () => {
    expect(html.parseMoodleDate("Thursday, 15 October 2026, 11:59 PM")).toBe("2026-10-15T23:59:00+05:30");
    expect(html.parseMoodleDate("15 Oct 2026, 23:59")).toBe("2026-10-15T23:59:00+05:30");
    expect(html.parseMoodleDate("October 15, 2026, 11:59 PM")).toBe("2026-10-15T23:59:00+05:30");
    expect(html.parseMoodleDate("15/10/2026, 11:59 PM")).toBe("2026-10-15T23:59:00+05:30");
    expect(html.parseMoodleDate("2026-10-15 23:59")).toBe("2026-10-15T23:59:00+05:30");
    expect(html.parseMoodleDate("Friday, 16 October 2026, 12:30 AM")).toBe("2026-10-16T00:30:00+05:30");
  });

  it("supports relative words and a custom offset", () => {
    expect(html.parseMoodleDate("Tomorrow, 9:00 AM", { now: NOW })).toBe("2026-10-12T09:00:00+05:30");
    expect(html.parseMoodleDate("Today, 6:15 PM", { now: NOW, tzOffset: "Z" })).toBe("2026-10-11T18:15:00Z");
  });

  it("returns null for 'no date' markers and garbage", () => {
    expect(html.parseMoodleDate("-")).toBeNull();
    expect(html.parseMoodleDate("")).toBeNull();
    expect(html.parseMoodleDate("No due date")).toBeNull();
    expect(html.parseMoodleDate("31 February 2026")).toBeNull();
    expect(html.parseMoodleDate("whenever")).toBeNull();
  });
});
