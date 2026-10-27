"use client";

import type { Paper, PaperMeta, PaperSubject, ReportReason } from "@usp/core/papers";

/** What a page hands its paper components: the Worker's origin and this visit's token. */
export interface PapersClient {
  apiUrl: string;
  token: string;
  isAdmin: boolean;
}

export class PapersError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function call<T>(client: PapersClient, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${client.apiUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${client.token}`, ...init.headers },
      cache: "no-store",
    });
  } catch {
    throw new PapersError("Couldn't reach the papers service. Check your connection and try again.", 0);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      res.status === 401 ? "This page has been open a while. Reload it to continue." : String(body.error ?? "Something went wrong.");
    throw new PapersError(message, res.status, body);
  }
  return body as T;
}

export function listPapers(client: PapersClient, query: { course?: string[]; type?: string; status?: string }) {
  const params = new URLSearchParams();
  if (query.course?.length) params.set("course", query.course.join(","));
  if (query.type) params.set("type", query.type);
  if (query.status) params.set("status", query.status);
  return call<{ papers: Paper[] }>(client, `/papers?${params}`).then((r) => r.papers);
}

let subjectsCache: Promise<PaperSubject[]> | null = null;

/** Every subject that has papers (a few hundred KB at most), fetched once per page load. */
export function listSubjects(client: PapersClient): Promise<PaperSubject[]> {
  subjectsCache ??= call<{ subjects: PaperSubject[] }>(client, "/subjects")
    .then((r) => r.subjects)
    .catch((err: unknown) => {
      subjectsCache = null;
      throw err;
    });
  return subjectsCache;
}

/** Opens in a new tab; the token rides in the URL because a plain link can't send headers. */
export function fileUrl(client: PapersClient, id: string): string {
  return `${client.apiUrl}/papers/${id}/file?t=${encodeURIComponent(client.token)}`;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function uploadPaper(client: PapersClient, meta: PaperMeta, pdf: Blob) {
  const bytes = await pdf.arrayBuffer();
  const params = new URLSearchParams({
    courseCode: meta.courseCode,
    courseTitle: meta.courseTitle,
    examType: meta.examType,
    year: String(meta.year),
    month: meta.month ? String(meta.month) : "",
  });
  return call<{ id: string; status: string }>(client, `/uploads?${params}`, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf", "X-Content-SHA256": await sha256Hex(bytes) },
    body: bytes,
  });
}

export function reportPaper(client: PapersClient, paperId: string, reason: ReportReason) {
  return call<{ ok: true }>(client, "/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paperId, reason }),
  });
}

export function reviewQueue(client: PapersClient) {
  return call<{ papers: Paper[]; reports: { paper_id: string; reason: string; n: number }[] }>(client, "/review");
}

export function moderatePaper(
  client: PapersClient,
  id: string,
  body: { action: "approve" } | { action: "reject"; reason: string } | { action: "update"; meta: PaperMeta },
) {
  return call<{ paper: Paper | null }>(client, `/papers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
