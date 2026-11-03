import {
  SessionExpiredError,
  buildDailyAttendance,
  type AttendanceSubject,
  type AuthResult,
  type Credentials,
  type DailyAttendance,
  type ErpAdapter,
  type FeeRecord,
  type HourlyDay,
  type LoginChallenge,
  type Notification,
  type SemesterResult,
  type StudentProfile,
  type SubjectMarks,
  type TimetableSlot,
} from "@usp/core";
import { noticeDate, parseNotice } from "./notice";
import { clampRange, parseDailyReply, parseHourlyRows } from "./attendance-days";

/**
 * Live ERP adapter — REST API client for Sathyabama's Angular SPA backend.
 *
 * API base: {ERP_BASE_URL}/erp/api/v1.0/
 * Auth: JWT Bearer token obtained from the login service (see `authBaseUrl`),
 * then used as a Bearer token against the ERP's own data endpoints.
 * All data endpoints are POST, request body is JSON, response envelope is
 * { responseData: { data: [...], count: N, ... } }.
 *
 * Why a separate login service: the ERP's browser login is gated by a
 * Cloudflare Turnstile that a server can't solve. The login service takes a
 * register number + password, signs in, and returns the ERP's real JWT
 * (ProjectIdentifier SATUERP…), which the ERP then accepts on its data calls.
 * The API field is named "DOB" (the default password is the date of birth) but
 * students can change it — we pass our Credentials.password as-is.
 */

export interface LiveErpOptions {
  baseUrl?: string;
  /**
   * Base URL of the login service that exchanges register number + password
   * for the ERP JWT. This is the full login URL, POSTed to as-is. Defaults to {@link DEFAULT_AUTH_BASE}.
   */
  authBaseUrl?: string;
  session?: string;
  /** Per-request timeout (default 20 s). */
  timeoutMs?: number;
  /** Caller-supplied deadline (for example a whole-page budget); aborting it cancels in-flight calls. */
  signal?: AbortSignal;
  /** Extra attempts for read calls after a network error or 5xx (default 1; 0 disables). Never used for login. */
  retries?: number;
  /** Test hook: replaces the 300-700 ms pause before a retry. */
  sleep?: (ms: number) => Promise<void>;
  fetch?: typeof fetch;
  /** Test hook: the clock for day-wise attendance ("today", the 3 pm rule). */
  now?: () => Date;
  onResponse?: (info: { url: string; body: unknown; response: unknown }) => void;
}

const USER_AGENT =
  "Mozilla/5.0 (compatible; UnifiedStudentPortal/0.1; personal student dashboard)";

const API_PATH = "erp/api/v1.0/";

/** Login service that returns the ERP JWT for a register number + password. */
export const DEFAULT_AUTH_BASE = "https://erp.sathyabama.ac.in/erp/api/v1.0/MasterStudent/login_new";

/** Shown when the login service can't be reached or falls over (not for wrong passwords). */
export const ERP_DOWN_MESSAGE =
  "Guys, Sathyabama ERP is down again 💀 Attendance is compulsory, assignments are mandatory, fees are non-refundable, but the server is on permanent vacation 😂🙏 Sathyabama — where even the ERP wants to drop out! 🎓😭";

const ENDPOINTS = {
  view: "MasterStudent/view",
  attendance: "StudentAttendanceHourly/getStudentAcademicHourwise",
  dailyAttendance: "StudentDailyAttendance/StudentWiseAttendance",
  hourlyByDate: "StudentAttendanceHourly/generateStudentwiseReport",
  marks: "CAEResult/studentCAEResult",
  results: "ResultMark/studentResult",
  semesters: "MasterStudent/studentSemesterListByRegNo",
  timetableSection: "TimetableDetails/getProgrammeSectionAndTimeSetbyCourse",
  timetableCells: "TimetableDetails/getdatabyprogramme",
  tuitionFees: "feePortal/getTuitionFees",
  hostelFees: "feePortal/getHostelFees",
  notifications: "Notifications/student",
  notificationsMarquee: "Notifications/getMarqueeNotifications",
} as const;

