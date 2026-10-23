import { z } from "zod";
import { AssignmentSchema, type Assignment } from "@usp/core";
import { formatNumber, normalizeSiteUrl, parseWith, stripHtml, tidyGrade, unixToIso } from "../shared";
import { isMoodleException, parseWsError } from "./wsError";

/* ------------------------------------------------------------------ */
/* mod_assign_get_assignments                                          */
/* ------------------------------------------------------------------ */

export const RawAssignSchema = z
  .object({
    /** Assignment instance id (what mod_assign_get_submission_status calls `assignid`). */
    id: z.coerce.number().int(),
    /** Course-module id (what URLs use: mod/assign/view.php?id=CMID). */
    cmid: z.coerce.number().int(),
    course: z.coerce.number().int().optional(),
    name: z.string(),
    nosubmissions: z.coerce.number().optional(),
    /** UNIX seconds; 0 = no due date. */
    duedate: z.coerce.number().nullish(),
    allowsubmissionsfromdate: z.coerce.number().nullish(),
    cutoffdate: z.coerce.number().nullish(),
    gradingduedate: z.coerce.number().nullish(),
    grade: z.coerce.number().optional(),
    intro: z.string().optional(),
  })
  .passthrough();
export type RawAssign = z.infer<typeof RawAssignSchema>;

export const RawAssignCourseSchema = z
  .object({
    id: z.coerce.number().int(),
    fullname: z.string(),
    shortname: z.string().optional(),
    timemodified: z.coerce.number().optional(),
    assignments: z.array(RawAssignSchema).default([]),
  })
  .passthrough();

export const RawAssignmentsResponseSchema = z
  .object({
    courses: z.array(RawAssignCourseSchema),
    warnings: z.array(z.unknown()).optional(),
  })
  .passthrough();
export type RawAssignmentsResponse = z.infer<typeof RawAssignmentsResponseSchema>;

/* ------------------------------------------------------------------ */
/* mod_assign_get_submission_status (one call per assignment)          */
/* ------------------------------------------------------------------ */

const RawSubmissionSchema = z
  .object({
    id: z.coerce.number().optional(),
    userid: z.coerce.number().optional(),
    attemptnumber: z.coerce.number().optional(),
    timecreated: z.coerce.number().optional(),
    timemodified: z.coerce.number().optional(),
    /** "new" | "draft" | "submitted" | "reopened" */
    status: z.string(),
    groupid: z.coerce.number().optional(),
    assignment: z.coerce.number().optional(),
  })
  .passthrough();

export const RawSubmissionStatusSchema = z
  .object({
    lastattempt: z
      .object({
        submission: RawSubmissionSchema.nullish(),
        teamsubmission: RawSubmissionSchema.nullish(),
        submissionsenabled: z.boolean().optional(),
        locked: z.boolean().optional(),
        graded: z.boolean().optional(),
        canedit: z.boolean().optional(),
        cansubmit: z.boolean().optional(),
        /** UNIX seconds; per-student extension, overrides duedate when > 0. */
        extensionduedate: z.coerce.number().nullish(),
        /** "graded" | "notgraded" | ... */
        gradingstatus: z.string().optional(),
      })
      .passthrough()
      .optional(),
    feedback: z
      .object({
        grade: z
          .object({
            grade: z.union([z.string(), z.number()]).nullish(),
            timemodified: z.coerce.number().optional(),
          })
          .passthrough()
          .nullish(),
        /** Often HTML, e.g. "18.00&nbsp;/&nbsp;20.00". */
        gradefordisplay: z.string().nullish(),
        gradeddate: z.coerce.number().nullish(),
      })
      .passthrough()
      .optional(),
    warnings: z.array(z.unknown()).optional(),
  })
  .passthrough();
export type RawSubmissionStatus = z.infer<typeof RawSubmissionStatusSchema>;

export interface MapAssignmentsOptions {
  siteUrl: string;
  /**
   * Optional `mod_assign_get_submission_status` responses keyed by the
   * assignment INSTANCE id (`RawAssign.id`, i.e. the `assignid` you passed).
   * Missing entries → `submitted: false, grade: null`. Entries that are a
   * Moodle exception (e.g. no permission for that one activity) are ignored
   * rather than failing the whole list.
   */
  submissionStatuses?: Readonly<Record<string, unknown>>;
}

function gradeFromStatus(status: RawSubmissionStatus): string | null {
  const fb = status.feedback;
  if (!fb) return null;
  const display = tidyGrade(stripHtml(fb.gradefordisplay));
  if (display) return display;
  const raw = fb.grade?.grade;
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number.parseFloat(raw);
  // Moodle uses -1 for "no grade yet".
  if (!Number.isFinite(n) || n < 0) return null;
  return formatNumber(n);
}

function isSubmitted(status: RawSubmissionStatus): boolean {
  const la = status.lastattempt;
  if (!la) return false;
  return la.submission?.status === "submitted" || la.teamsubmission?.status === "submitted";
}

/**
 * `mod_assign_get_assignments` (+ optional per-assignment submission status)
 * → canonical `Assignment[]`.
 *
 * NOTE: canonical `Assignment.id` is the course-module id (`cmid`), not the
 * assign instance id — it is the id visible in URLs, so the HTML fallback
 * (which only sees `mod/assign/view.php?id=CMID`) yields the same ids.
 */
export function mapAssignments(json: unknown, opts: MapAssignmentsOptions): Assignment[] {
  parseWsError(json);
  const raw = parseWith(RawAssignmentsResponseSchema, json, "ws.mapAssignments");
  const site = normalizeSiteUrl(opts.siteUrl);
  const statuses: Readonly<Record<string, unknown>> = opts.submissionStatuses ?? {};

  const out: Assignment[] = [];
  for (const course of raw.courses) {
    const courseName = stripHtml(course.fullname);
    for (const a of course.assignments) {
      let status: RawSubmissionStatus | undefined;
      const rawStatus = statuses[String(a.id)];
      if (rawStatus !== undefined && !isMoodleException(rawStatus)) {
        status = parseWith(
          RawSubmissionStatusSchema,
          rawStatus,
          `ws.mapAssignments(submissionStatus ${a.id})`,
        );
      }

      const extension = status?.lastattempt?.extensionduedate;
      const effectiveDue = extension && extension > 0 ? extension : a.duedate;

      const assignment: Assignment = {
        id: a.cmid,
        courseId: a.course ?? course.id,
        courseName,
        name: stripHtml(a.name),
        dueDate: unixToIso(effectiveDue),
        submitted: status ? isSubmitted(status) : false,
        grade: status ? gradeFromStatus(status) : null,
        url: `${site}/mod/assign/view.php?id=${a.cmid}`,
      };
      out.push(parseWith(AssignmentSchema, assignment, "ws.mapAssignments(canonical)"));
    }
  }
  return out;
}
