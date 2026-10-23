import type { AssignmentDetail, CourseFile, FileGroup } from "@usp/core";
// Relative on purpose: lib/course-work.ts imports this file and is unit tested without the "@" alias.
import { CAMPUS_TZ } from "../../lib/utils";

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: CAMPUS_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function parts(iso: string): Record<string, string> | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Object.fromEntries(PARTS.formatToParts(d).map((p) => [p.type, p.value]));
}

/** "Fri 17 Oct, 11:59 pm" (the year is added only when it isn't this year). */
export function formatWhen(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const p = parts(iso);
  if (!p) return "";
  const thisYear = parts(now.toISOString())?.year;
  const year = p.year !== thisYear ? ` ${p.year}` : "";
  return `${p.weekday} ${p.day} ${p.month}${year}, ${p.hour}:${p.minute} ${p.dayPeriod?.toLowerCase() ?? ""}`.trim();
}

/** "17 Oct" */
export function formatDay(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const p = parts(iso);
  if (!p) return "";
  const thisYear = parts(now.toISOString())?.year;
  return `${p.day} ${p.month}${p.year !== thisYear ? ` ${p.year}` : ""}`;
}

/** "5 minutes", "3 hours", "2 days" — the largest whole unit. */
export function spanText(ms: number): string {
  const abs = Math.abs(ms);
  const minutes = Math.max(1, Math.round(abs / 60_000));
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return `${days} days`;
}

/** "in 4 days" / "2 hours ago" */
export function relativeTo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - now.getTime();
  if (Number.isNaN(diff)) return "";
  return diff >= 0 ? `in ${spanText(diff)}` : `${spanText(diff)} ago`;
}

export function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

const TYPE_BY_MIME: Record<string, string> = {
  "application/pdf": "PDF",
  "application/zip": "ZIP",
  "text/plain": "Text",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
  "application/vnd.ms-powerpoint": "PowerPoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/msword": "Word",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.ms-excel": "Excel",
};

export function fileTypeLabel(file: Pick<CourseFile, "name" | "mimeType">): string {
  const mime = file.mimeType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (TYPE_BY_MIME[mime]) return TYPE_BY_MIME[mime];
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  const ext = /\.([a-z0-9]{1,5})$/i.exec(file.name)?.[1];
  return ext ? ext.toUpperCase() : "File";
}

/** Short type tag for file badges: "PDF", "PPT", "DOC", "XLS", "ZIP", "TXT", "IMG", or the extension. */
export function fileTypeShort(file: Pick<CourseFile, "name" | "mimeType">): string {
  const label = fileTypeLabel(file);
  const short: Record<string, string> = {
    PowerPoint: "PPT",
    Word: "DOC",
    Excel: "XLS",
    Text: "TXT",
    Image: "IMG",
    Video: "VIDEO",
    Audio: "AUDIO",
    PPTX: "PPT",
    DOCX: "DOC",
    XLSX: "XLS",
  };
  return short[label] ?? label;
}

/** The app's own download route for a course file. The Moodle token never reaches the page. */
export function fileHref(courseId: number, cmid: number, group: FileGroup, index: number, view = false): string {
  const q = new URLSearchParams({ course: String(courseId), cm: String(cmid), group, i: String(index) });
  if (view) q.set("view", "1");
  return `/api/lms/file?${q.toString()}`;
}

const VIEWABLE = /^(application\/pdf|image\/(png|jpeg|gif|webp)|text\/plain)$/i;

/** PDFs, common images and plain text open in a browser tab. */
export function isViewable(file: Pick<CourseFile, "mimeType">): boolean {
  return file.mimeType ? VIEWABLE.test(file.mimeType.split(";")[0]!.trim()) : false;
}

export type Tone = "success" | "danger" | "warning" | "muted" | "primary";

export interface AssignmentState {
  key: "graded" | "submitted" | "draft" | "overdue" | "closed" | "upcoming" | "due-soon" | "open";
  /** Short status, e.g. "Not submitted · overdue by 2 days". */
  label: string;
  tone: Tone;
}

const SOON_MS = 48 * 3_600_000;

/** The fields that decide an assignment's state; the dashboard list can supply them too. */
export type AssignmentStateInput = Pick<
  AssignmentDetail,
  "grade" | "submission" | "dueDate" | "openDate" | "cutoffDate" | "locked"
>;

export function assignmentState(a: AssignmentStateInput, now: Date = new Date()): AssignmentState {
  if (a.grade) return { key: "graded", label: `Graded · ${a.grade.display}`, tone: "success" };
  if (a.submission === "submitted") return { key: "submitted", label: "Submitted · awaiting grade", tone: "primary" };

  const t = now.getTime();
  const due = a.dueDate ? new Date(a.dueDate).getTime() : null;
  const cutoff = a.cutoffDate ? new Date(a.cutoffDate).getTime() : null;
  const draft = a.submission === "draft";
  const prefix = draft ? "Draft saved, not submitted" : "Not submitted";

  if (!draft && a.openDate && new Date(a.openDate).getTime() > t) {
    return { key: "upcoming", label: `Opens ${formatWhen(a.openDate, now)}`, tone: "muted" };
  }
  if ((cutoff !== null && cutoff < t) || a.locked) {
    return { key: "closed", label: `${prefix} · closed`, tone: "danger" };
  }
  if (due !== null && due < t) {
    return { key: "overdue", label: `${prefix} · overdue by ${spanText(t - due)}`, tone: "danger" };
  }
  if (due !== null && due - t <= SOON_MS) {
    return { key: "due-soon", label: `${prefix} · due in ${spanText(due - t)}`, tone: "warning" };
  }
  return { key: "open", label: prefix, tone: draft ? "warning" : "muted" };
}