/** Session predates StudentId capture — the student must reconnect. */
export const MISSING_STUDENT_ID =
  "Missing StudentId — reconnect through the ERP so your data can load.";

export class NotConfiguredError extends Error {
  constructor() {
    super("ERP_BASE_URL is not configured.");
    this.name = "NotConfiguredError";
  }
}

interface ErpSession {
  token: string;
  regNo: string;
  /** Numeric StudentId from the student login response. */
  studentId?: string;
}

/** One exam session from MasterStudent/view `studentAcademic` (current first). */
interface AcademicTerm {
  AcademicMonthId: unknown;
  AcademicYear: unknown;
  Semester: unknown;
}

/** StudentInfo[0] from MasterStudent/view — drives the dependent API calls. */
interface StudentInfo {
  registerNumber: string;
  degreeId: string;
  courseId: string;
  programmeId: string;
  batch: string;
  semester: string;
  yearOfStudy: string;
  section: string;
  terms: AcademicTerm[];
  /** The term the student is in now. `terms` is NOT ordered by recency: it can list a future term first. */
  currentTerm: AcademicTerm | undefined;
  raw: Record<string, unknown>;
}

interface ApiEnvelope {
  responseData?: {
    data?: unknown[];
    count?: number;
    StudentInfo?: Record<string, unknown>[] | Record<string, unknown>;
    studentInfo?: Record<string, unknown>[];
    consolidateMarks?: Record<string, unknown>[];
    sudentImage?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/** Network failures are worth one more try; our own timeout or a caller abort are not. */
function isTransientError(err: unknown): boolean {
  if (err instanceof SessionExpiredError) return false;
  const name = err instanceof Error ? err.name : "";
  return name !== "AbortError" && name !== "TimeoutError";
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 300-700 ms, so parallel calls don't all retry in the same instant. */
const retryPause = () => 300 + Math.floor(Math.random() * 400);

/**
 * A 403 from a bot-protection layer (HTML body or a Cloudflare mitigation header) means
 * "this server was blocked", not "your session expired". Reporting it as an expired
 * session would sign the student out in a loop.
 */
function looksLikeEdgeBlock(res: Response): boolean {
  if (res.headers.get("cf-mitigated")) return true;
  return /text\/html/i.test(res.headers.get("content-type") ?? "");
}

function num(v: unknown, fallback = 0): number {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

class LiveErpAdapter implements ErpAdapter {
  private readonly apiBase: string | null;
  private readonly origin: string | null;
  private readonly authBase: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly callerSignal: AbortSignal | undefined;
  private readonly retries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  private session: ErpSession | null;
  private readonly onResponse: LiveErpOptions["onResponse"];

  constructor(opts: LiveErpOptions) {
    if (opts.baseUrl) {
      const base = opts.baseUrl.replace(/\/+$/, "");
      this.apiBase = `${base}/${API_PATH}`;
      this.origin = new URL(base).origin;
    } else {
      this.apiBase = null;
      this.origin = null;
    }
    this.authBase = (opts.authBaseUrl ?? DEFAULT_AUTH_BASE).replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.fetchImpl = opts.fetch ?? fetch;
    this.callerSignal = opts.signal;
    this.retries = Math.max(0, opts.retries ?? 1);
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? (() => new Date());
    this.onResponse = opts.onResponse;

    if (opts.session) {
      try {
        this.session = JSON.parse(opts.session) as ErpSession;
      } catch {
        this.session = null;
      }
    } else {
      this.session = null;
    }
  }

  private studentInfoPromise: Promise<StudentInfo> | null = null;

  private get regNo(): string {
    if (!this.session) throw new SessionExpiredError("erp");
    return this.session.regNo;
  }

  private get studentId(): string {
    if (!this.session) throw new SessionExpiredError("erp");
    if (!this.session.studentId) throw new Error(MISSING_STUDENT_ID);
    return this.session.studentId;
  }

  /**
   * MasterStudent/view returns the student's record (StudentInfo[0]), which
   * carries the ids the attendance/timetable/results calls key on. Memoized so
   * a single dashboard load (many parallel getX calls) fetches it only once.
   */
  private getStudentInfo(): Promise<StudentInfo> {
    if (!this.studentInfoPromise) {
      this.studentInfoPromise = this.post(ENDPOINTS.view, {
        StudentId: this.studentId,
      }).then((env) => {
        const rd = env.responseData;
        const si = rd?.StudentInfo;
        const info = (Array.isArray(si) ? si[0] : si) as Record<string, unknown> | undefined;
        if (!info) throw new Error("ERP returned no student record.");
        const terms = Array.isArray(rd?.studentAcademic)
          ? (rd.studentAcademic as AcademicTerm[])
          : [];
        const curSem = str(info.CurrentSemester || info.Semester);
        const curYear = str(info.CurrentAcademicYear);
        const curMonth = str(info.CurrentAcademicMonth);
        const sameTerm = (t: AcademicTerm) => str(t.Semester) === curSem;
        const currentTerm =
          terms.find(
            (t) =>
              sameTerm(t) &&
              (!curYear || str(t.AcademicYear) === curYear) &&
              (!curMonth || str(t.AcademicMonthId) === curMonth),
          ) ??
          terms.find(sameTerm) ??
          terms[0];
        return {
          registerNumber: str(info.RegisterNumber) || this.regNo,
          degreeId: str(info.DegreeId),
          courseId: str(info.CourseId),
          programmeId: str(info.ProgrammeId),
          batch: str(info.Batch || info.BatchId),
          semester: str(info.CurrentSemester || info.Semester || info.SemesterId || currentTerm?.Semester),
          yearOfStudy: str(info.YearofStudy || info.Year),
          section: str(info.Section || info.SectionId),
          terms,
          currentTerm,
          raw: info,
        };
      });
    }
    return this.studentInfoPromise;
  }

  private url(endpoint: string): string {
    if (!this.apiBase) throw new NotConfiguredError();
    return `${this.apiBase}${endpoint}`;
  }

  /** Per-request timeout, combined with the caller's overall deadline when there is one. */
  private requestSignal(): AbortSignal {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    return this.callerSignal ? AbortSignal.any([timeout, this.callerSignal]) : timeout;
  }

  /**
   * Every data call is a read (even though the ERP wants POST), so one jittered
   * retry on a network error or 5xx is safe. 4xx answers are returned as-is.
   */
  private async send(endpoint: string, body: Record<string, unknown>): Promise<Response> {
    const token = this.session?.token;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await this.fetchImpl(this.url(endpoint), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "User-Agent": USER_AGENT,
            ...(this.origin && {
              Origin: this.origin,
              Referer: `${this.origin}/`,
            }),
          },
          body: JSON.stringify(body),
          signal: this.requestSignal(),
        });
        if (res.status < 500 || attempt >= this.retries) return res;
        await res.body?.cancel().catch(() => undefined);
      } catch (err) {
        if (attempt >= this.retries || this.callerSignal?.aborted || !isTransientError(err)) throw err;
      }
      await this.sleep(retryPause());
      if (this.callerSignal?.aborted) throw this.callerSignal.reason ?? new Error("Request cancelled.");
    }
  }

