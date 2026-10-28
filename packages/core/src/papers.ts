/**
 * Question papers, notes and question banks: the pieces shared by the web app, the Cloudflare
 * Worker that stores them (workers/papers) and the import tools (tools/papers).
 *
 * Pure functions plus Web Crypto, so the same module runs in Node, the browser and Workers.
 *
 * Access tokens: the web app signs `{ sub, role, exp }` with PAPERS_SIGNING_KEY; the Worker checks
 * it. `sub` is an HMAC of the register number, so the Worker never sees or stores register numbers.
 */

/**
 * What an item is. Past papers say which exam they're from; notes and question banks may say
 * which unit or topic they cover instead. The database keeps the kind in exam_type: "notes" and
 * "question_bank" mark those kinds and any other value is a past paper's exam type, so rows from
 * before kinds existed (the library's included) are past papers without being rewritten.
 */
export const PAPER_KINDS = ["paper", "notes", "question_bank"] as const;
export type PaperKind = (typeof PAPER_KINDS)[number];

export const KIND_LABELS: Record<PaperKind, string> = {
  paper: "Past paper",
  notes: "Notes",
  question_bank: "Question bank",
};

/** For filters and counts. */
export const KIND_PLURALS: Record<PaperKind, string> = {
  paper: "Past papers",
  notes: "Notes",
  question_bank: "Question banks",
};

/** Which exam a past paper is from. */
export const EXAM_TYPES = ["end_sem", "cae", "model", "sample", "other"] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  end_sem: "End semester",
  cae: "CAE / internal",
  model: "Model exam",
  sample: "Sample paper",
  other: "Other",
};

/** The exam_type column's value for an item: the exam type for a past paper, else the kind. */
export function storedType(m: Pick<PaperMeta, "kind" | "examType">): string {
  return m.kind === "paper" ? (m.examType ?? "other") : m.kind;
}

/** The kind and exam type an exam_type column value stands for. */
export function fromStoredType(stored: string): { kind: PaperKind; examType: ExamType | null } {
  if (stored === "notes" || stored === "question_bank") return { kind: stored, examType: null };
  return { kind: "paper", examType: (EXAM_TYPES as readonly string[]).includes(stored) ? (stored as ExamType) : "other" };
}

export const PAPER_SOURCES = ["student", "autolib", "import"] as const;
export type PaperSource = (typeof PAPER_SOURCES)[number];

export const PAPER_STATUSES = ["pending", "approved", "rejected"] as const;
export type PaperStatus = (typeof PAPER_STATUSES)[number];

export const ROLES = ["student", "admin", "importer"] as const;
export type Role = (typeof ROLES)[number];

