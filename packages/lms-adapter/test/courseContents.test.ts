import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SessionExpiredError, type CourseContents, type CourseModule } from "@usp/core";
import { createLiveLmsAdapter } from "../src/live";
import { mapAssignmentDetails, mapCourseContents } from "../src/parsers/ws/courseContents";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/ws/${name}`, import.meta.url), "utf8"));

const BASE = "https://lms.example.edu";

interface Opts {
  failing?: string[];
  expired?: boolean;
}

function fakeMoodle(opts: Opts = {}) {
  const calls: { fn: string; params: URLSearchParams }[] = [];
  const statusBundle = fixture("mod_assign_get_submission_status.bundle.json") as Record<string, unknown>;

  const impl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = new URLSearchParams(String(init?.body ?? ""));
    const fn = body.get("wsfunction") ?? "";
    calls.push({ fn, params: body });
    const json = (data: unknown) =>
      new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
    if (opts.expired) return json(fixture("ws_exception_invalidtoken.json"));
    if (opts.failing?.includes(fn)) {
      return json({ exception: "moodle_exception", errorcode: "accessexception", message: "Access control exception" });
    }
    if (fn === "mod_assign_get_submission_status") return json(statusBundle[body.get("assignid") ?? ""] ?? {});
    return json(fixture(`${fn}.json`));
  }) as typeof fetch;

  return { impl, calls };
}

const modules = (c: CourseContents): CourseModule[] => c.sections.flatMap((s) => s.modules);
const byName = (c: CourseContents, name: string) => {
  const m = modules(c).find((x) => x.name === name);
  if (!m) throw new Error(`no module ${name}`);
  return m;
};

describe("live getCourseContents (fake Moodle)", () => {
  it("calls the expected web-service functions for one course", async () => {
    const { impl, calls } = fakeMoodle();
    await createLiveLmsAdapter({ baseUrl: BASE, token: "t", fetch: impl }).getCourseContents(101);

    const fns = calls.map((c) => c.fn);
    expect(fns).toEqual(
      expect.arrayContaining([
        "core_webservice_get_site_info",
        "core_course_get_contents",
        "mod_page_get_pages_by_courses",
        "mod_quiz_get_quizzes_by_courses",
        "mod_assign_get_assignments",
        "gradereport_user_get_grade_items",
        "mod_assign_get_submission_status",
      ]),
    );
    const contentsCall = calls.find((c) => c.fn === "core_course_get_contents")!;
    expect(contentsCall.params.get("courseid")).toBe("101");
    expect(calls.find((c) => c.fn === "mod_assign_get_assignments")!.params.get("courseids[0]")).toBe("101");
    expect(calls.find((c) => c.fn === "gradereport_user_get_grade_items")!.params.get("userid")).toBe("2417");
    // one status call per assignment instance in the course
    expect(calls.filter((c) => c.fn === "mod_assign_get_submission_status")).toHaveLength(2);
  });

  it("returns sections in order and skips hidden sections and activities", async () => {
    const lms = createLiveLmsAdapter({ baseUrl: BASE, token: "t", fetch: fakeMoodle().impl });
    const c = await lms.getCourseContents(101);

    expect(c.courseId).toBe(101);
    expect(c.sections.map((s) => s.name)).toEqual([
      "General",
      "Unit 1: Algorithm analysis",
      "Unit 3: Dynamic programming",
    ]);
    expect(modules(c).some((m) => m.name === "Staff-only notes")).toBe(false);
    expect(c.sections[2]!.summary).toEqual([{ type: "paragraph", content: [{ text: "Tables, recurrences, memoisation." }] }]);
  });

  it("maps files, folders and URLs", async () => {
    const c = await createLiveLmsAdapter({ baseUrl: BASE, token: "t", fetch: fakeMoodle().impl }).getCourseContents(101);

    const res = byName(c, "Asymptotic notations");
    expect(res).toMatchObject({ kind: "resource", completed: true });
    if (res.kind !== "resource") throw new Error("kind");
    expect(res.files).toEqual([
      {
        name: "Unit 1 - Asymptotic Notations.pdf",
        mimeType: "application/pdf",
        size: 1940000,
        modified: expect.any(String),
        url: `${BASE}/webservice/pluginfile.php/501/mod_resource/content/1/Unit%201%20-%20Asymptotic%20Notations.pdf?forcedownload=1`,
      },
    ]);

    const folder = byName(c, "Question papers");
    expect(folder.kind === "folder" && folder.files.map((f) => f.name)).toEqual(["CIA-2 2024.pdf", "CIA-2 2025.pdf"]);

    expect(byName(c, "Visualgo sorting animations")).toMatchObject({ kind: "url", href: "https://visualgo.net/en/sorting" });
  });

  it("never puts a token into any file URL", async () => {
    const c = await createLiveLmsAdapter({ baseUrl: BASE, token: "SECRET-TOKEN", fetch: fakeMoodle().impl }).getCourseContents(101);
    expect(JSON.stringify(c)).not.toMatch(/SECRET-TOKEN|token=/);
  });

  it("renders page content and label text as sanitised rich text with safe links", async () => {
    const c = await createLiveLmsAdapter({ baseUrl: BASE, token: "t", fetch: fakeMoodle().impl }).getCourseContents(101);

    const page = byName(c, "Recurrences cheat sheet");
    if (page.kind !== "page") throw new Error("kind");
    expect(page.content[0]).toMatchObject({ type: "heading", level: 3 });
    expect(page.content[1]).toMatchObject({ type: "paragraph" });
    expect(page.content[2]).toMatchObject({ type: "list", ordered: false });
    const last = page.content[3];
    expect(last).toMatchObject({ type: "paragraph" });
    const text = JSON.stringify(last);
    expect(text).toContain('"href":"/courses/101/assignments/5001"');
    expect(text).toContain('"href":"https://example.org/notes"');

    const label = byName(c, "Office hours Wed 3pm");
    const labelJson = JSON.stringify(label.description);
    expect(labelJson).toContain('"href":"/courses/101"');
    expect(labelJson).not.toMatch(/javascript|alert/);
  });

  it("maps quizzes from mod_quiz_get_quizzes_by_courses", async () => {
    const c = await createLiveLmsAdapter({ baseUrl: BASE, token: "t", fetch: fakeMoodle().impl }).getCourseContents(101);
    expect(byName(c, "Quiz 2: Dynamic programming")).toMatchObject({
      kind: "quiz",
      openDate: new Date(1791775800 * 1000).toISOString(),
      closeDate: new Date(1791994200 * 1000).toISOString(),
      timeLimitMinutes: 20,
      attempts: 1,
      maxGrade: 10,
    });
  });

  it("joins assignments with their submission status, grade and feedback", async () => {
    const c = await createLiveLmsAdapter({ baseUrl: BASE, token: "t", fetch: fakeMoodle().impl }).getCourseContents(101);

    const open = byName(c, "Lab 4: Dynamic Programming — Matrix Chain & LCS");
    if (open.kind !== "assign" || !open.assignment) throw new Error("assign");
    expect(open.assignment).toMatchObject({
      id: 5001,
      assignId: 301,
      courseId: 101,
      submission: "none",
      grade: null,
      maxGrade: 20,
      extended: false,
      dueDate: new Date(1792088940 * 1000).toISOString(),
    });
    expect(open.assignment.intro[0]).toMatchObject({ type: "paragraph" });

    const graded = byName(c, "Lab 3: Greedy Algorithms");
    if (graded.kind !== "assign" || !graded.assignment) throw new Error("assign");
    expect(graded.assignment.submission).toBe("submitted");
    expect(graded.assignment.grade).toMatchObject({ display: expect.stringMatching(/\d+ \/ \d+/), max: 10 });
    expect(graded.assignment.gradedAt).not.toBeNull();
  });

  it("reads the overall course grade from the gradebook", async () => {
    const c = await createLiveLmsAdapter({ baseUrl: BASE, token: "t", fetch: fakeMoodle().impl }).getCourseContents(101);
    expect(c.grade).toEqual({ display: "9", percentage: "30 %" });
  });

  it("falls back gracefully when enrichment calls are not permitted", async () => {
    const { impl } = fakeMoodle({
      failing: [
        "mod_page_get_pages_by_courses",
        "mod_quiz_get_quizzes_by_courses",
        "mod_assign_get_assignments",
        "gradereport_user_get_grade_items",
      ],
    });
    const c = await createLiveLmsAdapter({ baseUrl: BASE, token: "t", fetch: impl }).getCourseContents(101);

    expect(c.grade).toBeNull();
    const page = byName(c, "Recurrences cheat sheet");
    expect(page.kind === "page" && page.content).toEqual([]);
    const a = byName(c, "Lab 4: Dynamic Programming — Matrix Chain & LCS");
    expect(a.kind === "assign" && a.assignment).toBeNull();
    expect(byName(c, "Quiz 2: Dynamic programming")).toMatchObject({ kind: "quiz", openDate: null, timeLimitMinutes: null });
  });

  it("surfaces unsupported activity types without dropping them", async () => {
    const c = await createLiveLmsAdapter({ baseUrl: BASE, token: "t", fetch: fakeMoodle().impl }).getCourseContents(101);
    expect(byName(c, "Live doubt session")).toMatchObject({ kind: "other", modName: "bigbluebuttonbn" });
  });

  it("fails when the essential contents call fails, and maps a bad token to SessionExpiredError", async () => {
    const lms = createLiveLmsAdapter({
      baseUrl: BASE,
      token: "t",
      fetch: fakeMoodle({ failing: ["core_course_get_contents"] }).impl,
    });
    await expect(lms.getCourseContents(101)).rejects.toThrow();

    const stale = createLiveLmsAdapter({ baseUrl: BASE, token: "stale", fetch: fakeMoodle({ expired: true }).impl });
    await expect(stale.getCourseContents(101)).rejects.toBeInstanceOf(SessionExpiredError);
  });
});

describe("mapAssignmentDetails", () => {
  it("extracts submitted files, grade and feedback comments for a graded assignment", () => {
    const details = mapAssignmentDetails(fixture("mod_assign_get_assignments.json"), {
      courseId: 102,
      siteUrl: BASE,
      submissionStatuses: fixture("mod_assign_get_submission_status.bundle.json") as Record<string, unknown>,
    });
    const a = details.get(5002)!;
    expect(a.submission).toBe("submitted");
    expect(a.grade).toEqual({ display: "18 / 20", value: 18, max: 20 });
    expect(a.feedback).toEqual([
      { type: "paragraph", content: [{ text: "Good decomposition. Show the closure computation for R3." }] },
    ]);
    expect(details.has(5001)).toBe(false);
  });

  it("uses a per-student extension as the due date", () => {
    const status = {
      lastattempt: { submission: { status: "new" }, extensionduedate: 1793000000 },
    };
    const details = mapAssignmentDetails(fixture("mod_assign_get_assignments.json"), {
      courseId: 101,
      siteUrl: BASE,
      submissionStatuses: { "301": status },
    });
    expect(details.get(5001)).toMatchObject({
      extended: true,
      dueDate: new Date(1793000000 * 1000).toISOString(),
    });
  });
});

describe("mapCourseContents", () => {
  it("rejects a Moodle exception envelope", () => {
    expect(() =>
      mapCourseContents(fixture("ws_exception_invalidtoken.json"), { courseId: 1, siteUrl: BASE }),
    ).toThrow();
  });

  it("accepts a section with no modules and numbers it by position when Moodle omits it", () => {
    const c = mapCourseContents([{ id: 1, name: "", modules: [] }], { courseId: 7, siteUrl: BASE });
    expect(c.sections).toEqual([{ id: 1, number: 0, name: "General", summary: [], modules: [] }]);
  });
});
