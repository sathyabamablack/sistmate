import {
  SessionExpiredError,
  type Assignment,
  type AuthResult,
  type CalendarEvent,
  type Credentials,
  type CourseContents,
  type LmsAdapter,
  type LmsCourse,
  type Notification,
} from "@usp/core";
import { MoodleWsError } from "./parsers/errors";
import {
  mapAssignments,
  mapCalendarEvents,
  mapCourseContents,
  mapCategoryNames,
  mapCourseGrades,
  mapCourses,
  mapNotifications,
  mapSiteInfo,
  parseTokenResponse,
  parseWsError,
  type SiteInfo,
} from "./parsers/ws/index";

/**
 * Live Moodle adapter over the official web-services REST API (the same one
 * the Moodle mobile app uses). This is the stable path: documented JSON, no
 * HTML scraping. Stateless: the token travels in the caller's encrypted
 * session and is passed back in on every request.
 */

export interface LiveLmsOptions {
  baseUrl?: string;
  /** Moodle web-service token from a previous authenticate(). */
  token?: string;
  /** Per-request timeout. */
  timeoutMs?: number;
  /** Caller-supplied deadline (for example a whole-page budget); aborting it cancels in-flight calls. */
  signal?: AbortSignal;
  /** Extra attempts for web-service reads after a network error or 5xx (default 1; 0 disables). Never used for login. */
  retries?: number;
  /** Test hook: replaces the 300-700 ms pause before a retry. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected for tests. */
  fetch?: typeof fetch;
  /** Called with every web-service response (used by `verify:live` to save captures). */
  onResponse?: (wsfunction: string, json: unknown) => void;
}

/** Concurrent per-assignment status calls — polite to the server. */
const STATUS_CONCURRENCY = 5;

export class NotConfiguredError extends Error {
  constructor(what: string) {
    super(`LMS ${what} is not configured. Set LMS_BASE_URL and sign in again.`);
    this.name = "NotConfiguredError";
  }
}

/**
 * Moodle expects nested params flattened PHP-style:
 * { courseids: [1, 2] } -> courseids[0]=1&courseids[1]=2
 */
export function flattenParams(
  params: Record<string, unknown>,
  prefix = "",
  out = new URLSearchParams(),
): URLSearchParams {
  for (const [key, value] of Object.entries(params)) {
    const name = prefix ? `${prefix}[${key}]` : key;
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (v !== null && typeof v === "object") {
          flattenParams(v as Record<string, unknown>, `${name}[${i}]`, out);
        } else {
          out.append(`${name}[${i}]`, String(v));
        }
      });
    } else if (typeof value === "object") {
      flattenParams(value as Record<string, unknown>, name, out);
    } else {
      out.append(name, String(value));
    }
  }
  return out;
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

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

class LiveLmsAdapter implements LmsAdapter {
  private readonly baseUrl: string | undefined;
  private token: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly onResponse: LiveLmsOptions["onResponse"];
  private readonly callerSignal: AbortSignal | undefined;
  private readonly retries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private siteInfo: Promise<SiteInfo> | undefined;
  private courses: Promise<LmsCourse[]> | undefined;

  constructor(opts: LiveLmsOptions) {
    this.baseUrl = opts.baseUrl?.replace(/\/+$/, "") || undefined;
    this.token = opts.token;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.fetchImpl = opts.fetch ?? fetch;
    this.onResponse = opts.onResponse;
    this.callerSignal = opts.signal;
    this.retries = Math.max(0, opts.retries ?? 1);
    this.sleep = opts.sleep ?? defaultSleep;
  }

  private requireBase(): string {
    if (!this.baseUrl) throw new NotConfiguredError("base URL");
    return this.baseUrl;
  }

