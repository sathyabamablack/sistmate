import { describe, it, expect } from "vitest";
import { ws, MoodleWsError, LmsParseError } from "../src/parsers/index";
import { jsonFixture, NOW, SITE } from "./helpers";

const CATEGORY_NAMES = { 12: "B.E. CSE / Semester 5" };

describe("ws.parseWsError", () => {
  it("throws a typed MoodleWsError for an exception envelope", () => {
    const json = jsonFixture("ws/ws_exception_invalidtoken.json");
    expect(() => ws.parseWsError(json)).toThrow(MoodleWsError);
    try {
      ws.parseWsError(json);
    } catch (e) {
      expect(e).toBeInstanceOf(MoodleWsError);
      const err = e as MoodleWsError;
      expect(err.errorcode).toBe("invalidtoken");
      expect(err.exception).toBe("moodle_exception");
      expect(err.message).toContain("Invalid token");
      expect(err.isAuthError).toBe(true);
      expect(err.isWebServiceUnavailable).toBe(false);
    }
  });

  it("flags 'web services disabled' so the adapter can fall back to HTML", () => {
    const err = ws.toMoodleWsError(jsonFixture("ws/ws_exception_ws_disabled.json"));
    expect(err).not.toBeNull();
    expect(err?.isWebServiceUnavailable).toBe(true);
    expect(err?.debuginfo).toBe("Web services are disabled on this site.");
  });

  it("is a no-op for normal payloads", () => {
    expect(() => ws.parseWsError(jsonFixture("ws/core_enrol_get_users_courses.json"))).not.toThrow();
    expect(() => ws.parseWsError({ events: [] })).not.toThrow();
    expect(ws.isMoodleException({ events: [] })).toBe(false);
  });

  it("every mapper rejects an exception envelope with MoodleWsError", () => {
    const exc = jsonFixture("ws/ws_exception_invalidtoken.json");
    expect(() => ws.mapSiteInfo(exc)).toThrow(MoodleWsError);
    expect(() => ws.mapCourses(exc, { siteUrl: SITE })).toThrow(MoodleWsError);
    expect(() => ws.mapAssignments(exc, { siteUrl: SITE })).toThrow(MoodleWsError);
    expect(() => ws.mapCalendarEvents(exc)).toThrow(MoodleWsError);
    expect(() => ws.mapNotifications(exc)).toThrow(MoodleWsError);
  });
});

describe("ws.parseTokenResponse", () => {
  it("returns the token on success", () => {
    const r = ws.parseTokenResponse(jsonFixture("ws/token_success.json"));
    expect(r).toEqual({
      ok: true,
      token: "8f2c1e4b9a7d6c5b4a3f2e1d0c9b8a7f",
      privateToken: "U1lOVEhFVElDLVBSSVZBVEUtVE9LRU4tRk9SLVRFU1RT",
    });
  });

  it("returns ok:false with Moodle's message on a failed login", () => {
    const r = ws.parseTokenResponse(jsonFixture("ws/token_error.json"));
    expect(r).toEqual({ ok: false, error: "Invalid login, please try again", errorcode: "invalidlogin" });
  });

  it("accepts the raw body string", () => {
    const r = ws.parseTokenResponse('{"token":"abc"}');
    expect(r).toEqual({ ok: true, token: "abc" });
  });

  it("reports a non-JSON body (e.g. SSO redirect page) instead of throwing", () => {
    const r = ws.parseTokenResponse("<!DOCTYPE html><html>Login</html>");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorcode).toBe("nonjson");
  });

  it("handles an exception envelope from token.php", () => {
    const r = ws.parseTokenResponse(jsonFixture("ws/ws_exception_ws_disabled.json"));
    expect(r).toMatchObject({ ok: false, errorcode: "enablewsdescription" });
  });
});

describe("ws.mapSiteInfo", () => {
  it("extracts user + site fields and normalises siteurl", () => {
    const info = ws.mapSiteInfo(jsonFixture("ws/core_webservice_get_site_info.json"));
    expect(info.userid).toBe(2417);
    expect(info.fullname).toBe("Aarav Krishnan");
    expect(info.username).toBe("41110987");
    expect(info.siteurl).toBe(SITE); // trailing slash removed
    expect(info.sitename).toBe("Example Institute of Technology & Science LMS");
    expect(info.functions).toContain("mod_assign_get_submission_status");
    expect(info.functions).toHaveLength(7);
  });
});

