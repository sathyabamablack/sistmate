import "server-only";

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache as reactCache } from "react";
import { z } from "zod";
import {
  AssignmentSchema,
  AttendanceSubjectSchema,
  CalendarEventSchema,
  DailyAttendanceSchema,
  DashboardDataSchema,
  FeeRecordSchema,
  HourlyDaySchema,
  LmsCourseSchema,
  NotificationSchema,
  SemesterResultSchema,
  SessionExpiredError,
  StudentProfileSchema,
  SubjectMarksSchema,
  TimetableSlotSchema,
  addDays,
  campusNow,
  estimateGrades,
  hasGrades,
  type CalendarEvent,
  type DailyAttendance,
  type DashboardData,
  type ErpAdapter,
  type HourlyDay,
  type LmsAdapter,
  type Notification,
  type StudentProfile,
} from "@usp/core";
import {
  createMockErpAdapter,
  createLiveErpAdapter,
  type LiveErpOptions,
} from "@usp/erp-adapter";
import { createMockLmsAdapter, createLiveLmsAdapter } from "@usp/lms-adapter";
import { createCache, type Cache } from "@usp/cache";
import { dataSource, getSession, type SessionData } from "./session";
import { erpSessionExpiry } from "./jwt";
import { staleIssueMessage } from "./issues";
import { SectionShapeError, SectionTimeoutError, raceDeadline } from "./deadline";
import { withCurrentDates } from "./mock-clock";
import { isDuplicateDeadline } from "./timeline";
import {
  GRADING_COOKIE,
  creditsResolver,
  parseGradingSettings,
  presetById,
  type GradingSettings,
} from "./grading-presets";
import { displayCourse, erpSubjects } from "./course-names";
import { PERIOD_CACHE_SECTIONS } from "./attendance-range";

/**
 * Server-only data layer.
 *
 * Builds one validated DashboardData snapshot per request from the ERP + LMS
 * adapters. Each section loads independently: a failing section becomes an
 * entry in `issues` and an empty list, never a crashed page.
 */

/**
 * How long a section is reused before the portal is asked again. Today's day-wise
 * and hour-wise attendance change during the day (hours get entered, the 3 pm rule
 * flips today to present); three minutes keeps that fresh enough, and "Check again"
 * / Refresh data drop the saved copy straight away.
 */
const TTL_MS = 3 * 60 * 1000;

/** Hour-wise attendance covers this many days, today included. */
export const HOURLY_DAYS = 14;

/**
 * One budget for everything a page load asks of the ERP and Moodle. It sits
 * under the routes' `maxDuration` (30 s) so a slow portal turns into the usual
 * per-section message instead of a platform 504.
 */
const DEADLINE_MS = 25_000;

/** Each section is validated on its own, so one bad section cannot take the page down. */
const SECTION_SCHEMAS = {
  profile: StudentProfileSchema.nullable(),
  attendance: z.array(AttendanceSubjectSchema),
  marks: z.array(SubjectMarksSchema),
  results: z.array(SemesterResultSchema),
  timetable: z.array(TimetableSlotSchema),
  fees: z.array(FeeRecordSchema),
  notifications: z.array(NotificationSchema),
  courses: z.array(LmsCourseSchema),
  assignments: z.array(AssignmentSchema),
  calendar: z.array(CalendarEventSchema),
  dailyAttendance: DailyAttendanceSchema.nullable(),
  hourlyAttendance: z.array(HourlyDaySchema),
} as const;

// Serverless hosts (Vercel) only allow writes under the OS temp dir.
const cacheStore = createCache({
  dir: process.env.VERCEL
    ? path.join(os.tmpdir(), "usp-cache")
    : path.join(process.cwd(), "data", "cache"),
});

const SECTIONS = [
  "profile",
  "attendance",
  "daily-attendance",
  "hourly-attendance",
  "marks",
  "results",
  "timetable",
  "fees",
  "erp-notifications",
  "courses",
  "assignments",
  "lms-calendar",
  "lms-notifications",
] as const;
type Section = (typeof SECTIONS)[number];

/** Cache keys are scoped per user so one student can never see another's data. */
function userScope(username: string): string {
  const id = createHash("sha256").update(username).digest("hex").slice(0, 16);
  return `usp:${dataSource()}:${id}`;
}

// Tokens, passwords/OTPs and government ids: the ERP returns these to the browser, but
// they have no business on disk. (captures/ is gitignored, this is defence in depth.)
const SECRET_KEY = /^(accesstoken|access-token|token)$|dob|password|otp|aadhar|aadhaar|pan$/i;