  async authenticate(creds: Credentials): Promise<AuthResult> {
    const base = this.requireBase();
    const res = await this.fetchImpl(`${base}/login/token.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        username: creds.username,
        password: creds.password,
        service: "moodle_mobile_app",
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const result = parseTokenResponse(await res.text());
    if (!result.ok) {
      return {
        ok: false,
        error:
          result.errorcode === "nonjson"
            ? "The LMS doesn't allow app sign-in (web services are off)."
            : result.error,
      };
    }
    this.token = result.token;
    this.siteInfo = undefined;
    this.courses = undefined;
    return { ok: true, session: result.token };
  }

  /** One web-service call. Moodle reports errors as HTTP 200 + exception JSON. */
  private async callWs(wsfunction: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const base = this.requireBase();
    if (!this.token) throw new SessionExpiredError("lms");

    const body = flattenParams(params);
    body.set("wstoken", this.token);
    body.set("wsfunction", wsfunction);
    body.set("moodlewsrestformat", "json");

    const res = await this.fetchWithRetry(`${base}/webservice/rest/server.php`, body);
    if (!res.ok) throw new Error(`LMS ${wsfunction} failed: HTTP ${res.status}`);

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new Error("The LMS sent a reply this app can't read. It may be down or blocking this server.");
    }
    this.onResponse?.(wsfunction, json);
    try {
      parseWsError(json);
    } catch (err) {
      if (err instanceof MoodleWsError && err.isAuthError) throw new SessionExpiredError("lms");
      throw err;
    }
    return json;
  }

  /**
   * Web-service calls are reads, so one jittered retry on a network error or
   * 5xx is safe. Login (`authenticate`) deliberately does not use this.
   */
  private async fetchWithRetry(url: string, body: URLSearchParams): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      try {
        const timeout = AbortSignal.timeout(this.timeoutMs);
        const res = await this.fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body,
          signal: this.callerSignal ? AbortSignal.any([timeout, this.callerSignal]) : timeout,
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

  private getSiteInfo(): Promise<SiteInfo> {
    this.siteInfo ??= this.callWs("core_webservice_get_site_info").then(mapSiteInfo);
    // Don't cache a failure for the life of the instance.
    this.siteInfo.catch(() => (this.siteInfo = undefined));
    return this.siteInfo;
  }

  /** The course list is needed by getCourses and getAssignments; load it once per instance. */
  getCourses(): Promise<LmsCourse[]> {
    this.courses ??= this.loadCourses();
    this.courses.catch(() => (this.courses = undefined));
    return this.courses;
  }

  private async loadCourses(): Promise<LmsCourse[]> {
    const info = await this.getSiteInfo();
    const [json, categories, grades] = await Promise.all([
      this.callWs("core_enrol_get_users_courses", { userid: info.userid }),
      // Names and grades only enrich the list; a site that blocks either still lists its courses.
      this.optionalWs("core_course_get_categories", {}),
      this.optionalWs("gradereport_overview_get_course_grades", { userid: info.userid }),
    ]);
    return mapCourses(json, {
      siteUrl: info.siteurl,
      categoryNames: safely(() => (categories === undefined ? undefined : mapCategoryNames(categories))),
      grades: safely(() => (grades === undefined ? undefined : mapCourseGrades(grades))),
    });
  }

  async getAssignments(): Promise<Assignment[]> {
    const [info, courses] = await Promise.all([this.getSiteInfo(), this.getCourses()]);
    if (courses.length === 0) return [];

    const json = await this.callWs("mod_assign_get_assignments", {
      courseids: courses.map((c) => c.id),
    });

    // Submission status is one call per assignment instance id.
    const instanceIds = extractAssignInstanceIds(json);
    const statuses: Record<string, unknown> = {};
    await mapLimit(instanceIds, STATUS_CONCURRENCY, async (assignid) => {
      try {
        statuses[assignid] = await this.callWs("mod_assign_get_submission_status", { assignid });
      } catch (err) {
        if (err instanceof SessionExpiredError) throw err;
        // One inaccessible activity shouldn't hide the rest; mapper treats it as unsubmitted.
      }
    });

    return mapAssignments(json, { siteUrl: info.siteurl, submissionStatuses: statuses });
  }

  async getCourseContents(courseId: number): Promise<CourseContents> {
    const info = await this.getSiteInfo();
    const ids = { courseids: [courseId] };

    // Only the contents call is essential. Pages, quizzes, assignments and
    // grades enrich it; a site that disables one of them still gets a course view.
    const [contents, pages, quizzes, assignments, gradeItems] = await Promise.all([
      this.callWs("core_course_get_contents", { courseid: courseId }),
      this.optionalWs("mod_page_get_pages_by_courses", ids),
      this.optionalWs("mod_quiz_get_quizzes_by_courses", ids),
      this.optionalWs("mod_assign_get_assignments", ids),
      this.optionalWs("gradereport_user_get_grade_items", { courseid: courseId, userid: info.userid }),
    ]);

    const submissionStatuses: Record<string, unknown> = {};
    if (assignments !== undefined) {
      await mapLimit(extractAssignInstanceIds(assignments, courseId), STATUS_CONCURRENCY, async (assignid) => {
        submissionStatuses[assignid] = await this.optionalWs("mod_assign_get_submission_status", { assignid });
      });
    }

    return mapCourseContents(contents, {
      courseId,
      siteUrl: info.siteurl,
      pages,
      quizzes,
      assignments,
      submissionStatuses,
      gradeItems,
    });
  }

  /** callWs for enrichment data: failures other than an expired session yield undefined. */
  private async optionalWs(wsfunction: string, params: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.callWs(wsfunction, params);
    } catch (err) {
      if (err instanceof SessionExpiredError) throw err;
      return undefined;
    }
  }

  async getCalendar(): Promise<CalendarEvent[]> {
    const now = Math.floor(Date.now() / 1000);
    const json = await this.callWs("core_calendar_get_action_events_by_timesort", {
      timesortfrom: now - 24 * 60 * 60,
      timesortto: now + 60 * 24 * 60 * 60,
      limitnum: 50,
    });
    return mapCalendarEvents(json);
  }

  async getNotifications(): Promise<Notification[]> {
    const info = await this.getSiteInfo();
    const json = await this.callWs("message_popup_get_popup_notifications", {
      useridto: info.userid,
      limit: 30,
      offset: 0,
    });
    return mapNotifications(json);
  }
}

/** Enrichment must never fail the call it decorates. */
function safely<T>(fn: () => T | undefined): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function extractAssignInstanceIds(json: unknown, onlyCourseId?: number): number[] {
  const ids: number[] = [];
  const courses = (json as { courses?: unknown }).courses;
  if (!Array.isArray(courses)) return ids;
  for (const c of courses) {
    if (onlyCourseId !== undefined && (c as { id?: unknown }).id !== onlyCourseId) continue;
    const assignments = (c as { assignments?: unknown }).assignments;
    if (!Array.isArray(assignments)) continue;
    for (const a of assignments) {
      const id = (a as { id?: unknown }).id;
      if (typeof id === "number") ids.push(id);
    }
  }
  return ids;
}

export function createLiveLmsAdapter(opts: LiveLmsOptions = {}): LmsAdapter {
  return new LiveLmsAdapter(opts);
}