  private async post(endpoint: string, body: Record<string, unknown> = {}): Promise<ApiEnvelope> {
    if (!this.session?.token) throw new SessionExpiredError("erp");

    const res = await this.send(endpoint, body);

    if (res.status === 401) throw new SessionExpiredError("erp");
    if (res.status === 403) {
      if (looksLikeEdgeBlock(res)) {
        throw new Error(
          "The ERP refused a request from this server (HTTP 403). It may block this host; your sign-in is probably still valid.",
        );
      }
      throw new SessionExpiredError("erp");
    }
    if (!res.ok) {
      throw new Error(`ERP API ${endpoint} returned HTTP ${res.status}`);
    }

    let json: ApiEnvelope;
    try {
      json = (await res.json()) as ApiEnvelope;
    } catch {
      throw new Error("The ERP sent a reply this app can't read. It may be down or blocking this server.");
    }
    this.onResponse?.({ url: this.url(endpoint), body, response: json });
    return json;
  }

  /** Student endpoints return rows as `responseData` itself; list endpoints use `.data`. */
  private data(envelope: ApiEnvelope): unknown[] {
    const rd: unknown = envelope.responseData;
    if (Array.isArray(rd)) return rd;
    const rows = (rd as { data?: unknown } | undefined)?.data;
    return Array.isArray(rows) ? rows : [];
  }

