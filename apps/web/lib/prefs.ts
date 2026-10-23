/**
 * Student display and rule preferences, stored in one cookie (`usp-prefs`) so
 * the server can render them with no flash. Pure data + helpers, safe to import
 * from client and server code. Read on the server with `getPrefs()` from
 * `lib/prefs-server.ts`; write from the client with `savePrefs()`.
 */

import { DEFAULT_THRESHOLD } from "./attendance";

export const PREFS_COOKIE = "usp-prefs";

/**
 * Cookie schema version. Bumped to 2 when the attendance requirement moved from
 * 75% to 80%: a v1 cookie's stored requirement is dropped so the student picks up
 * the new default instead of being stuck on the old one. Everything else carries over.
 */
export const PREFS_VERSION = 2;

export const ACCENTS = ["pine", "ocean", "plum", "amber", "rose", "slate"] as const;
export type Accent = (typeof ACCENTS)[number];

export const DENSITIES = ["comfortable", "compact"] as const;
export type Density = (typeof DENSITIES)[number];

export const TEXT_SIZES = ["small", "normal", "large"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const TIME_FORMATS = ["12h", "24h"] as const;
export type TimeFormat = (typeof TIME_FORMATS)[number];

/**
 * Which LMS courses the Courses page lists. Moodle returns every semester the
 * student has ever been enrolled in, so "current" is the default: only courses
 * that match this semester's ERP subjects. "all" lists everything.
 */
export const COURSE_FILTERS = ["current", "all"] as const;
export type CourseFilter = (typeof COURSE_FILTERS)[number];

/** Routes a student may choose as their start page. "/" is the dashboard. */
export const HOME_PAGES = ["/", "/attendance", "/timetable", "/courses", "/notifications"] as const;
export type HomePage = (typeof HOME_PAGES)[number];

/** Blocks on the dashboard that can be hidden or reordered. */
export const DASHBOARD_SECTIONS = ["today", "glance", "attendance", "due", "notices", "courses"] as const;
export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number];

/**
 * Where the student is with the first-time walkthrough (see lib/tour.ts).
 * "new": never finished or skipped, so it may start by itself on the dashboard.
 * "done" / "skipped": it never starts by itself again; Settings and search replay it.
 */
export const TOUR_STATUSES = ["new", "done", "skipped"] as const;
export type TourStatus = (typeof TOUR_STATUSES)[number];

export interface OnboardingState {
  tour: TourStatus;
}

export interface Prefs {
  v: typeof PREFS_VERSION;
  accent: Accent;
  density: Density;
  text: TextSize;
  /** Force reduced motion regardless of the OS setting. */
  reduceMotion: boolean;
  home: HomePage;
  dashboard: { order: DashboardSection[]; hidden: DashboardSection[] };
  /** Minimum attendance percentage, 60-90. */
  attendanceThreshold: number;
  /**
   * Legacy: the old editable pass mark. Kept so existing cookies parse, but unused: arrears
   * follow the official pass rule (50% of the total and 30% of the exam).
   */
  passMark: number;
  timeFormat: TimeFormat;
  /** Whether Courses lists this semester only (the default) or every semester. */
  courseFilter: CourseFilter;
  /** Moodle course ids the student chose not to list (old semesters). Unique, at most MAX_HIDDEN_COURSES. */
  hiddenCourses: number[];
  /** The first-time walkthrough. Old cookies without it (or with the old checklist fields) read as "new". */
  onboarding: OnboardingState;
}

/** Keeps the cookie small: a student never has more Moodle courses than this. */
export const MAX_HIDDEN_COURSES = 200;

export const DEFAULT_PREFS: Prefs = {
  v: PREFS_VERSION,
  accent: "pine",
  density: "comfortable",
  text: "normal",
  reduceMotion: false,
  home: "/",
  dashboard: { order: [...DASHBOARD_SECTIONS], hidden: [] },
  attendanceThreshold: DEFAULT_THRESHOLD,
  passMark: 50,
  timeFormat: "12h",
  courseFilter: "current",
  hiddenCourses: [],
  onboarding: { tour: "new" },
};

const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback;

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback;

/** Keeps known sections once each, in the given order, then appends any that are missing. */
function cleanOrder(v: unknown): DashboardSection[] {
  const seen = new Set<DashboardSection>();
  if (Array.isArray(v)) {
    for (const s of v) {
      if ((DASHBOARD_SECTIONS as readonly unknown[]).includes(s)) seen.add(s as DashboardSection);
    }
  }
  for (const s of DASHBOARD_SECTIONS) seen.add(s);
  return [...seen];
}

function cleanHidden(v: unknown): DashboardSection[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((s): s is DashboardSection => (DASHBOARD_SECTIONS as readonly unknown[]).includes(s)))];
}

/** Positive integer ids, once each, capped. Anything else in the list is dropped. */
export function cleanCourseIds(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<number>();
  for (const id of v) {
    if (typeof id === "number" && Number.isSafeInteger(id) && id > 0) out.add(id);
    if (out.size >= MAX_HIDDEN_COURSES) break;
  }
  return [...out];
}