/** Largest file the Worker accepts. Photos are compressed in the browser well below this. */
export const MAX_PAPER_BYTES = 20 * 1024 * 1024;
/** Uploads one student may make per rolling day. */
export const DAILY_UPLOAD_LIMIT = 10;
export const REPORT_REASONS = ["wrong_course", "unreadable", "not_a_paper", "duplicate", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** A paper, notes or question bank as the Worker returns it to the app. */
export interface Paper {
  id: string;
  courseCode: string;
  courseTitle: string;
  kind: PaperKind;
  /** Past papers only. */
  examType: ExamType | null;
  /** A past paper's exam year; for notes and question banks, the year shared unless someone said. */
  year: number;
  month: number | null;
  /** Unit or topic, for notes and question banks. */
  topic: string | null;
  source: PaperSource;
  status: PaperStatus;
  /** 0 when unknown (library papers are fetched from the library when opened). */
  bytes: number;
  downloads: number;
  createdAt: string;
  /** The library's department name, for papers from AutoLib. */
  department?: string | null;
  /** "pdf", "docx" or "doc"; null until a library paper has been opened once. */
  fileType?: string | null;
  /** Only in admin views. */
  rejectReason?: string | null;
  sourceRef?: string | null;
  reports?: number;
}

/** One subject that has papers, for searching in the browser (GET /subjects). */
export interface PaperSubject {
  code: string;
  title: string;
  papers: number;
}

/** Subjects whose code or name contains every word of the query. */
export function matchSubjects(subjects: PaperSubject[], query: string, limit = 40): PaperSubject[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return subjects
    .filter((s) => {
      const hay = `${s.code} ${s.title}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => Number(b.code.toLowerCase().startsWith(words[0]!)) - Number(a.code.toLowerCase().startsWith(words[0]!)) || b.papers - a.papers)
    .slice(0, limit);
}

/** What an uploader or importer says about a file. */
export interface PaperMeta {
  courseCode: string;
  courseTitle: string;
  kind: PaperKind;
  /** Past papers only; null for notes and question banks. */
  examType: ExamType | null;
  year: number;
  /** Past papers only. */
  month: number | null;
  /** Notes and question banks only: the unit or topic, if given. */
  topic: string | null;
}

// ---------------------------------------------------------------------------------------------
// Course codes

/** Same shape as the ERP/LMS codes (lib/course-names.ts): S + 5-10 letters/digits, with a digit. */
const CODE_EXACT = /^S[A-Z0-9]{5,10}$/;
const CODE_IN_TEXT = /\bS[A-Z0-9]{5,10}\b/g;

export function normalizeCourseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function isCourseCode(raw: string): boolean {
  const code = normalizeCourseCode(raw);
  return CODE_EXACT.test(code) && /\d/.test(code);
}

// ---------------------------------------------------------------------------------------------
// Metadata

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** One line of plain text: runs of spaces and control characters become a single space. */
function oneLine(raw: unknown, max: number): string {
  return String(raw ?? "").replace(/[\s\p{Cc}]+/gu, " ").trim().slice(0, max);
}

const given = (v: unknown) => v !== undefined && v !== null && v !== "";

/**
 * Validates and normalises metadata from a form, a query string or an importer. Without a kind
 * it's a past paper, except that the exam types "question_bank" and "notes" still mean those
 * kinds (question banks were an exam type before kinds existed).
 */
export function checkMeta(
  input: Partial<Record<keyof PaperMeta, unknown>>,
  now: Date = new Date(),
): Checked<PaperMeta> {
  const courseCode = normalizeCourseCode(String(input.courseCode ?? ""));
  if (!isCourseCode(courseCode)) return { ok: false, error: "Enter the subject code, like SCSB1303." };

  const courseTitle = oneLine(input.courseTitle, 120);

  const rawType = String(input.examType ?? "");
  const kind = (given(input.kind) ? String(input.kind) : rawType === "notes" || rawType === "question_bank" ? rawType : "paper") as PaperKind;
  if (!PAPER_KINDS.includes(kind)) return { ok: false, error: "Pick what you're sharing." };

  let examType: ExamType | null = null;
  if (kind === "paper") {
    examType = rawType as ExamType;
    if (!EXAM_TYPES.includes(examType)) return { ok: false, error: "Pick what kind of paper this is." };
  }

  // Notes and question banks don't ask for a year: they're dated the year they're shared.
  const year = kind === "paper" || given(input.year) ? Number(input.year) : now.getFullYear();
  if (!Number.isInteger(year) || year < 2000 || year > now.getFullYear() + 1) {
    return { ok: false, error: kind === "paper" ? "Enter the year of the exam." : "Enter a year from 2000 on." };
  }

  let month: number | null = null;
  if (kind === "paper" && given(input.month)) {
    month = Number(input.month);
    if (!Number.isInteger(month) || month < 1 || month > 12) return { ok: false, error: "Pick a month from the list." };
  }

  const topic = kind === "paper" ? null : oneLine(input.topic, 80) || null;

  return { ok: true, value: { courseCode, courseTitle, kind, examType, year, month, topic } };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Best guess at a paper's metadata from a file name, a library title or a page of text. Used by
 * the importers; everything it returns still goes through checkMeta and human review.
 */
export function guessMeta(raw: string): Partial<PaperMeta> {
  // File names use _ and . as spaces ("S12BLH31_model_exam.pdf").
  const text = raw.replace(/[_.]+/g, " ");
  const upper = text.toUpperCase();
  const guess: Partial<PaperMeta> = {};

  for (const m of upper.matchAll(CODE_IN_TEXT)) {
    if (/\d/.test(m[0])) {
      guess.courseCode = m[0];
      break;
    }
  }

  const years = [...text.matchAll(/(?<!\d)(20\d{2})(?!\d)/g)].map((m) => Number(m[1]));
  if (years.length) guess.year = Math.max(...years);

  const lower = text.toLowerCase();
  // "Nov/Dec 2023" or "April 2024": the last month named is the one the exam ended in.
  const named = [...lower.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/g)];
  const lastMonth = named.at(-1)?.[1];
  if (lastMonth) guess.month = MONTHS.indexOf(lastMonth) + 1;

  if (/question\s*bank/.test(lower)) guess.kind = "question_bank";
  else if (/\bnotes\b/.test(lower)) guess.kind = "notes";
  else if (/\bmodel\b/.test(lower)) guess.examType = "model";
  else if (/\bsample\b|\bspecimen\b/.test(lower)) guess.examType = "sample";
  else if (/\bcae\b|\binternal\b|\bcat\b|\bcia\b/.test(lower)) guess.examType = "cae";
  else if (/end\s*sem|semester\s*exam|university\s*exam|\b(nov|dec|apr|may)\b/.test(lower)) guess.examType = "end_sem";

  return guess;
}

// ---------------------------------------------------------------------------------------------
// Files

/** True when the bytes start like a PDF (`%PDF-`). */
export function looksLikePdf(head: Uint8Array): boolean {
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d];
  return head.length >= magic.length && magic.every((b, i) => head[i] === b);
}

/** A short, safe download name like `SCSB1303-end_sem-2024-11.pdf` or `SCSB1303-notes-2026.pdf`. */
export function paperFileName(p: Pick<PaperMeta, "courseCode" | "kind" | "examType" | "year" | "month">): string {
  const month = p.month ? `-${String(p.month).padStart(2, "0")}` : "";
  return `${p.courseCode}-${storedType(p)}-${p.year}${month}.pdf`;
}

// ---------------------------------------------------------------------------------------------
// Tokens

export interface TokenPayload {
  /** HMAC of the register number (see subjectFor). */
  sub: string;
  role: Role;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(key: string, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, encoder.encode(data)));
}

/** A stable, anonymous id for a student: the same register number always gives the same id. */
export async function subjectFor(registerNumber: string, key: string): Promise<string> {
  return base64url(await hmac(key, `papers-subject:${registerNumber.trim().toUpperCase()}`)).slice(0, 22);
}

export async function signToken(payload: TokenPayload, key: string): Promise<string> {
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${base64url(await hmac(key, body))}`;
}

/** The payload if the token is genuine and unexpired, else null. */
export async function verifyToken(token: string, key: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<TokenPayload | null> {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined || !key) return null;
  let expected: Uint8Array;
  let given: Uint8Array;
  try {
    expected = await hmac(key, body);
    given = fromBase64url(sig);
  } catch {
    return null;
  }
  if (given.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= (given[i] ?? 0) ^ (expected[i] ?? 0);
  if (diff !== 0) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromBase64url(body))) as TokenPayload;
    if (typeof p.sub !== "string" || !ROLES.includes(p.role) || typeof p.exp !== "number") return null;
    return p.exp > nowSeconds ? p : null;
  } catch {
    return null;
  }
}
