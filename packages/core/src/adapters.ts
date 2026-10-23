import type {
  StudentProfile,
  AttendanceSubject,
  SubjectMarks,
  SemesterResult,
  TimetableSlot,
  FeeRecord,
  LmsCourse,
  Assignment,
  CalendarEvent,
  Notification,
  DailyAttendance,
  HourlyDay,
} from "./types";
import type { CourseContents } from "./lms-content";

/**
 * Credentials are supplied by the user at runtime and held ONLY server-side.
 * Adapters never persist them; the server layer is responsible for encrypted
 * session storage.
 */
export interface Credentials {
  username: string;
  password: string;
  /** The captcha text the user typed, when the portal shows one. */
  captcha?: string;
}

/**
 * A pending sign-in prepared before the user submits: the portal's login-form
 * state plus the captcha image (if any) for the user to solve themselves.
 */
export interface LoginChallenge {
  /** Opaque, serialized form + cookie state. Must be sealed before leaving the server. */
  state: string;
  /** `data:` URL of the captcha image, when the portal requires one. */
  captchaImage?: string;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  /** The portal wants a captcha and none (or a wrong one) was supplied. */
  captchaRequired?: boolean;
  /**
   * Serialized portal session (ERP cookie jar / Moodle token). The web layer
   * stores it inside the encrypted session cookie and hands it back to the
   * adapter factory on every request, so adapters stay stateless across
   * serverless invocations. Never contains the password.
   */
  session?: string;
}

/** Thrown by live adapters when the portal session has expired or was rejected. */
export class SessionExpiredError extends Error {
  constructor(public readonly source: "erp" | "lms") {
    super(`${source.toUpperCase()} session expired — please sign in again.`);
    this.name = "SessionExpiredError";
  }
}

/**
 * Every data source implements a thin, typed interface. The UI depends on these
 * interfaces, never on a concrete source — so a mock and the real scraper are
 * interchangeable (the `DATA_SOURCE` env var picks which).
 */
export interface ErpAdapter {
  /** Fetch the login form (and captcha) ahead of time. Live portals only. */
  prepareLogin?(): Promise<LoginChallenge>;
  /** `challengeState` is `LoginChallenge.state` from a previous prepareLogin(). */
  authenticate(creds: Credentials, challengeState?: string): Promise<AuthResult>;
  getProfile(): Promise<StudentProfile>;
  getAttendance(): Promise<AttendanceSubject[]>;
  getMarks(): Promise<SubjectMarks[]>;
  getResults(): Promise<SemesterResult[]>;
  getTimetable(): Promise<TimetableSlot[]>;
  getFees(): Promise<FeeRecord[]>;
  getNotifications(): Promise<Notification[]>;
  /**
   * Day-wise attendance between two campus dates ("YYYY-MM-DD", inclusive). The
   * adapter may narrow the range to the ERP's academic month; `window` says what
   * was actually read.
   */
  getDailyAttendance?(from: string, to: string): Promise<DailyAttendance>;
  /** Hour-wise attendance per date between two campus dates ("YYYY-MM-DD", inclusive). */
  getHourlyAttendance?(from: string, to: string): Promise<HourlyDay[]>;
}

export interface LmsAdapter {
  authenticate(creds: Credentials): Promise<AuthResult>;
  getCourses(): Promise<LmsCourse[]>;
  getAssignments(): Promise<Assignment[]>;
  getCalendar(): Promise<CalendarEvent[]>;
  getNotifications(): Promise<Notification[]>;
  /** Sections, activities and assignment detail for one course. */
  getCourseContents(courseId: number): Promise<CourseContents>;
}