/** A known tour status, else "new". Fields from the old checklist guide (dismissed, done) are dropped. */
export function cleanOnboarding(v: unknown): OnboardingState {
  const o = (typeof v === "object" && v !== null && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  return { tour: oneOf(TOUR_STATUSES, o.tour, "new") };
}

/** Parses the cookie value defensively; anything unexpected falls back to the defaults. */
export function parsePrefs(raw: string | undefined | null): Prefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const text = raw.startsWith("{") ? raw : decodeURIComponent(raw);
    const o = JSON.parse(text) as Record<string, unknown>;
    if (typeof o !== "object" || o === null) return DEFAULT_PREFS;
    const dash = (typeof o.dashboard === "object" && o.dashboard !== null ? o.dashboard : {}) as Record<string, unknown>;
    // Pre-v2 cookies carry the old 75% requirement; drop it so they get the current default.
    const threshold = o.v === PREFS_VERSION ? o.attendanceThreshold : undefined;
    return {
      v: PREFS_VERSION,
      accent: oneOf(ACCENTS, o.accent, DEFAULT_PREFS.accent),
      density: oneOf(DENSITIES, o.density, DEFAULT_PREFS.density),
      text: oneOf(TEXT_SIZES, o.text, DEFAULT_PREFS.text),
      reduceMotion: o.reduceMotion === true,
      home: oneOf(HOME_PAGES, o.home, DEFAULT_PREFS.home),
      dashboard: { order: cleanOrder(dash.order), hidden: cleanHidden(dash.hidden) },
      attendanceThreshold: clampInt(threshold, 60, 90, DEFAULT_PREFS.attendanceThreshold),
      passMark: clampInt(o.passMark, 30, 70, DEFAULT_PREFS.passMark),
      timeFormat: oneOf(TIME_FORMATS, o.timeFormat, DEFAULT_PREFS.timeFormat),
      courseFilter: oneOf(COURSE_FILTERS, o.courseFilter, DEFAULT_PREFS.courseFilter),
      hiddenCourses: cleanCourseIds(o.hiddenCourses),
      onboarding: cleanOnboarding(o.onboarding),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function serializePrefs(p: Prefs): string {
  return JSON.stringify(p);
}

/** Attributes the root layout puts on <html> so CSS can react to the preferences. */
export function prefsToDataAttributes(p: Prefs): Record<string, string> {
  return {
    "data-accent": p.accent,
    "data-density": p.density,
    "data-text": p.text,
    "data-motion": p.reduceMotion ? "reduce" : "auto",
  };
}

/**
 * Inline <head> script that copies the saved display preferences onto <html> before first paint.
 * The root layout renders the defaults and does not read the cookie, so every public page can be
 * served as static HTML; this script then applies a student's own choices with no flash.
 * Values are checked against the same lists as parsePrefs.
 */
export const prefsBootScript = `
(function(){
  try {
    var m = document.cookie.match(/(?:^|;\\s*)${PREFS_COOKIE}=([^;]*)/);
    if (!m) return;
    var raw = m[1];
    var o = JSON.parse(raw.charAt(0) === '{' ? raw : decodeURIComponent(raw));
    if (!o || typeof o !== 'object') return;
    var h = document.documentElement;
    var set = function (name, value, allowed) {
      if (allowed.indexOf(value) !== -1) h.setAttribute(name, value);
    };
    set('data-accent', o.accent, ${JSON.stringify(ACCENTS)});
    set('data-density', o.density, ${JSON.stringify(DENSITIES)});
    set('data-text', o.text, ${JSON.stringify(TEXT_SIZES)});
    if (o.reduceMotion === true) h.setAttribute('data-motion', 'reduce');
  } catch (e) {}
})();
`;

/** Client-only: persists the preferences for a year and updates <html> immediately. */
export function savePrefs(next: Prefs): void {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${PREFS_COOKIE}=${encodeURIComponent(serializePrefs(next))}; path=/; max-age=31536000; SameSite=Lax${secure}`;
  const attrs = prefsToDataAttributes(next);
  for (const [k, v] of Object.entries(attrs)) document.documentElement.setAttribute(k, v);
}

/** Client-only: the preferences as currently saved in this browser, or the defaults. */
export function readPrefs(): Prefs {
  if (typeof document === "undefined") return DEFAULT_PREFS;
  const prefix = `${PREFS_COOKIE}=`;
  const entry = document.cookie.split(/;\s*/).find((c) => c.startsWith(prefix));
  return parsePrefs(entry?.slice(prefix.length));
}

/**
 * Client-only: changes part of the saved preferences, starting from the cookie as it is
 * now (not a copy rendered earlier), so two places writing in turn never undo each other.
 */
export function updatePrefs(change: (current: Prefs) => Partial<Prefs>): Prefs {
  const current = readPrefs();
  const next = { ...current, ...change(current) };
  savePrefs(next);
  return next;
}

/** Client-only: removes the cookie (back to the defaults) and updates <html> immediately. */
export function clearPrefs(): void {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${PREFS_COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
  for (const [k, v] of Object.entries(prefsToDataAttributes(DEFAULT_PREFS))) {
    document.documentElement.setAttribute(k, v);
  }
}
