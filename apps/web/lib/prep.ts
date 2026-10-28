import type { CalendarEvent, GradeBand } from "@usp/core";
import { extractCodes, type ErpSubject } from "./course-names";
import {
  parseState,
  resolveGoal,
  withPresetScale,
  withPreviousFallback,
  type PlannerSubject,
  type PreviousStanding,
  type ResolvedGoal,
  type SubjectPlan,
} from "./planner";
import { nextCountdowns, type Countdown } from "./risk";

/**
 * Exam prep: one page per subject that pulls together what the CGPA planner says the exam
 * needs, a revision checklist, the subject's next exam, its LMS course and past papers.
 * Pure functions, safe on client and server.
 */

/* ============================== Revision checklist ============================== */

/** localStorage key for the revision checklists; the number is the format version. */
export const PREP_KEY = "usp-prep-v1";

/** Sathyabama syllabi have five units, so a new subject starts with one topic per unit. */
export const DEFAULT_TOPICS = ["Unit 1", "Unit 2", "Unit 3", "Unit 4", "Unit 5"];
export const MAX_TOPICS = 30;
export const MAX_TOPIC_LENGTH = 80;
const MAX_SUBJECTS = 40;
const CODE = /^[A-Z0-9]{3,16}$/;
const TOPIC_ID = /^t\d{1,4}$/;

export interface Topic {
  id: string;
  name: string;
  done: boolean;
}

export interface PrepState {
  v: 1;
  /** Topics per subject code. A code that isn't here still has the five default units. */
  subjects: Record<string, Topic[]>;
}

export function defaultPrepState(): PrepState {
  return { v: 1, subjects: {} };
}

export function defaultTopics(): Topic[] {
  return DEFAULT_TOPICS.map((name, i) => ({ id: `t${i + 1}`, name, done: false }));
}

/** Single spaces, trimmed, at most MAX_TOPIC_LENGTH characters. */
export function cleanTopicName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_TOPIC_LENGTH).trim();
}

/** Read stored JSON defensively: bad entries are dropped, anything unreadable gives the defaults. */
export function parsePrepState(json: string | null | undefined): PrepState {
  const base = defaultPrepState();
  if (!json) return base;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return base;
  }
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  // A later format this build doesn't know: start fresh rather than misread it.
  if (r.v !== 1 || !r.subjects || typeof r.subjects !== "object") return base;

  for (const [code, list] of Object.entries(r.subjects as Record<string, unknown>).slice(0, MAX_SUBJECTS)) {
    if (!CODE.test(code) || !Array.isArray(list)) continue;
    const topics: Topic[] = [];
    for (const t of list.slice(0, MAX_TOPICS)) {
      if (!t || typeof t !== "object") continue;
      const o = t as Record<string, unknown>;
      const name = typeof o.name === "string" ? cleanTopicName(o.name) : "";
      if (typeof o.id !== "string" || !TOPIC_ID.test(o.id) || !name) continue;
      if (topics.some((x) => x.id === o.id)) continue;
      topics.push({ id: o.id, name, done: o.done === true });
    }
    base.subjects[code] = topics;
  }
  return base;
}

/** The subject's topics: what the student saved, else the five units. */
export function topicsFor(state: PrepState, code: string): Topic[] {
  return state.subjects[code.toUpperCase()] ?? defaultTopics();
}

export function withTopics(state: PrepState, code: string, topics: Topic[]): PrepState {
  return { ...state, subjects: { ...state.subjects, [code.toUpperCase()]: topics.slice(0, MAX_TOPICS) } };
}

function nextTopicId(topics: Topic[]): string {
  const max = topics.reduce((m, t) => Math.max(m, Number(t.id.slice(1)) || 0), 0);
  return `t${max + 1}`;
}

/** Adds a topic at the end. Blank names and a full list change nothing. */
export function addTopic(topics: Topic[], name: string): Topic[] {
  const clean = cleanTopicName(name);
  if (!clean || topics.length >= MAX_TOPICS) return topics;
  return [...topics, { id: nextTopicId(topics), name: clean, done: false }];
}