describe("ws.mapCourses", () => {
  const raw = jsonFixture("ws/core_enrol_get_users_courses.json");

  it("maps every enrolled course", () => {
    const courses = ws.mapCourses(raw, { siteUrl: `${SITE}/`, categoryNames: CATEGORY_NAMES });
    expect(courses).toHaveLength(6);
    expect(courses.map((c) => c.id)).toEqual([101, 102, 103, 104, 105, 106]);
    expect(courses[0]).toEqual({
      id: 101,
      shortName: "CS1501",
      fullName: "Design and Analysis of Algorithms",
      progress: 72, // 72.41… rounded
      category: "B.E. CSE / Semester 5",
      url: "https://lms.example.edu/course/view.php?id=101",
      lastAccess: "2026-10-11T02:30:00.000Z",
    });
  });

  it("keeps the last access time and the course grade when given", () => {
    const courses = ws.mapCourses(raw, { siteUrl: SITE, grades: { 101: "69 %" } });
    expect(courses.find((c) => c.id === 101)).toMatchObject({ grade: "69 %", lastAccess: "2026-10-11T02:30:00.000Z" });
    expect(courses.find((c) => c.id === 102)?.grade).toBeUndefined();
    expect(courses.find((c) => c.id === 106)?.lastAccess).toBeUndefined();
  });

  it("rounds fractional progress and keeps null when completion is off", () => {
    const courses = ws.mapCourses(raw, { siteUrl: SITE });
    expect(courses.find((c) => c.id === 103)?.progress).toBe(54);
    expect(courses.find((c) => c.id === 106)?.progress).toBeNull();
  });

  it("omits category when no id→name map is given", () => {
    const courses = ws.mapCourses(raw, { siteUrl: SITE });
    expect(courses[0]?.category).toBeUndefined();
  });

  it("throws LmsParseError on an unexpected shape", () => {
    expect(() => ws.mapCourses([{ id: 1 }], { siteUrl: SITE })).toThrow(LmsParseError);
    expect(() => ws.mapCourses({ courses: [] }, { siteUrl: SITE })).toThrow(LmsParseError);
  });
});

describe("ws.mapAssignments", () => {
  const raw = jsonFixture("ws/mod_assign_get_assignments.json");
  const statuses = jsonFixture("ws/mod_assign_get_submission_status.bundle.json") as Record<string, unknown>;

  it("flattens all courses' assignments, using cmid as the canonical id", () => {
    const list = ws.mapAssignments(raw, { siteUrl: SITE });
    expect(list).toHaveLength(7);
    expect(list.map((a) => a.id)).toEqual([5001, 5007, 5002, 5006, 5003, 5004, 5005]);
    const first = list[0];
    expect(first).toMatchObject({
      courseId: 101,
      courseName: "Design and Analysis of Algorithms",
      name: "Lab 4: Dynamic Programming — Matrix Chain & LCS", // entities decoded
      url: "https://lms.example.edu/mod/assign/view.php?id=5001",
    });
  });

  it("converts unix duedate → ISO and duedate 0 → null", () => {
    const list = ws.mapAssignments(raw, { siteUrl: SITE });
    expect(list.find((a) => a.id === 5001)?.dueDate).toBe("2026-10-15T18:29:00.000Z");
    expect(list.find((a) => a.id === 5003)?.dueDate).toBe("2026-10-04T18:29:00.000Z");
    expect(list.find((a) => a.id === 5006)?.dueDate).toBeNull();
  });

  it("without submission statuses everything is unsubmitted/ungraded", () => {
    const list = ws.mapAssignments(raw, { siteUrl: SITE });
    expect(list.every((a) => a.submitted === false && a.grade === null)).toBe(true);
  });

  it("merges mod_assign_get_submission_status results (keyed by assign id)", () => {
    const list = ws.mapAssignments(raw, { siteUrl: SITE, submissionStatuses: statuses });
    const byId = new Map(list.map((a) => [a.id, a]));

    // submitted + graded (gradefordisplay with &nbsp;)
    expect(byId.get(5002)).toMatchObject({ submitted: true, grade: "18 / 20" });
    // submitted + graded (gradefordisplay wrapped in HTML)
    expect(byId.get(5007)).toMatchObject({ submitted: true, grade: "9.5 / 10" });
    // submitted, awaiting grading
    expect(byId.get(5004)).toMatchObject({ submitted: true, grade: null });
    // draft is NOT submitted
    expect(byId.get(5005)).toMatchObject({ submitted: false, grade: null });
    // pending, and overdue (due before NOW, still "new")
    expect(byId.get(5001)).toMatchObject({ submitted: false, grade: null });
    const overdue = byId.get(5003);
    expect(overdue?.submitted).toBe(false);
    expect(Date.parse(overdue?.dueDate ?? "")).toBeLessThan(NOW.getTime());
    // no status entry at all
    expect(byId.get(5006)).toMatchObject({ submitted: false, grade: null, dueDate: null });
  });

  it("uses a per-student extension due date when present", () => {
    const withExt = {
      "301": { lastattempt: { submission: { status: "new" }, extensionduedate: 1792348140 } },
    };
    const list = ws.mapAssignments(raw, { siteUrl: SITE, submissionStatuses: withExt });
    expect(list.find((a) => a.id === 5001)?.dueDate).toBe("2026-10-18T18:29:00.000Z");
  });

  it("falls back to the numeric grade and treats -1 as ungraded", () => {
    const list = ws.mapAssignments(raw, {
      siteUrl: SITE,
      submissionStatuses: {
        "301": { lastattempt: { submission: { status: "submitted" } }, feedback: { grade: { grade: "15.50000" } } },
        "302": { lastattempt: { submission: { status: "submitted" } }, feedback: { grade: { grade: "-1.00000" } } },
      },
    });
    expect(list.find((a) => a.id === 5001)?.grade).toBe("15.5");
    expect(list.find((a) => a.id === 5002)?.grade).toBeNull();
  });

  it("ignores a per-assignment exception instead of failing the whole list", () => {
    const list = ws.mapAssignments(raw, {
      siteUrl: SITE,
      submissionStatuses: { "302": jsonFixture("ws/ws_exception_invalidtoken.json") },
    });
    expect(list.find((a) => a.id === 5002)).toMatchObject({ submitted: false, grade: null });
  });
});