function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !SECRET_KEY.test(k))
        .map(([k, v]) => [k, stripSecrets(v)]),
    );
  }
  return value;
}

/**
 * Dev-only: ERP_CAPTURE=1 saves each raw ERP response (secrets stripped) to
 * captures/live/ — gitignored — so field mappings can be fitted to real data.
 */
function captureWriter(): LiveErpOptions["onResponse"] {
  if (process.env.ERP_CAPTURE !== "1" || process.env.VERCEL) return undefined;
  const dir = path.join(process.cwd(), "..", "..", "captures", "live");
  return ({ url, response }) => {
    const name = url.split("/api/v1.0/")[1]?.replace(/\//g, "__") ?? "unknown";
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, `${name}.json`),
        JSON.stringify(stripSecrets(response), null, 2),
      );
    } catch (err) {
      console.error(`[capture] ${name}: ${err instanceof Error ? err.message : err}`);
    }
  };
}

/**
 * Dev-only: ERP_REPLAY=1 answers ERP calls from captures/live/ instead of the
 * network, so UI work runs against real response shapes without a live session.
 */
function replayFetch(): typeof fetch | undefined {
  if (process.env.ERP_REPLAY !== "1" || process.env.VERCEL) return undefined;
  const dir = path.join(process.cwd(), "..", "..", "captures", "live");
  return (async (input: RequestInfo | URL) => {
    const name = String(input).split("/api/v1.0/")[1]?.replaceAll("/", "__") ?? "";
    try {
      return new Response(fs.readFileSync(path.join(dir, `${name}.json`), "utf8"), {
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ status: false, message: "No Records Found" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }) as typeof fetch;
}

function getAdapters(
  session: SessionData,
  signal: AbortSignal,
): {
  erp: ErpAdapter;
  lms: LmsAdapter | null;
} {
  if (dataSource() === "live") {
    return {
      erp: createLiveErpAdapter({
        baseUrl: process.env.ERP_BASE_URL,
        session: session.erpSession,
        signal,
        onResponse: captureWriter(),
        fetch: replayFetch(),
      }),
      lms: session.lmsToken
        ? createLiveLmsAdapter({ baseUrl: process.env.LMS_BASE_URL, token: session.lmsToken, signal })
        : null,
    };
  }
  return {
    erp: withCurrentDates(createMockErpAdapter()),
    lms: withCurrentDates(createMockLmsAdapter()),
  };
}

/**
 * For lib/attendance-period.ts (the Attendance page's period picker): the signed-in
 * student's ERP adapter on its own time budget, plus the same cache, key scope and
 * TTL the dashboard sections use.
 */
export async function periodErpContext(): Promise<{
  erp: ErpAdapter;
  scope: string;
  cache: Cache;
  ttlMs: number;
  deadline: AbortSignal;
}> {
  const session = await getSession();
  if (!session.username) throw new NotSignedInError();
  const deadline = AbortSignal.timeout(DEADLINE_MS);
  return { erp: getAdapters(session, deadline).erp, scope: userScope(session.username), cache: cacheStore, ttlMs: TTL_MS, deadline };
}

type Issue = DashboardData["issues"][number];

const byDateAsc = (a: { date: string }, b: { date: string }) =>
  new Date(a.date).getTime() - new Date(b.date).getTime();

/** The student's grading preset and credit corrections, read from their cookie. */
export async function getGradingSettings(): Promise<GradingSettings> {
  return parseGradingSettings((await cookies()).get(GRADING_COOKIE)?.value);
}

export class NotSignedInError extends Error {
  /** true when a session existed but the portal rejected it */
  constructor(public readonly expired = false) {
    super(expired ? "Portal session expired." : "Not signed in.");
    this.name = "NotSignedInError";
  }
}

/**
 * Deduplicated per request via React `cache`, so the layout and the page can
 * both call it without fetching twice.
 */
export const getDashboardData = reactCache(async (): Promise<DashboardData> => {
  const session = await getSession();
  if (!session.username) throw new NotSignedInError();

  // The ERP token carries its own expiry. If it has passed, say so now instead of
  // letting every section fail one by one.
  if (dataSource() === "live") {
    const expiresAt = erpSessionExpiry(session.erpSession);
    if (expiresAt !== null && expiresAt <= Date.now()) throw new NotSignedInError(true);
  }

  const scope = userScope(session.username);
  const deadline = AbortSignal.timeout(DEADLINE_MS);
  const { erp, lms } = getAdapters(session, deadline);
  const issues: Issue[] = [];
  let expired = false;

  async function load<T>(
    section: Section,
    source: "erp" | "lms",
    fn: (() => Promise<unknown>) | null,
    fallback: T,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<T> {
    if (!fn) return fallback;

    // Fetch, then validate. Only data that passed validation is cached, and a
    // failure here lets the cache fall back to the last good copy.
    const fetchValid = async (): Promise<T> => {
      let raw: unknown;
      try {
        raw = await raceDeadline(fn(), deadline, source);
      } catch (err) {
        if (deadline.aborted && !(err instanceof SessionExpiredError)) throw new SectionTimeoutError(source);
        throw err;
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        // Field paths and codes only: the values are the student's data.
        const where = parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".") || "(root)"}:${i.code}`)
          .join(", ");
        console.error(`[data] ${source}/${section}: unexpected shape (${where})`);
        throw new SectionShapeError(source);
      }
      return parsed.data;
    };

    try {
      return await cacheStore.wrap<T>(`${scope}:${section}`, TTL_MS, fetchValid, {
        // The refresh failed but an earlier copy exists: show it, with a gentle notice.
        onStale: ({ storedAt }) => {
          issues.push({ section, source, message: staleIssueMessage(storedAt) });
        },
        // An expired session must still send the student to sign in again.
        serveStaleOn: (err) => !(err instanceof SessionExpiredError),
      });
    } catch (err) {
      if (err instanceof SessionExpiredError) expired = true;
      const message = err instanceof Error ? err.message : "Failed to load.";
      // Log the section and message only — never request bodies or credentials.
      console.error(`[data] ${source}/${section}: ${message}`);
      issues.push({ section, source, message });
      return fallback;
    }
  }

  // Day-wise: the current month so far. Hour-wise: the last two weeks, today included.
  const today = campusNow().date;
  const monthFrom = `${today.slice(0, 7)}-01`;
  const hourlyFrom = addDays(today, -(HOURLY_DAYS - 1));

  const [
    profile,
    attendance,
    dailyAttendance,
    hourlyAttendance,
    marks,
    results,
    timetable,
    fees,
    erpNotifications,
    courses,
    assignments,
    lmsCalendar,
    lmsNotifications,
  ] = await Promise.all([
    load<StudentProfile | null>("profile", "erp", () => erp.getProfile(), null, SECTION_SCHEMAS.profile),
    load("attendance", "erp", () => erp.getAttendance(), [], SECTION_SCHEMAS.attendance),
    load<DailyAttendance | null>(
      "daily-attendance",
      "erp",
      erp.getDailyAttendance ? () => erp.getDailyAttendance!(monthFrom, today) : null,
      null,
      SECTION_SCHEMAS.dailyAttendance,
    ),
    load<HourlyDay[]>(
      "hourly-attendance",
      "erp",
      erp.getHourlyAttendance ? () => erp.getHourlyAttendance!(hourlyFrom, today) : null,
      [],
      SECTION_SCHEMAS.hourlyAttendance,
    ),
    load("marks", "erp", () => erp.getMarks(), [], SECTION_SCHEMAS.marks),
    load("results", "erp", () => erp.getResults(), [], SECTION_SCHEMAS.results),
    load("timetable", "erp", () => erp.getTimetable(), [], SECTION_SCHEMAS.timetable),
    load("fees", "erp", () => erp.getFees(), [], SECTION_SCHEMAS.fees),
    load("erp-notifications", "erp", () => erp.getNotifications(), [], SECTION_SCHEMAS.notifications),
    load("courses", "lms", lms && (() => lms.getCourses()), [], SECTION_SCHEMAS.courses),
    load("assignments", "lms", lms && (() => lms.getAssignments()), [], SECTION_SCHEMAS.assignments),
    load("lms-calendar", "lms", lms && (() => lms.getCalendar()), [], SECTION_SCHEMAS.calendar),
    load("lms-notifications", "lms", lms && (() => lms.getNotifications()), [], SECTION_SCHEMAS.notifications),
  ]);

  if (expired) {
    // Portal session is gone — force a clean sign-in rather than showing stale
    // gaps. Cookies can't be modified during render, so the caller redirects
    // to /api/auth/expired, which clears the session.
    throw new NotSignedInError(true);
  }

  // The live ERP publishes marks but no grades, credits or GPA. Derive them from the
  // student's preset so every semester with results counts towards a CGPA.
  const grading = await getGradingSettings();
  const derivedResults = hasGrades(results)
    ? results
    : estimateGrades(results, creditsResolver(grading), presetById(grading.preset).scale);
  // Derived data is checked too; if the estimate is somehow malformed, show the raw results.
  const gradedResults = SECTION_SCHEMAS.results.safeParse(derivedResults).success ? derivedResults : results;

  const notifications: Notification[] = [...erpNotifications, ...lmsNotifications].sort(
    (a, b) => byDateAsc(b, a),
  );

  // One timeline: LMS assignment deadlines, unpaid fee due dates, LMS calendar.
  const events: CalendarEvent[] = [];
  const seen = new Set<string>();
  const push = (e: CalendarEvent) => {
    if (seen.has(e.id)) return;
    seen.add(e.id);
    events.push(e);
  };

  for (const a of assignments) {
    if (!a.dueDate) continue;
    push({
      id: `assignment:${a.id}`,
      title: a.name,
      date: a.dueDate,
      source: "lms",
      courseName: a.courseName,
      type: "assignment",
      url: a.url,
    });
  }
  for (const f of fees) {
    if (f.paid || !f.dueDate) continue;
    push({
      id: `fee:${f.receiptNo ?? f.description}`,
      title: `Fee due: ${f.description}`,
      date: f.dueDate,
      source: "erp",
      type: "fee",
    });
  }
  // Moodle repeats assignment deadlines in its calendar; keep one entry each.
  for (const ev of lmsCalendar) {
    if (isDuplicateDeadline(ev, assignments)) continue;
    push(ev);
  }
  // Dates from either portal can be odd; drop any single event that is malformed.
  const validEvents = events.filter((e) => CalendarEventSchema.safeParse(e).success);
  validEvents.sort(byDateAsc);

  const assembled = DashboardDataSchema.safeParse({
    // Never fabricate profile fields we couldn't read.
    profile: profile ?? {
      registerNumber: session.username,
      name: session.username,
      program: "",
      department: "",
      semester: null,
    },
    attendance,
    marks,
    results: gradedResults,
    timetable,
    fees,
    courses: withDisplayNames(courses, attendance, timetable),
    assignments,
    notifications,
    events: validEvents,
    dailyAttendance,
    hourlyAttendance,
    fetchedAt: new Date().toISOString(),
    issues,
    connected: { erp: true, lms: lms !== null },
  });
  if (!assembled.success) {
    // Every section was validated above, so this should not happen.
    const where = assembled.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}:${i.code}`)
      .join(", ");
    console.error(`[data] assembling the dashboard failed (${where})`);
    throw new Error("Your data could not be put together. Try again in a minute.");
  }
  return assembled.data;
});

/**
 * getDashboardData for pages and layouts. A missing or expired session redirects to sign-in
 * (an expired one clears its cookie on the way) instead of throwing, because an uncaught throw
 * in a page is logged by Next as a render error. An expired session is worth one warning line;
 * a visitor who was never signed in is not. Cached per request, so the layout and the page share
 * one redirect and one warning. Route handlers keep using getDashboardData and answer 401.
 */
export const requireDashboardData = reactCache(async (): Promise<DashboardData> => {
  try {
    return await getDashboardData();
  } catch (err) {
    if (err instanceof NotSignedInError) {
      if (err.expired) console.warn("[auth] Portal session expired; sending the student back to sign in.");
      redirect(err.expired ? "/api/auth/expired" : "/login");
    }
    throw err;
  }
});

/**
 * Make this user's cached sections refetch on the next render.
 *
 * By default the saved copies are deleted (sign-out, expired session, new
 * Moodle connection). With `keepStale` (the Refresh button) they are only
 * marked out of date: if the portal is down the last good copy is still shown
 * with a "saved at" notice rather than an empty page.
 */
export async function invalidateDashboardData(opts: { keepStale?: boolean } = {}): Promise<void> {
  const session = await getSession();
  if (!session.username) return;
  const scope = userScope(session.username);
  await Promise.all(
    [...SECTIONS, ...PERIOD_CACHE_SECTIONS].map((s) =>
      opts.keepStale ? cacheStore.expire(`${scope}:${s}`) : cacheStore.invalidate(`${scope}:${s}`),
    ),
  );
}

/** Adds a clean display title and subject code to each Moodle course, using the ERP's subjects when they match. */
function withDisplayNames(
  courses: DashboardData["courses"],
  attendance: DashboardData["attendance"],
  timetable: DashboardData["timetable"],
): DashboardData["courses"] {
  const subjects = erpSubjects(attendance, timetable);
  return courses.map((c) => {
    const d = displayCourse(c, subjects);
    return { ...c, displayName: d.title, displayCode: d.code };
  });
}