/** Renames a topic; a blank name keeps the old one. */
export function renameTopic(topics: Topic[], id: string, name: string): Topic[] {
  const clean = cleanTopicName(name);
  if (!clean) return topics;
  return topics.map((t) => (t.id === id ? { ...t, name: clean } : t));
}

export function removeTopic(topics: Topic[], id: string): Topic[] {
  return topics.filter((t) => t.id !== id);
}

export function setTopicDone(topics: Topic[], id: string, done: boolean): Topic[] {
  return topics.map((t) => (t.id === id ? { ...t, done } : t));
}

export interface TopicProgress {
  done: number;
  total: number;
  /** 0..100, whole numbers; 0 for an empty list. */
  percent: number;
}

export function topicProgress(topics: Topic[]): TopicProgress {
  const done = topics.filter((t) => t.done).length;
  return { done, total: topics.length, percent: topics.length ? Math.round((done / topics.length) * 100) : 0 };
}

/* ============================== What the exam needs ============================== */

/** What the server hands the browser so it can run the planner on the saved state. */
export interface PlannerInputs {
  subjects: PlannerSubject[];
  presetScale?: GradeBand[] | null;
  estimatedPrevious?: PreviousStanding | null;
}

/**
 * The planner's answer for the student's saved state, worked out exactly as the CGPA planner
 * page does: the grading preset's bands unless edited, estimated CGPA for blank fields, then
 * the grade or GPA goal. `subjects` must be the planner's full list (a GPA goal spans them all).
 */
export function resolvePlanner(
  json: string | null | undefined,
  subjects: PlannerSubject[],
  presetScale?: GradeBand[] | null,
  estimatedPrevious?: PreviousStanding | null,
): ResolvedGoal {
  const state = withPreviousFallback(withPresetScale(parseState(json), presetScale), estimatedPrevious);
  return resolveGoal(state, subjects);
}

export function planFor(resolved: ResolvedGoal, code: string): SubjectPlan | null {
  const upper = code.toUpperCase();
  return resolved.plan.subjects.find((p) => p.code.toUpperCase() === upper) ?? null;
}

export type Need =
  | { kind: "no-exam" }
  | { kind: "out-of-reach"; target: string; best: string }
  | {
      kind: "need";
      /** Marks on the paper as written (98 of 100 for a theory paper). */
      paper: number;
      paperMax: number;
      /** After conversion, for a theory paper written for 100 and converted to 50. */
      converted: { marks: number; max: number } | null;
      target: string;
      /** The internal marks secure the target; only the exam pass mark is left. */
      passOnly: boolean;
    };

/** The planner's "Exam marks needed" for one subject, by the same rules as its Needed cell. */
export function needFor(plan: SubjectPlan): Need {
  if (plan.externalMax <= 0) return { kind: "no-exam" };
  if (!plan.reachable) return { kind: "out-of-reach", target: plan.target, best: plan.bestGrade };
  return {
    kind: "need",
    paper: plan.paperNeeded,
    paperMax: plan.paperMax,
    converted: plan.paperMax !== plan.externalMax ? { marks: plan.needed, max: plan.externalMax } : null,
    target: plan.target,
    passOnly: plan.secured && plan.needed === plan.externalMin,
  };
}

/** "98/100 in the exam (49/50 after conversion) for A+", or why there is no number. */
export function needSentence(need: Need): string {
  if (need.kind === "no-exam") return "No semester exam in this subject.";
  if (need.kind === "out-of-reach") return `${need.target} is out of reach. The best you can get is ${need.best}.`;
  const after = need.converted ? ` (${need.converted.marks}/${need.converted.max} after conversion)` : "";
  return `${need.paper}/${need.paperMax} in the exam${after} for ${need.target}${need.passOnly ? ", just the pass mark" : ""}.`;
}