describe("ws.mapCalendarEvents", () => {
  it("maps action events (assign → assignment, quiz → exam)", () => {
    const events = ws.mapCalendarEvents(jsonFixture("ws/core_calendar_get_action_events_by_timesort.json"));
    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({
      id: "lms-event-801",
      title: "Lab 4: Dynamic Programming — Matrix Chain & LCS is due",
      date: "2026-10-15T18:29:00.000Z",
      source: "lms",
      courseName: "Design and Analysis of Algorithms",
      type: "assignment",
      url: "https://lms.example.edu/mod/assign/view.php?id=5001",
    });
    const quiz = events.find((e) => e.id === "lms-event-804");
    expect(quiz?.type).toBe("exam");
    expect(quiz?.date).toBe("2026-10-22T04:30:00.000Z");
    expect(quiz?.courseName).toBe("Operating Systems");
  });

  it("maps the upcoming view incl. course and user events as 'other'", () => {
    const events = ws.mapCalendarEvents(jsonFixture("ws/core_calendar_get_calendar_upcoming_view.json"));
    expect(events.map((e) => e.id)).toEqual([
      "lms-event-806",
      "lms-event-801",
      "lms-event-805",
      "lms-event-802",
      "lms-event-804",
    ]);
    const user = events[0];
    expect(user?.type).toBe("other");
    expect(user?.courseName).toBeUndefined();
    const course = events.find((e) => e.id === "lms-event-805");
    expect(course).toMatchObject({ type: "other", courseName: "Database Management Systems" });
    expect(events.every((e) => e.source === "lms")).toBe(true);
  });

  it("de-duplicates repeated event ids", () => {
    const one = {
      id: 1,
      name: "x",
      timestart: 1792088940,
      eventtype: "user",
    };
    expect(ws.mapCalendarEvents({ events: [one, one] })).toHaveLength(1);
  });
});

describe("ws.mapNotifications", () => {
  const list = ws.mapNotifications(jsonFixture("ws/message_popup_get_popup_notifications.json"));

  it("maps all notifications with lms source and ISO dates", () => {
    expect(list).toHaveLength(4);
    expect(list.map((n) => n.id)).toEqual(["lms-notif-9003", "lms-notif-9002", "lms-notif-9004", "lms-notif-9001"]);
    expect(list.every((n) => n.source === "lms")).toBe(true);
    expect(list[0]?.date).toBe("2026-10-11T02:30:00.000Z");
  });

  it("strips HTML and decodes entities in the body", () => {
    expect(list.every((n) => !/[<>]/.test(n.body ?? ""))).toBe(true);
    expect(list[0]?.body).toBe(
      'Lecture slides for "Transport Layer – TCP Flow Control" are now available under Week 7.',
    );
    expect(list[1]?.body).toBe(
      "You scored 18/20 on 'Normalization to BCNF'. Feedback is available on the assignment page.",
    );
  });

  it("falls back to fullmessage when smallmessage is missing; url optional", () => {
    const n = list.find((x) => x.id === "lms-notif-9004");
    expect(n?.body).toBe("The internal assessment schedule for Semester 5 is now available on the LMS calendar.");
    expect(n?.url).toBeUndefined();
  });

  it("carries read state and context url", () => {
    expect(list.find((x) => x.id === "lms-notif-9002")).toMatchObject({
      read: true,
      url: "https://lms.example.edu/mod/assign/view.php?id=5002",
    });
    expect(list.filter((x) => !x.read)).toHaveLength(3);
  });
});

describe("ws.mapCategoryNames and ws.mapCourseGrades", () => {
  it("names a nested category after its parent", () => {
    const names = ws.mapCategoryNames(jsonFixture("ws/core_course_get_categories.json"));
    expect(names).toEqual({ 3: "B.E. CSE", 12: "B.E. CSE / Semester 5" });
  });

  it("keeps displayed course totals and drops empty ones", () => {
    const grades = ws.mapCourseGrades(jsonFixture("ws/gradereport_overview_get_course_grades.json"));
    expect(grades).toEqual({ 101: "69 %", 102: "95 %", 104: "70 %" });
  });

  it("rejects an exception envelope", () => {
    expect(() => ws.mapCourseGrades(jsonFixture("ws/ws_exception_invalidtoken.json"))).toThrow(MoodleWsError);
  });
});
