import { describe, expect, it } from "vitest";
import { SessionExpiredError } from "@usp/core";
import { createLiveErpAdapter, MISSING_STUDENT_ID } from "../src/index";

const BASE = "https://erp.example.edu";

const reply = (responseData: unknown, status = 1) =>
  new Response(JSON.stringify({ status, responseData }), {
    headers: { "Content-Type": "application/json" },
  });

/**
 * Fake ERP REST API shaped like the real Angular SPA backend: student
 * endpoints return rows as `responseData` itself, results nest under
 * `SemResult`, and the timetable is a section lookup followed by cells.
 */
function fakeApi() {
  const seen: { url: string; auth: string | null; body: Record<string, unknown> }[] = [];

  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const auth = new Headers(init?.headers).get("authorization");
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    seen.push({ url, auth, body });
    const is = (path: string) => url.endsWith(path);

    if (is("/login_new")) {
      if (body.RegisterNumber === "41110234" && body.Password === "01-01-2006") {
        return reply({ login: { accessToken: "jwt-test-token-123", StudentId: 9001 } });
      }
      return new Response(JSON.stringify({ status: false, message: "Invalid credentials" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (auth !== "Bearer jwt-test-token-123") return new Response("Unauthorized", { status: 401 });

    if (is("MasterStudent/view")) {
      return reply({
        StudentInfo: [
          {
            RegisterNumber: "41110234",
            StudentName: "Test Student",
            ProgrammeName: "B.E. CSE",
            CourseName: "Computer Science",
            Batch: "2024-2028",
            DegreeId: 1,
            CourseId: 12,
            ProgrammeId: 7,
            YearofStudy: 3,
            Section: 4,
            Photo: "AAAA",
          },
        ],
        studentAcademic: [
          { AcademicMonthId: 11, AcademicYear: "2025-2026", Semester: 5 },
          { AcademicMonthId: 5, AcademicYear: "2024-2025", Semester: 4 },
        ],
      });
    }
    if (is("StudentAttendanceHourly/getStudentAcademicHourwise")) {
      return reply([
        { SubjectId: 101, SubjectCode: "CS101", SubjectName: "Networks", TotalHours: 60, WithAttendance: 48, TotalPresent: 40, TotalAbsent: 6, TotalOD: 2, Percentage: "87%" },
        { SubjectId: 205, SubjectCode: "CS205", SubjectName: "OS", TotalHours: 60, WithAttendance: 26, TotalPresent: 26, TotalAbsent: 0, TotalOD: 0, Percentage: "100%" },
      ]);
    }
    if (is("CAEResult/studentCAEResult")) {
      return reply([
        { SubjectCode: "CS101", SubjectName: "Networks", CAEType: 1, Marks: "34", Result: "Pass" },
        { SubjectCode: "CS101", SubjectName: "Networks", CAEType: 2, Marks: "38", Result: "Pass" },
        { SubjectCode: "CS205", SubjectName: "OS", CAEType: 1, Marks: null, Result: "" },
      ]);
    }
    if (is("ResultMark/studentResult")) {
      const rows =
        body.Semester === 4
          ? [
              { Semester: 4, SubjectCode: "EN101", SubjectName: "English", InternalMark: "37", ExternalMark: "29", TotalMark: "66", Result: "Pass" },
              { Semester: 4, SubjectCode: "MA101", SubjectName: "Maths", InternalMark: "20", ExternalMark: "8", TotalMark: "28", Result: "Fail" },
              { Semester: 4, SubjectCode: "MA101", SubjectName: "Maths", InternalMark: "20", ExternalMark: "25", TotalMark: "45", Result: "Pass" },
            ]
          : [];
      return reply({ SemResult: rows });
    }
    if (is("TimetableDetails/getProgrammeSectionAndTimeSetbyCourse")) {
      return reply([{ TimeTableId: 77, ProgrammeSectionId: 5 }]);
    }
    if (is("TimetableDetails/getdatabyprogramme")) {
      return reply([
        { DayId: 1, SubjectIds: "101", TimeFrom: "09:00:00", TimeTo: "09:50:00" },
        { DayId: 1, SubjectIds: "", TimeFrom: "10:40:00", TimeTo: "11:00:00" },
        { DayId: 2, SubjectIds: "999,205", TimeFrom: "09:00:00", TimeTo: "09:50:00" },
      ]);
    }
    if (is("feePortal/getTuitionFees")) {
      return reply([
        { students_yearperiod: "2025-2026", students_semtype_text: "", FeeStatus: "FULL PAID" },
        { students_yearperiod: "2027-2028", students_semtype_text: "", FeeStatus: "NOT YET SCHEDULED" },
        { students_yearperiod: "2027-2028", students_semtype_text: "", FeeStatus: "NOT YET SCHEDULED" },
        { students_yearperiod: "2028-2029", students_semtype_text: "", FeeStatus: "-" },
      ]);
    }
    if (is("feePortal/getHostelFees")) {
      return new Response(JSON.stringify({ status: false, message: "No Records Found" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (is("Notifications/student")) {
      return reply({
        data: [
          {
            NotificationId: 3856,
            Notification:
              '<p style="text-align:center"><img src="https://cdn.example.edu/poster.png" alt=""></p><p>Annual Fest &amp; Hackathon</p><p>14 October 2026</p><p>Register at <a href="https://example.edu/reg">the link</a></p>',
            AttachmentFullPath: null,
            Date: "09/10/2026",
            Time: "11:21 AM",
          },
        ],
      });
    }
    return new Response("Not Found", { status: 404 });
  }) as typeof fetch;

  return { impl, seen };
}

async function signIn(password = "01-01-2006") {
  const { impl, seen } = fakeApi();
  const erp = createLiveErpAdapter({ baseUrl: BASE, authBaseUrl: `${BASE}/login_new`, fetch: impl });
  const result = await erp.authenticate({ username: "41110234", password });
  return { impl, seen, result };
}

describe("live ERP adapter (REST API)", () => {
  it("signs in and keeps the JWT and StudentId, never the password", async () => {
    const { result, seen } = await signIn();
    expect(result.ok).toBe(true);
    const session = JSON.parse(result.session!);
    expect(session).toMatchObject({ token: "jwt-test-token-123", regNo: "41110234", studentId: "9001" });
    expect(result.session).not.toContain("01-01-2006");
    // Login goes to the login service with just register number + password.
    expect(seen[0]!.url).toContain("/login_new");
    expect(seen[0]!.body).toEqual({ RegisterNumber: "41110234", Password: "01-01-2006" });
  });

  it("rejects bad credentials with an error message", async () => {
    const { result } = await signIn("wrong");
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("loads the profile from MasterStudent/view with the Bearer token", async () => {
    const { impl, seen, result } = await signIn();
    const erp = createLiveErpAdapter({ baseUrl: BASE, fetch: impl, session: result.session });
    const profile = await erp.getProfile();
    const view = seen.find((s) => s.url.endsWith("MasterStudent/view"));
    expect(view?.auth).toBe("Bearer jwt-test-token-123");
    expect(view?.body).toEqual({ StudentId: "9001" });
    expect(profile).toMatchObject({ registerNumber: "41110234", name: "Test Student" });
    expect(profile.photoUrl).toBe("data:image/jpeg;base64,AAAA");
  });

  it("reads every section from a valid session", async () => {
    const { impl, seen, result } = await signIn();
    const erp = createLiveErpAdapter({ baseUrl: BASE, fetch: impl, session: result.session });

    const [attendance, marks, results, timetable, fees, notes] = await Promise.all([
      erp.getAttendance(),
      erp.getMarks(),
      erp.getResults(),
      erp.getTimetable(),
      erp.getFees(),
      erp.getNotifications(),
    ]);

    expect(attendance).toHaveLength(2);
    // present + on-duty over the hours actually marked (not the whole-term schedule)
    expect(attendance[0]).toMatchObject({ code: "CS101", attended: 42, totalClasses: 48, percentage: 87.5 });
    expect(attendance[1]).toMatchObject({ attended: 26, totalClasses: 26, percentage: 100 });
    // CAE rows: one entry per subject, components named CAE 1 / CAE 2; the ERP gives no maximum
    expect(marks).toHaveLength(2);
    expect(marks[0]).toMatchObject({ code: "CS101", total: 72, maxTotal: null });
    expect(marks[0]!.components).toEqual([
      { name: "CAE 1", max: 0, scored: 34 },
      { name: "CAE 2", max: 0, scored: 38 },
    ]);
    expect(marks[1]!.components).toEqual([{ name: "CAE 1", max: 0, scored: null }]);

    // one results call per exam session, using that session's ids
    const resultCalls = seen.filter((s) => s.url.endsWith("ResultMark/studentResult"));
    expect(resultCalls.map((c) => c.body.Semester).sort()).toEqual([4, 5]);
    expect(resultCalls[0]!.body).toMatchObject({ RegisterNumber: "41110234" });
    expect(results).toHaveLength(1);
    // marks only: no grades or credits, and the passing re-attempt replaces the fail
    expect(results[0]).toMatchObject({ semester: 4, gpa: null, credits: null });
    expect(results[0]!.results).toEqual([
      { code: "EN101", title: "English", internal: 37, external: 29, total: 66, passed: true },
      { code: "MA101", title: "Maths", internal: 20, external: 25, total: 45, passed: true },
    ]);

    // breaks skipped, elective resolved to the subject the student takes
    expect(timetable).toEqual([
      { day: 0, startTime: "09:00", endTime: "09:50", courseCode: "CS101", courseTitle: "Networks" },
      { day: 1, startTime: "09:00", endTime: "09:50", courseCode: "CS205", courseTitle: "OS" },
    ]);

    // statuses only (no amounts); "-" rows skipped, duplicate upcoming year collapsed
    expect(fees.map((f) => [f.description, f.status])).toEqual([
      ["Tuition fee · 2025-2026", "paid"],
      ["Tuition fee · 2027-2028", "upcoming"],
    ]);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      id: "3856",
      source: "erp",
      title: "Annual Fest & Hackathon",
      body: "14 October 2026\nRegister at the link",
      imageUrl: "https://cdn.example.edu/poster.png",
      url: "https://example.edu/reg",
      date: "2026-10-09T11:21:00+05:30",
    });

    // MasterStudent/view is fetched once and shared across sections
    expect(seen.filter((s) => s.url.endsWith("MasterStudent/view"))).toHaveLength(1);
  });

  it("asks for CAE marks in the term the student is in, not the first one listed", async () => {
    // Real ERP order: a future term (Sem 4, APR-MAY) comes before the current one (Sem 3, OCT-NOV).
    const bodies: Record<string, unknown>[] = [];
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("MasterStudent/view")) {
        return reply({
          StudentInfo: [
            {
              RegisterNumber: "1", CurrentSemester: 3, CurrentAcademicYear: "2026-2027",
              CurrentAcademicMonth: 2, Semester: 3, AcademicYear: "2025-2026",
            },
          ],
          studentAcademic: [
            { AcademicMonthId: 1, AcademicYear: "2026-2027", Semester: 4 },
            { AcademicMonthId: 2, AcademicYear: "2026-2027", Semester: 3 },
            { AcademicMonthId: 1, AcademicYear: "2025-2026", Semester: 2 },
          ],
        });
      }
      if (url.endsWith("CAEResult/studentCAEResult")) {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return reply([]);
      }
      return reply([]);
    }) as typeof fetch;
    const erp = createLiveErpAdapter({
      baseUrl: BASE,
      fetch: impl,
      session: JSON.stringify({ token: "t", regNo: "1", studentId: "9001" }),
    });
    await erp.getMarks();
    expect(bodies).toEqual([
      { RegisterNumber: "1", AcademicMonthId: 2, AcademicYear: "2026-2027", Semester: 3 },
    ]);
  });

  it("returns an empty timetable when the section has none", async () => {
    const impl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("MasterStudent/view")) {
        return reply({ StudentInfo: [{ RegisterNumber: "1" }], studentAcademic: [] });
      }
      return reply({ msg: "Section Not Found" });
    }) as typeof fetch;
    const erp = createLiveErpAdapter({
      baseUrl: BASE,
      fetch: impl,
      session: JSON.stringify({ token: "t", regNo: "1", studentId: "9001" }),
    });
    expect(await erp.getTimetable()).toEqual([]);
  });

  it("throws SessionExpiredError on 401", async () => {
    const erp = createLiveErpAdapter({
      baseUrl: BASE,
      fetch: fakeApi().impl,
      session: JSON.stringify({ token: "expired-token", regNo: "41110234", studentId: "9001" }),
    });
    await expect(erp.getAttendance()).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("throws SessionExpiredError when no session is set", async () => {
    const erp = createLiveErpAdapter({ baseUrl: BASE, fetch: fakeApi().impl });
    await expect(erp.getProfile()).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("asks for a reconnect when the session has no StudentId", async () => {
    const erp = createLiveErpAdapter({
      baseUrl: BASE,
      fetch: fakeApi().impl,
      session: JSON.stringify({ token: "jwt-test-token-123", regNo: "41110234" }),
    });
    await expect(erp.getAttendance()).rejects.toThrow(MISSING_STUDENT_ID);
  });
});