/** A short version for the subject list: "98/100 for A+". */
export function needShort(need: Need): string {
  if (need.kind === "no-exam") return "No exam";
  if (need.kind === "out-of-reach") return `${need.target} out of reach`;
  return `${need.paper}/${need.paperMax} for ${need.target}`;
}

/** One line on why the planner aims where it does, when it aims for a GPA or CGPA. */
export function goalNote(resolved: ResolvedGoal): string | null {
  const n = resolved.number;
  if (!n) return null;
  const what = n.kind === "gpa" ? "semester GPA" : "CGPA";
  if (n.grade) return `${n.grade} in every subject reaches your ${what} goal of ${n.target}.`;
  if (n.issue === "out-of-reach") return `Your ${what} goal of ${n.target} is out of reach, so this is for the best grade.`;
  return null;
}

/* ============================== Next exam ============================== */

const words = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

/**
 * The subject an exam event is about, or null when it can't be told. A subject code in the
 * title wins; else the course name or title naming one subject in whole words (the longest,
 * so "Operating Systems Lab" beats "Operating Systems"). Two equally good matches give null:
 * better to say nothing than to count down to someone else's exam.
 */
export function examSubject(event: Pick<CalendarEvent, "title" | "courseName">, subjects: ErpSubject[]): ErpSubject | null {
  const codes = extractCodes(event.title, event.courseName);
  const byCode = subjects.filter((s) => codes.includes(s.code.toUpperCase()));
  if (byCode.length > 0) return byCode.length === 1 ? byCode[0]! : null;

  const course = words(event.courseName ?? "");
  const exact = subjects.filter((s) => course.trim() !== "" && words(s.title) === course);
  if (exact.length > 0) return exact.length === 1 ? exact[0]! : null;

  const text = words(`${event.title} ${event.courseName ?? ""}`);
  const named = subjects
    .map((s) => ({ s, w: words(s.title) }))
    .filter(({ w }) => w.trim().length >= 6 && text.includes(w))
    .sort((a, b) => b.w.length - a.w.length);
  if (named.length === 0) return null;
  if (named.length > 1 && named[1]!.w.length === named[0]!.w.length) return null;
  return named[0]!.s;
}

export interface SubjectExam extends Countdown {
  /** The event's title without the subject's name: "CIA-2 Examination". */
  label: string;
  date: string;
}

/** "CIA-2 Examination: Operating Systems" → "CIA-2 Examination"; "Exam" when nothing is left. */
export function examLabel(title: string, subject: ErpSubject): string {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let s = title;
  for (const part of [subject.title, subject.code]) {
    if (part.trim()) s = s.replace(new RegExp(escape(part.trim()), "gi"), " ");
  }
  s = s
    .replace(/\(\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s:–—\-,|/]+|[\s:–—\-,|/(]+$/g, "")
    .trim();
  return s || "Exam";
}

/**
 * The subject's next exam, chosen exactly as the dashboard picks its countdown
 * (`nextCountdowns`), from the exam events that are clearly about this subject.
 */
export function nextExamFor(
  subject: ErpSubject,
  subjects: ErpSubject[],
  events: CalendarEvent[],
  now: Date = new Date(),
): SubjectExam | null {
  const code = subject.code.toUpperCase();
  const mine = events.filter((e) => e.type === "exam" && examSubject(e, subjects)?.code.toUpperCase() === code);
  const exam = nextCountdowns(mine, now).exam;
  if (!exam) return null;
  const event = mine.find((e) => e.id === exam.id)!;
  return { ...exam, label: examLabel(exam.title, subject), date: event.date };
}

/* ============================== LMS course ============================== */

/** The LMS course for a subject code, by the code the course list shows (`displayCode`). */
export function courseFor<T extends { id: number; displayCode?: string | null }>(code: string, courses: T[]): T | null {
  const upper = code.toUpperCase();
  return courses.find((c) => c.displayCode?.toUpperCase() === upper) ?? null;
}