  async prepareLogin(): Promise<LoginChallenge> {
    return { state: "{}" };
  }

  async authenticate(creds: Credentials): Promise<AuthResult> {
    if (!this.apiBase) throw new NotConfiguredError();

    const regNo = creds.username.trim();
    if (!regNo || !creds.password) {
      return { ok: false, error: "Register number and password are required." };
    }

    // The login service signs in on the ERP (past its Turnstile) and returns
    // the ERP's own JWT, which our data calls then carry as a Bearer token.
    const loginUrl = this.authBase;
    let res: Response;
    try {
      res = await this.fetchImpl(loginUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify({ RegisterNumber: regNo, Password: creds.password }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      // Network failure or timeout: the ERP side isn't answering.
      return { ok: false, error: ERP_DOWN_MESSAGE };
    }

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    this.onResponse?.({ url: loginUrl, body: { RegisterNumber: regNo }, response: json });

    // A 5xx, or an error page instead of JSON, means the ERP is down, not a bad password.
    if (res.status >= 500 || (!res.ok && !json)) {
      return { ok: false, error: ERP_DOWN_MESSAGE };
    }

    if (!res.ok || json?.status === false) {
      const msg = str(json?.message) || `Login service returned HTTP ${res.status}`;
      return { ok: false, error: msg };
    }

    if (!json) {
      return { ok: false, error: ERP_DOWN_MESSAGE };
    }

    const rd = json.responseData as Record<string, unknown> | undefined;
    const loginData = rd?.login as Record<string, unknown> | undefined;
    const token =
      str(loginData?.accessToken) ||
      str(rd?.["Access-Token"]) ||
      str(rd?.token) ||
      str(rd?.accessToken) ||
      str((rd?.data as Record<string, unknown>[])?.[0]?.["Access-Token"]);

    if (!token) {
      const msg = str(rd?.message) || str(json.message) || "Invalid credentials.";
      return { ok: false, error: msg };
    }

    // Student logins return StudentId; IdentityId is the staff/admin field.
    const studentId = str(loginData?.StudentId ?? loginData?.IdentityId) || undefined;
    const session: ErpSession = { token, regNo, studentId };
    return { ok: true, session: JSON.stringify(session) };
  }

  async getProfile(): Promise<StudentProfile> {
    const si = await this.getStudentInfo();
    const info = si.raw;
    const photo = str(info.StudentPhoto || info.Photo || info.Image);

    return {
      registerNumber: si.registerNumber,
      name: str(info.StudentName || info.Name || info.FirstName),
      program: str(info.ProgrammeName || info.StudentProgramme || info.CourseName),
      department: str(info.CourseName || info.DepartmentName || info.ProgrammeName),
      semester: num(info.Semester || info.SemesterId) || null,
      batch: str(info.Batch || info.BatchName) || undefined,
      email: str(info.Email || info.EmailId || info.StudentEmail) || undefined,
      phone: str(info.MobileNo || info.Mobile || info.StudentPhone) || undefined,
      photoUrl: photo
        ? photo.startsWith("data:") || photo.startsWith("http")
          ? photo
          : `data:image/jpeg;base64,${photo}`
        : undefined,
      section: str(info.SectionName || info.Section) || undefined,
      advisor: str(info.AdvisorName || info.StudentAdvisor) || undefined,
      arrears: info.NumberofArrears == null ? undefined : num(info.NumberofArrears),
    };
  }

  private attendancePromise: Promise<Record<string, unknown>[]> | null = null;

  /** Current-year subjects with hours; shared by attendance and timetable naming. */
  private attendanceRows(): Promise<Record<string, unknown>[]> {
    this.attendancePromise ??= this.post(ENDPOINTS.attendance, {
      StudentId: this.studentId,
    }).then((env) => this.data(env) as Record<string, unknown>[]);
    return this.attendancePromise;
  }

  async getAttendance(): Promise<AttendanceSubject[]> {
    const rows = await this.attendanceRows();
    return rows.map((r) => {
      // TotalHours is the whole-term schedule; WithAttendance is what has actually
      // been marked so far, which is what the percentage is measured against.
      const attended = num(r.TotalPresent) + num(r.TotalOD);
      const totalClasses = Math.max(num(r.WithAttendance), attended + num(r.TotalAbsent));
      return {
        code: str(r.SubjectCode),
        title: str(r.SubjectName),
        totalClasses,
        attended,
        percentage:
          totalClasses > 0
            ? Math.round((attended / totalClasses) * 10000) / 100
            : num(str(r.Percentage).replace("%", "")),
      };
    });
  }

  /**
   * Day-wise attendance, decided with the ERP page's own rule (`buildDailyAttendance`).
   * The ERP warns when a range crosses its academic month, so the range is narrowed
   * to the window the first reply reports and asked again if that changed it:
   * at most two calls.
   */
  async getDailyAttendance(from: string, to: string): Promise<DailyAttendance> {
    const ask = async (f: string, t: string) => {
      const env = await this.post(ENDPOINTS.dailyAttendance, {
        FromDate: f,
        ToDate: t,
        StudentId: this.studentId,
      });
      return parseDailyReply(env.responseData);
    };
    let range = { from, to };
    let reply = await ask(from, to);
    if (reply.academicWindow) {
      const clamped = clampRange(range, reply.academicWindow);
      if (clamped.from !== range.from || clamped.to !== range.to) {
        range = clamped;
        reply = await ask(range.from, range.to);
      }
    }
    const daily = buildDailyAttendance({ ...range, ...reply }, this.now());
    return reply.academicWindow ? { ...daily, academicWindow: reply.academicWindow } : daily;
  }

  /** Hour-wise attendance per date: hours present, absent and not entered yet. */
  async getHourlyAttendance(from: string, to: string): Promise<HourlyDay[]> {
    const env = await this.post(ENDPOINTS.hourlyByDate, {
      Date: from,
      DateTo: to,
      StudentId: this.studentId,
    });
    return parseHourlyRows(this.data(env), { from, to });
  }

  /** Body shared by the per-term results and CAE (internal marks) calls. */
  private termBody(si: StudentInfo, t: AcademicTerm): Record<string, unknown> {
    return {
      RegisterNumber: si.registerNumber,
      AcademicMonthId: t.AcademicMonthId,
      AcademicYear: t.AcademicYear,
      Semester: t.Semester,
    };
  }

  async getMarks(): Promise<SubjectMarks[]> {
    const si = await this.getStudentInfo();
    const current = si.currentTerm;
    if (!current) return [];
    const env = await this.post(ENDPOINTS.marks, this.termBody(si, current));
    const rows = this.data(env) as Record<string, unknown>[];

    const bySubject = new Map<string, { code: string; title: string; components: SubjectMarks["components"] }>();
    // Real CAE rows are { SubjectCode, SubjectName, Marks, CAEType: 1 | 2 | 3, Result }
    // with no maximum, so max stays 0 ("unknown") unless the row supplies one.
    for (const r of rows) {
      const code = str(r.SubjectCode || r.CourseCode);
      if (!code) continue;
      let entry = bySubject.get(code);
      if (!entry) {
        entry = { code, title: str(r.SubjectName || r.CourseName), components: [] };
        bySubject.set(code, entry);
      }
      const raw = r.Marks ?? r.ObtainedMarks;
      const scored = raw == null || str(raw) === "" ? null : num(raw);
      const type = str(r.CAEType);
      entry.components.push({
        name: /^[0-9]+$/.test(type) ? `CAE ${type}` : str(r.ExamType || r.ComponentName || type),
        max: num(r.MaxMarks || r.TotalMarks),
        scored,
      });
    }

    return [...bySubject.values()].map((s) => {
      const graded = s.components.filter((c) => c.scored !== null);
      return {
        code: s.code,
        title: s.title,
        components: s.components,
        total: graded.length ? graded.reduce((sum, c) => sum + (c.scored ?? 0), 0) : null,
        maxTotal:
          graded.length && graded.every((c) => c.max > 0)
            ? graded.reduce((sum, c) => sum + c.max, 0)
            : null,
      };
    });
  }

  async getResults(): Promise<SemesterResult[]> {
    const si = await this.getStudentInfo();
    if (si.terms.length === 0) return [];

    // One call per exam session; a single failing session shouldn't hide the rest.
    let firstError: unknown = null;
    const perTerm = await Promise.all(
      si.terms.map((t) =>
        this.post(ENDPOINTS.results, this.termBody(si, t))
          .then((env) => {
            const sem = env.responseData?.SemResult;
            const rows = (Array.isArray(sem) ? sem : this.data(env)) as Record<string, unknown>[];
            return rows.map((r) => ({ r, termSem: num(t.Semester) }));
          })
          .catch((e: unknown) => {
            if (e instanceof SessionExpiredError) throw e;
            firstError ??= e;
            return [];
          }),
      ),
    );
    const rows = perTerm.flat();
    if (rows.length === 0 && firstError) throw firstError;

    // The ERP publishes marks and Pass/Fail only (no grades or credits).
    // Arrear re-attempts repeat a course; keep the passing / higher-scoring attempt.
    const mark = (v: unknown) => (v == null || str(v) === "" ? null : num(v));
    const best = new Map<string, { sem: number; result: SemesterResult["results"][number] }>();
    for (const { r, termSem } of rows) {
      const sem = num(r.Semester || r.SemesterNo) || termSem;
      const code = str(r.SubjectCode || r.CourseCode);
      if (!sem || !code) continue;
      const result = {
        code,
        title: str(r.SubjectName || r.CourseName),
        internal: mark(r.InternalMark),
        external: mark(r.ExternalMark),
        total: mark(r.TotalMark),
        passed: str(r.Result).toLowerCase() === "pass",
      };
      const key = `${sem}:${code}`;
      const prev = best.get(key);
      const better =
        !prev ||
        (result.passed && !prev.result.passed) ||
        (result.passed === prev.result.passed && (result.total ?? 0) > (prev.result.total ?? 0));
      if (better) best.set(key, { sem, result });
    }

    const bySem = new Map<number, { results: SemesterResult["results"] }>();
    for (const { sem, result } of best.values()) {
      const entry = bySem.get(sem) ?? { results: [] };
      entry.results.push(result);
      bySem.set(sem, entry);
    }

    return [...bySem.entries()]
      .sort(([a], [b]) => a - b)
      .map(([sem, e]) => ({ semester: sem, gpa: null, credits: null, results: e.results }));
  }

  /**
   * The ERP's student timetable is a chain: find the section's timetable, then
   * read its cells. Cells carry only numeric SubjectIds, so names come from the
   * student's own subject list (attendance rows); elective cells list every
   * option, and the one the student actually takes is the one in that list.
   */
  async getTimetable(): Promise<TimetableSlot[]> {
    const si = await this.getStudentInfo();
    const section = await this.post(ENDPOINTS.timetableSection, {
      DegreeId: si.degreeId,
      CourseId: si.courseId,
      ProgrammeId: si.programmeId,
      Batch: si.batch,
      Semester: si.semester,
      Year: si.yearOfStudy,
      SectionId: si.section,
    });
    const found = this.data(section)[0] as Record<string, unknown> | undefined;
    if (!found?.TimeTableId) return []; // "Section Not Found": no timetable published

    const [cellsEnv, subjectRows] = await Promise.all([
      this.post(ENDPOINTS.timetableCells, {
        TimeTableId: found.TimeTableId,
        ProgrammeSectionId: found.ProgrammeSectionId,
      }),
      this.attendanceRows().catch(() => [] as Record<string, unknown>[]),
    ]);

    const subjects = new Map<number, { code: string; title: string }>();
    for (const r of subjectRows) {
      const id = num(r.SubjectId);
      if (id) {
        subjects.set(id, {
          code: str(r.SubjectCode || r.CourseCode),
          title: str(r.SubjectName || r.CourseName),
        });
      }
    }

    const slots: TimetableSlot[] = [];
    for (const c of this.data(cellsEnv) as Record<string, unknown>[]) {
      const ids = str(c.SubjectIds).split(",").map(Number).filter(Boolean);
      if (ids.length === 0) continue; // break / free hour
      const subjectId = ids.find((id) => subjects.has(id)) ?? ids[0]!;
      const subject = subjects.get(subjectId);
      const day = num(c.DayId) - 1; // ERP DayId 1 = Monday; ours 0 = Monday
      if (day < 0 || day > 6) continue;
      slots.push({
        day,
        startTime: str(c.TimeFrom).slice(0, 5),
        endTime: str(c.TimeTo).slice(0, 5),
        courseCode: subject?.code || `#${subjectId}`,
        courseTitle: subject?.title || "Class",
      });
    }
    return slots;
  }

  async getFees(): Promise<FeeRecord[]> {
    // The ERP reports a status per academic year ("FULL PAID", "NOT YET SCHEDULED")
    // and no amounts; hostel has no records for day scholars.
    const results: FeeRecord[] = [];
    const seen = new Set<string>();

    const feeEndpoints = [
      [ENDPOINTS.tuitionFees, "Tuition fee"],
      [ENDPOINTS.hostelFees, "Hostel fee"],
    ] as const;
    for (const [ep, label] of feeEndpoints) {
      try {
        const env = await this.post(ep, { RegisterNumber: this.regNo });
        for (const r of this.data(env) as Record<string, unknown>[]) {
          const state = str(r.FeeStatus).toUpperCase();
          if (!state || state === "-") continue;
          const year = str(r.students_yearperiod || r.AcademicYear);
          const term = str(r.students_semtype_text);
          const description = [label, year, term].filter(Boolean).join(" · ");
          const status: FeeRecord["status"] = state.includes("NOT YET")
            ? "upcoming"
            : state.includes("FULL") && state.includes("PAID")
              ? "paid"
              : "due";
          const key = `${description}|${status}`;
          if (seen.has(key)) continue;
          seen.add(key);
          results.push({
            description,
            amount: num(r.Amount || r.TotalAmount || r.FeeAmount),
            paid: status === "paid",
            status,
            dueDate: str(r.DueDate) || undefined,
            paidDate: str(r.PaidDate || r.PaymentDate) || undefined,
            receiptNo: str(r.ReceiptNo || r.TransactionId) || undefined,
          });
        }
      } catch (e) {
        if (e instanceof SessionExpiredError || this.callerSignal?.aborted) throw e;
        // Individual fee endpoints may fail; continue with others
      }
    }
    return results;
  }

  async getNotifications(): Promise<Notification[]> {
    const env = await this.post(ENDPOINTS.notifications, {
      columnSort: { fieldName: "NotificationId", sortDirection: "DESC" },
      paging: { pageNo: 0, pageSize: 25, totalCount: 0, offSet: 0 },
    });
    const rows = this.data(env) as Record<string, unknown>[];

    return rows.map((r, i) => {
      const notice = parseNotice(str(r.Notification));
      return {
        id: str(r.NotificationId) || `erp-notif-${i}`,
        title: notice.title,
        body: notice.body,
        date: noticeDate(str(r.Date), str(r.Time)) ?? new Date().toISOString(),
        source: "erp" as const,
        url: str(r.AttachmentFullPath) || notice.link,
        imageUrl: notice.imageUrl,
        // The ERP keeps no per-student read state for notices.
        read: true,
      };
    });
  }
}

export function createLiveAdapter(opts: LiveErpOptions = {}): ErpAdapter {
  return new LiveErpAdapter(opts);
}
