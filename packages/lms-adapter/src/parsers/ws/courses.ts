import { z } from "zod";
import { LmsCourseSchema, type LmsCourse } from "@usp/core";
import { normalizeSiteUrl, parseWith, stripHtml, unixToIso } from "../shared";
import { parseWsError } from "./wsError";

/**
 * One element of the `core_enrol_get_users_courses` response array.
 * Moodle adds fields across versions, hence `.passthrough()` and optionals.
 */
export const RawEnrolledCourseSchema = z
  .object({
    id: z.coerce.number().int(),
    shortname: z.string(),
    fullname: z.string(),
    displayname: z.string().optional(),
    idnumber: z.string().optional(),
    visible: z.coerce.number().optional(),
    summary: z.string().nullish(),
    format: z.string().optional(),
    /** Category *id* (Moodle does not include the category name here). */
    category: z.coerce.number().optional(),
    /** 0..100 float, or null when completion tracking is disabled. */
    progress: z.number().nullish(),
    completed: z.boolean().nullish(),
    startdate: z.coerce.number().optional(),
    enddate: z.coerce.number().optional(),
    hidden: z.boolean().optional(),
    lastaccess: z.coerce.number().nullish(),
    isfavourite: z.boolean().optional(),
  })
  .passthrough();
export type RawEnrolledCourse = z.infer<typeof RawEnrolledCourseSchema>;

export const RawEnrolledCoursesSchema = z.array(RawEnrolledCourseSchema);

export interface MapCoursesOptions {
  /** Site root, e.g. SiteInfo.siteurl — used for course URLs. */
  siteUrl: string;
  /** Optional category id → display name (e.g. from core_course_get_categories). */
  categoryNames?: Record<number, string>;
  /** Optional course id → course total as the gradebook displays it (see `mapCourseGrades`). */
  grades?: Record<number, string>;
}

function normaliseProgress(p: number | null | undefined): number | null {
  if (typeof p !== "number" || !Number.isFinite(p)) return null;
  return Math.min(100, Math.max(0, Math.round(p)));
}

/** `core_enrol_get_users_courses` → canonical `LmsCourse[]`. */
export function mapCourses(json: unknown, opts: MapCoursesOptions): LmsCourse[] {
  parseWsError(json);
  const raw = parseWith(RawEnrolledCoursesSchema, json, "ws.mapCourses");
  const site = normalizeSiteUrl(opts.siteUrl);

  return raw.map((c) => {
    const category =
      c.category !== undefined ? opts.categoryNames?.[c.category] : undefined;
    const course: LmsCourse = {
      id: c.id,
      shortName: stripHtml(c.shortname),
      fullName: stripHtml(c.fullname),
      progress: normaliseProgress(c.progress),
      category,
      url: `${site}/course/view.php?id=${c.id}`,
      grade: opts.grades?.[c.id],
      lastAccess: unixToIso(c.lastaccess) ?? undefined,
    };
    return parseWith(LmsCourseSchema, course, "ws.mapCourses(canonical)");
  });
}

const RawCategorySchema = z
  .object({
    id: z.coerce.number().int(),
    name: z.string(),
    /** "/3/12": ids of every ancestor, root first. */
    path: z.string().optional(),
  })
  .passthrough();

/**
 * `core_course_get_categories` → category id → display name. A nested category
 * reads as "Parent / Child" so "Semester 5" is not ambiguous between programmes.
 * Only the last two levels are kept to stay short.
 */
export function mapCategoryNames(json: unknown): Record<number, string> {
  parseWsError(json);
  const raw = parseWith(z.array(RawCategorySchema), json, "ws.mapCategoryNames");
  const byId = new Map(raw.map((c) => [c.id, stripHtml(c.name)]));
  const out: Record<number, string> = {};
  for (const c of raw) {
    const chain = (c.path ?? "")
      .split("/")
      .map((p) => Number(p))
      .filter((n) => Number.isInteger(n) && n > 0 && n !== c.id)
      .map((n) => byId.get(n))
      .filter((n): n is string => Boolean(n));
    out[c.id] = [...chain.slice(-1), byId.get(c.id) ?? ""].filter(Boolean).join(" / ");
  }
  return out;
}

const RawCourseGradesSchema = z
  .object({
    grades: z.array(
      z
        .object({
          courseid: z.coerce.number().int(),
          grade: z.string().nullish(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

/**
 * `gradereport_overview_get_course_grades` → course id → the course total as
 * displayed. Empty or "-" totals (nothing graded yet) are left out.
 */
export function mapCourseGrades(json: unknown): Record<number, string> {
  parseWsError(json);
  const raw = parseWith(RawCourseGradesSchema, json, "ws.mapCourseGrades");
  const out: Record<number, string> = {};
  for (const g of raw.grades) {
    const text = stripHtml(g.grade ?? "").trim();
    if (text && text !== "-") out[g.courseid] = text;
  }
  return out;
}
