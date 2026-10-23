import { z } from "zod";
import {
  AssignmentDetailSchema,
  CourseContentsSchema,
  type AssignmentDetail,
  type CourseContents,
  type CourseFile,
  type CourseModule,
  type CourseSection,
} from "@usp/core";
import { formatNumber, parseWith, stripHtml, tidyGrade, unixToIso } from "../shared";
import { htmlToRichText, type RichTextOptions } from "../richtext";
import { isMoodleException, parseWsError } from "./wsError";

/* ------------------------------------------------------------------ */
/* core_course_get_contents                                            */
/* ------------------------------------------------------------------ */

const RawFileSchema = z
  .object({
    type: z.string().optional(),
    filename: z.string().optional(),
    filesize: z.coerce.number().nullish(),
    fileurl: z.string().optional(),
    mimetype: z.string().nullish(),
    timemodified: z.coerce.number().nullish(),
  })
  .passthrough();

const RawModuleSchema = z
  .object({
    id: z.coerce.number().int(),
    name: z.string(),
    modname: z.string(),
    instance: z.coerce.number().optional(),
    description: z.string().nullish(),
    visible: z.coerce.number().optional(),
    uservisible: z.boolean().optional(),
    visibleoncoursepage: z.coerce.number().optional(),
    contents: z.array(RawFileSchema).nullish(),
    dates: z.array(z.object({ label: z.string(), timestamp: z.coerce.number() }).passthrough()).nullish(),
    completion: z.coerce.number().optional(),
    completiondata: z.object({ state: z.coerce.number() }).passthrough().nullish(),
  })
  .passthrough();

const RawSectionSchema = z
  .object({
    id: z.coerce.number().int(),
    name: z.string().nullish(),
    section: z.coerce.number().optional(),
    summary: z.string().nullish(),
    visible: z.coerce.number().optional(),
    uservisible: z.boolean().optional(),
    modules: z.array(RawModuleSchema).default([]),
  })
  .passthrough();

export const RawCourseContentsSchema = z.array(RawSectionSchema);

/* ------------------------------------------------------------------ */
/* Companion calls                                                     */
/* ------------------------------------------------------------------ */

const RawPagesSchema = z
  .object({
    pages: z.array(z.object({ coursemodule: z.coerce.number(), content: z.string().nullish() }).passthrough()),
  })
  .passthrough();

