import { z } from "zod";

/**
 * Canonical shapes for the in-app Moodle course view: topics/sections, their
 * activities, and per-assignment detail. Text that came from Moodle as HTML is
 * stored as `RichBlock[]` — plain data with a closed set of node types — so the
 * UI renders it as React elements and never injects markup.
 */

export const InlineSchema = z.object({
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  code: z.boolean().optional(),
  /** http(s)/mailto URL, or an in-app path starting with "/". */
  href: z.string().optional(),
});
export type Inline = z.infer<typeof InlineSchema>;

export const RichBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), content: z.array(InlineSchema) }),
  z.object({ type: z.literal("heading"), level: z.union([z.literal(3), z.literal(4)]), content: z.array(InlineSchema) }),
  z.object({ type: z.literal("list"), ordered: z.boolean(), items: z.array(z.array(InlineSchema)) }),
  z.object({ type: z.literal("quote"), content: z.array(InlineSchema) }),
  z.object({ type: z.literal("code"), text: z.string() }),
]);
export type RichBlock = z.infer<typeof RichBlockSchema>;

/**
 * A downloadable file. `url` is the Moodle file URL WITHOUT a token and is for
 * server-side use only: the browser downloads through the app's file route,
 * which appends the session's token on the server.
 */
export const CourseFileSchema = z.object({
  name: z.string(),
  mimeType: z.string().nullable(),
  size: z.number().nullable(),
  modified: z.string().nullable(),
  url: z.string(),
});
export type CourseFile = z.infer<typeof CourseFileSchema>;

export const AssignmentGradeSchema = z.object({
  /** As Moodle displays it, e.g. "18 / 20". */
  display: z.string(),
  value: z.number().nullable(),
  max: z.number().nullable(),
});

export const AssignmentDetailSchema = z.object({
  /** Course-module id, same as `Assignment.id`. */
  id: z.number(),
  /** Assign instance id (what mod_assign_* functions call `assignid`). */
  assignId: z.number(),
  courseId: z.number(),
  name: z.string(),
  intro: z.array(RichBlockSchema),
  attachments: z.array(CourseFileSchema),
  openDate: z.string().nullable(),
  /** Already reflects a per-student extension, if any. */
  dueDate: z.string().nullable(),
  cutoffDate: z.string().nullable(),
  extended: z.boolean(),
  maxGrade: z.number().nullable(),
  submission: z.enum(["none", "draft", "submitted"]),
  submittedAt: z.string().nullable(),
  submittedFiles: z.array(CourseFileSchema),
  submittedText: z.array(RichBlockSchema),
  grade: AssignmentGradeSchema.nullable(),
  gradedAt: z.string().nullable(),
  feedback: z.array(RichBlockSchema),
  locked: z.boolean(),
});
export type AssignmentDetail = z.infer<typeof AssignmentDetailSchema>;

const ModuleBase = {
  /** Course-module id. */
  id: z.number(),
  name: z.string(),
  description: z.array(RichBlockSchema),
  /** null when the course doesn't track completion for this activity. */
  completed: z.boolean().nullable(),
  dates: z.array(z.object({ label: z.string(), date: z.string() })),
};

export const CourseModuleSchema = z.discriminatedUnion("kind", [
  z.object({ ...ModuleBase, kind: z.literal("resource"), files: z.array(CourseFileSchema) }),
  z.object({ ...ModuleBase, kind: z.literal("folder"), files: z.array(CourseFileSchema) }),
  z.object({ ...ModuleBase, kind: z.literal("page"), content: z.array(RichBlockSchema) }),
  z.object({ ...ModuleBase, kind: z.literal("label") }),
  z.object({ ...ModuleBase, kind: z.literal("url"), href: z.string() }),
  z.object({ ...ModuleBase, kind: z.literal("forum") }),
  z.object({
    ...ModuleBase,
    kind: z.literal("quiz"),
    openDate: z.string().nullable(),
    closeDate: z.string().nullable(),
    timeLimitMinutes: z.number().nullable(),
    /** null = unlimited attempts */
    attempts: z.number().nullable(),
    maxGrade: z.number().nullable(),
  }),
  z.object({ ...ModuleBase, kind: z.literal("assign"), assignment: AssignmentDetailSchema.nullable() }),
  z.object({ ...ModuleBase, kind: z.literal("other"), modName: z.string() }),
]);
export type CourseModule = z.infer<typeof CourseModuleSchema>;

export const CourseSectionSchema = z.object({
  id: z.number(),
  /** Position in the course; 0 is the general/intro section. */
  number: z.number(),
  name: z.string(),
  summary: z.array(RichBlockSchema),
  modules: z.array(CourseModuleSchema),
});
export type CourseSection = z.infer<typeof CourseSectionSchema>;

export const CourseContentsSchema = z.object({
  courseId: z.number(),
  sections: z.array(CourseSectionSchema),
  /** Overall course grade from the gradebook, when it is visible to the student. */
  grade: z
    .object({ display: z.string(), percentage: z.string().nullable() })
    .nullable(),
});
export type CourseContents = z.infer<typeof CourseContentsSchema>;

/** Which list on a module a file lives in. Used by the download route. */
export type FileGroup = "files" | "attachments" | "submitted";

/**
 * Resolve a (module, group, index) reference to a file in already-loaded
 * course contents. The download route resolves files this way instead of
 * accepting a URL from the browser.
 */
export function findCourseFile(
  contents: CourseContents,
  cmid: number,
  group: FileGroup,
  index: number,
): CourseFile | null {
  for (const section of contents.sections) {
    for (const m of section.modules) {
      if (m.id !== cmid) continue;
      let list: CourseFile[] = [];
      if ((m.kind === "resource" || m.kind === "folder") && group === "files") list = m.files;
      if (m.kind === "assign" && m.assignment) {
        if (group === "attachments") list = m.assignment.attachments;
        if (group === "submitted") list = m.assignment.submittedFiles;
      }
      return list[index] ?? null;
    }
  }
  return null;
}

/** Every assignment in a course, in course order. */
export function courseAssignments(contents: CourseContents): AssignmentDetail[] {
  const out: AssignmentDetail[] = [];
  for (const s of contents.sections) {
    for (const m of s.modules) if (m.kind === "assign" && m.assignment) out.push(m.assignment);
  }
  return out;
}
