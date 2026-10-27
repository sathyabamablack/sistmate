/**
 * Question papers (previous-year papers, sample papers): the pieces shared by the web app, the
 * Cloudflare Worker that stores them (workers/papers) and the import tools (tools/papers).
 *
 * Pure functions plus Web Crypto, so the same module runs in Node, the browser and Workers.
 *
 * Access tokens: the web app signs `{ sub, role, exp }` with PAPERS_SIGNING_KEY; the Worker checks
 * it. `sub` is an HMAC of the register number, so the Worker never sees or stores register numbers.
 */

export const EXAM_TYPES = ["end_sem", "cae", "model", "sample", "question_bank", "other"] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  end_sem: "End semester",
  cae: "CAE / internal",
  model: "Model exam",
  sample: "Sample paper",
  question_bank: "Question bank",
  other: "Other",
};

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

/** A paper as the Worker returns it to the app. */
export interface Paper {
  id: string;
  courseCode: string;
  courseTitle: string;
  examType: ExamType;
  year: number;
  month: number | null;
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
  examType: ExamType;
  year: number;
  month: number | null;
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

/** Validates and normalises metadata from a form, a query string or an importer. */
export function checkMeta(
  input: Partial<Record<keyof PaperMeta, unknown>>,
  now: Date = new Date(),
): Checked<PaperMeta> {
  const courseCode = normalizeCourseCode(String(input.courseCode ?? ""));
  if (!isCourseCode(courseCode)) return { ok: false, error: "Enter the subject code, like SCSB1303." };

  const courseTitle = String(input.courseTitle ?? "").replace(/\s+/g, " ").trim().slice(0, 120);

  const examType = String(input.examType ?? "") as ExamType;
  if (!EXAM_TYPES.includes(examType)) return { ok: false, error: "Pick what kind of paper this is." };

  const year = Number(input.year);
  if (!Number.isInteger(year) || year < 2000 || year > now.getFullYear() + 1) {
    return { ok: false, error: "Enter the year of the exam." };
  }

  const rawMonth = input.month;
  let month: number | null = null;
  if (rawMonth !== undefined && rawMonth !== null && rawMonth !== "") {
    month = Number(rawMonth);
    if (!Number.isInteger(month) || month < 1 || month > 12) return { ok: false, error: "Pick a month from the list." };
  }

  return { ok: true, value: { courseCode, courseTitle, examType, year, month } };
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

  if (/question\s*bank/.test(lower)) guess.examType = "question_bank";
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

/** A short, safe download name like `SCSB1303-end_sem-2024-11.pdf`. */
export function paperFileName(p: Pick<PaperMeta, "courseCode" | "examType" | "year" | "month">): string {
  const month = p.month ? `-${String(p.month).padStart(2, "0")}` : "";
  return `${p.courseCode}-${p.examType}-${p.year}${month}.pdf`;
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