const RawQuizzesSchema = z
  .object({
    quizzes: z.array(
      z
        .object({
          coursemodule: z.coerce.number(),
          timeopen: z.coerce.number().nullish(),
          timeclose: z.coerce.number().nullish(),
          timelimit: z.coerce.number().nullish(),
          attempts: z.coerce.number().nullish(),
          grade: z.coerce.number().nullish(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const RawGradeItemsSchema = z
  .object({
    usergrades: z.array(
      z
        .object({
          gradeitems: z.array(
            z
              .object({
                itemtype: z.string().optional(),
                gradeformatted: z.string().nullish(),
                percentageformatted: z.string().nullish(),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const RawAssignFileSchema = z
  .object({
    filename: z.string().optional(),
    filesize: z.coerce.number().nullish(),
    fileurl: z.string().optional(),
    mimetype: z.string().nullish(),
    timemodified: z.coerce.number().nullish(),
  })
  .passthrough();

const RawAssignDetailSchema = z
  .object({
    id: z.coerce.number().int(),
    cmid: z.coerce.number().int(),
    course: z.coerce.number().int().optional(),
    name: z.string(),
    intro: z.string().nullish(),
    duedate: z.coerce.number().nullish(),
    allowsubmissionsfromdate: z.coerce.number().nullish(),
    cutoffdate: z.coerce.number().nullish(),
    grade: z.coerce.number().nullish(),
    introattachments: z.array(RawAssignFileSchema).nullish(),
  })
  .passthrough();

export const RawAssignDetailsResponseSchema = z
  .object({
    courses: z.array(z.object({ id: z.coerce.number(), assignments: z.array(RawAssignDetailSchema).default([]) }).passthrough()),
  })
  .passthrough();

const RawPluginSchema = z
  .object({
    type: z.string(),
    fileareas: z.array(z.object({ files: z.array(RawAssignFileSchema).default([]) }).passthrough()).nullish(),
    editorfields: z.array(z.object({ name: z.string(), text: z.string().nullish() }).passthrough()).nullish(),
  })
  .passthrough();

const RawDetailStatusSchema = z
  .object({
    lastattempt: z
      .object({
        submission: z
          .object({
            status: z.string(),
            timemodified: z.coerce.number().nullish(),
            plugins: z.array(RawPluginSchema).nullish(),
          })
          .passthrough()
          .nullish(),
        teamsubmission: z.object({ status: z.string() }).passthrough().nullish(),
        locked: z.boolean().optional(),
        extensionduedate: z.coerce.number().nullish(),
      })
      .passthrough()
      .optional(),
    feedback: z
      .object({
        grade: z.object({ grade: z.union([z.string(), z.number()]).nullish() }).passthrough().nullish(),
        gradefordisplay: z.string().nullish(),
        gradeddate: z.coerce.number().nullish(),
        plugins: z.array(RawPluginSchema).nullish(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

/* ------------------------------------------------------------------ */
/* Mapping                                                             */
/* ------------------------------------------------------------------ */

export interface MapCourseContentsOptions {
  courseId: number;
  siteUrl: string;
  /** mod_page_get_pages_by_courses response. */
  pages?: unknown;
  /** mod_quiz_get_quizzes_by_courses response. */
  quizzes?: unknown;
  /** mod_assign_get_assignments response (for this course). */
  assignments?: unknown;
  /** mod_assign_get_submission_status responses keyed by assign instance id. */
  submissionStatuses?: Readonly<Record<string, unknown>>;
  /** gradereport_user_get_grade_items response. */
  gradeItems?: unknown;
}

function toFile(f: z.infer<typeof RawFileSchema> | z.infer<typeof RawAssignFileSchema>): CourseFile | null {
  if (!f.fileurl || !f.filename) return null;
  return {
    name: f.filename,
    mimeType: f.mimetype || null,
    size: typeof f.filesize === "number" && f.filesize >= 0 ? f.filesize : null,
    modified: unixToIso(f.timemodified),
    url: f.fileurl,
  };
}

function fileList(list: ReadonlyArray<z.infer<typeof RawAssignFileSchema>> | null | undefined): CourseFile[] {
  return (list ?? []).map(toFile).filter((f): f is CourseFile => f !== null);
}

/** Optional companion responses must not sink the whole course view. */
function lenient<S extends z.ZodTypeAny>(schema: S, json: unknown, name: string): z.output<S> | undefined {
  if (json === undefined || isMoodleException(json)) return undefined;
  const res = schema.safeParse(json);
  if (!res.success) {
    console.error(`[lms] ${name}: unexpected response shape, ignoring (${res.error.issues[0]?.message ?? "invalid"})`);
    return undefined;
  }
  return res.data as z.output<S>;
}

function mapGrade(
  raw: z.infer<typeof RawDetailStatusSchema>["feedback"],
  max: number | null,
): AssignmentDetail["grade"] {
  if (!raw) return null;
  const display = tidyGrade(stripHtml(raw.gradefordisplay));
  const rawValue = raw.grade?.grade;
  const n = typeof rawValue === "number" ? rawValue : Number.parseFloat(rawValue ?? "");
  const value = Number.isFinite(n) && n >= 0 ? n : null;
  if (display) return { display, value, max };
  if (value === null) return null;
  return { display: max ? `${formatNumber(value)} / ${formatNumber(max)}` : formatNumber(value), value, max };
}

function pluginText(
  plugins: z.infer<typeof RawPluginSchema>[] | null | undefined,
  type: string,
  field: string,
  rich: RichTextOptions,
) {
  const text = plugins?.find((p) => p.type === type)?.editorfields?.find((f) => f.name === field)?.text;
  return htmlToRichText(text, rich);
}

export function mapAssignmentDetails(
  json: unknown,
  opts: Pick<MapCourseContentsOptions, "courseId" | "siteUrl" | "submissionStatuses">,
): Map<number, AssignmentDetail> {
  const out = new Map<number, AssignmentDetail>();
  const raw = lenient(RawAssignDetailsResponseSchema, json, "mod_assign_get_assignments");
  if (!raw) return out;
  const rich: RichTextOptions = { siteUrl: opts.siteUrl, courseId: opts.courseId };

  for (const course of raw.courses) {
    if (course.id !== opts.courseId) continue;
    for (const a of course.assignments) {
      const rawStatus = opts.submissionStatuses?.[String(a.id)];
      const status = lenient(RawDetailStatusSchema, rawStatus, `mod_assign_get_submission_status(${a.id})`);
      const la = status?.lastattempt;
      const extension = la?.extensionduedate && la.extensionduedate > 0 ? la.extensionduedate : null;
      const max = a.grade && a.grade > 0 ? a.grade : null;
      const state = la?.submission?.status ?? la?.teamsubmission?.status;
      const submission = state === "submitted" ? "submitted" : state === "draft" ? "draft" : "none";

      const submissionPlugins = la?.submission?.plugins;
      const submittedFiles = (submissionPlugins ?? [])
        .filter((p) => p.type === "file")
        .flatMap((p) => (p.fileareas ?? []).flatMap((area) => fileList(area.files)));

      const detail: AssignmentDetail = {
        id: a.cmid,
        assignId: a.id,
        courseId: a.course ?? opts.courseId,
        name: stripHtml(a.name),
        intro: htmlToRichText(a.intro, rich),
        attachments: fileList(a.introattachments),
        openDate: unixToIso(a.allowsubmissionsfromdate),
        dueDate: unixToIso(extension ?? a.duedate),
        cutoffDate: unixToIso(a.cutoffdate),
        extended: extension !== null,
        maxGrade: max,
        submission,
        submittedAt: submission === "none" ? null : unixToIso(la?.submission?.timemodified),
        submittedFiles,
        submittedText: pluginText(submissionPlugins, "onlinetext", "onlinetext", rich),
        grade: mapGrade(status?.feedback, max),
        gradedAt: unixToIso(status?.feedback?.gradeddate),
        feedback: pluginText(status?.feedback?.plugins, "comments", "comments", rich),
        locked: la?.locked ?? false,
      };
      out.set(a.cmid, AssignmentDetailSchema.parse(detail));
    }
  }
  return out;
}

function mapDates(m: z.infer<typeof RawModuleSchema>): CourseModule["dates"] {
  return (m.dates ?? [])
    .map((d) => ({ label: stripHtml(d.label).replace(/:$/, ""), date: unixToIso(d.timestamp) }))
    .filter((d): d is { label: string; date: string } => d.date !== null && d.label !== "");
}

/**
 * `core_course_get_contents` (+ the optional companion responses) → canonical
 * `CourseContents`. Hidden/inaccessible activities are skipped.
 */
export function mapCourseContents(json: unknown, opts: MapCourseContentsOptions): CourseContents {
  parseWsError(json);
  const raw = parseWith(RawCourseContentsSchema, json, "ws.mapCourseContents");
  const rich: RichTextOptions = { siteUrl: opts.siteUrl, courseId: opts.courseId };

  const pages = new Map(
    (lenient(RawPagesSchema, opts.pages, "mod_page_get_pages_by_courses")?.pages ?? []).map((p) => [
      p.coursemodule,
      p.content,
    ]),
  );
  const quizzes = new Map(
    (lenient(RawQuizzesSchema, opts.quizzes, "mod_quiz_get_quizzes_by_courses")?.quizzes ?? []).map((q) => [
      q.coursemodule,
      q,
    ]),
  );
  const assignments = mapAssignmentDetails(opts.assignments, opts);

  const sections: CourseSection[] = [];
  for (const s of raw) {
    if (s.uservisible === false || s.visible === 0) continue;
    const modules: CourseModule[] = [];

    for (const m of s.modules) {
      if (m.uservisible === false || m.visible === 0 || m.visibleoncoursepage === 0) continue;
      const base = {
        id: m.id,
        name: stripHtml(m.name),
        description: htmlToRichText(m.description, rich),
        completed: m.completion && m.completion > 0 && m.completiondata ? m.completiondata.state > 0 : null,
        dates: mapDates(m),
      };
      const files = fileList(m.contents?.filter((c) => c.type === "file" || c.type === undefined));

      switch (m.modname) {
        case "resource":
          modules.push({ ...base, kind: "resource", files });
          break;
        case "folder":
          modules.push({ ...base, kind: "folder", files });
          break;
        case "page": {
          modules.push({ ...base, kind: "page", content: htmlToRichText(pages.get(m.id), rich) });
          break;
        }
        case "label":
          modules.push({ ...base, kind: "label" });
          break;
        case "url": {
          const href = m.contents?.find((c) => c.type === "url")?.fileurl ?? m.contents?.[0]?.fileurl;
          if (href && /^https?:\/\//i.test(href)) modules.push({ ...base, kind: "url", href });
          else modules.push({ ...base, kind: "other", modName: "url" });
          break;
        }
        case "forum":
          modules.push({ ...base, kind: "forum" });
          break;
        case "quiz": {
          const q = quizzes.get(m.id);
          modules.push({
            ...base,
            kind: "quiz",
            openDate: unixToIso(q?.timeopen),
            closeDate: unixToIso(q?.timeclose),
            timeLimitMinutes: q?.timelimit && q.timelimit > 0 ? Math.round(q.timelimit / 60) : null,
            attempts: q?.attempts && q.attempts > 0 ? q.attempts : null,
            maxGrade: q?.grade && q.grade > 0 ? q.grade : null,
          });
          break;
        }
        case "assign":
          modules.push({ ...base, kind: "assign", assignment: assignments.get(m.id) ?? null });
          break;
        default:
          modules.push({ ...base, kind: "other", modName: m.modname });
      }
    }

    const number = s.section ?? sections.length;
    const name = stripHtml(s.name) || (number === 0 ? "General" : `Topic ${number}`);
    sections.push({ id: s.id, number, name, summary: htmlToRichText(s.summary, rich), modules });
  }

  const gradeItems = lenient(RawGradeItemsSchema, opts.gradeItems, "gradereport_user_get_grade_items");
  const courseItem = gradeItems?.usergrades[0]?.gradeitems.find((g) => g.itemtype === "course");
  const display = tidyGrade(stripHtml(courseItem?.gradeformatted));

  return CourseContentsSchema.parse({
    courseId: opts.courseId,
    sections,
    grade: display
      ? { display, percentage: tidyGrade(stripHtml(courseItem?.percentageformatted)) }
      : null,
  });
}
