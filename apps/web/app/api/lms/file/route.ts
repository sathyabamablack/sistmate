import { NextResponse } from "next/server";
import { findCourseFile, type FileGroup } from "@usp/core";
import {
  canViewInline,
  contentDisposition,
  mockFileBytes,
  resolveMoodleFileUrl,
  servedContentType,
} from "@usp/lms-adapter";
import { dataSource, getSession } from "@/lib/session";
import { rejectCrossOrigin } from "@/lib/http";
import { loadCourseContents } from "@/lib/lms-course";

export const maxDuration = 60;

const MAX_BYTES = 50 * 1024 * 1024;
const GROUPS = new Set<FileGroup>(["files", "attachments", "submitted"]);

const baseHeaders = {
  // Personal course material: never cache in shared caches.
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  // Even if a file were rendered, it could not run script or load anything.
  "Content-Security-Policy": "default-src 'none'; sandbox",
} as const;

const fail = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

const posInt = (v: string | null): number | null => {
  const n = Number(v);
  return v !== null && Number.isInteger(n) && n >= 0 && n < 1e9 ? n : null;
};

/**
 * Streams a file from the student's own Moodle courses.
 *
 * The browser only names a file by (course, activity, list, position). The
 * target URL comes from the course contents we loaded for this session, is
 * checked to be on the configured Moodle host, and the Moodle token is added
 * here on the server — it never reaches the browser.
 */
export async function GET(req: Request) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  if (req.headers.get("sec-fetch-site") === "cross-site") return fail("Cross-site request rejected.", 403);

  const q = new URL(req.url).searchParams;
  const courseId = posInt(q.get("course"));
  const cmid = posInt(q.get("cm"));
  const index = posInt(q.get("i"));
  const group = (q.get("group") ?? "files") as FileGroup;
  if (courseId === null || cmid === null || index === null || !GROUPS.has(group)) {
    return fail("Bad request.", 400);
  }

  const view = await loadCourseContents(courseId);
  if (view.status === "signed-out" || view.status === "expired") return fail("Sign in again.", 401);
  if (view.status === "not-connected") return fail("Your LMS isn't connected.", 409);
  if (view.status === "error") return fail(view.message, 502);

  const file = findCourseFile(view.contents, cmid, group, index);
  if (!file) return fail("File not found.", 404);

  const wantInline = q.get("view") === "1" && canViewInline(file.mimeType);

  if (dataSource() === "mock") {
    const bytes = mockFileBytes(file);
    return new Response(bytes as BodyInit, {
      headers: {
        ...baseHeaders,
        "Content-Type": servedContentType(file.mimeType),
        "Content-Disposition": contentDisposition(file.name, wantInline),
        "Content-Length": String(bytes.byteLength),
      },
    });
  }

  const session = await getSession();
  const baseUrl = process.env.LMS_BASE_URL;
  const target = session.lmsToken && baseUrl ? resolveMoodleFileUrl(file.url, baseUrl, session.lmsToken) : null;
  if (!target) return fail("This file can't be downloaded.", 400);

  let upstream: Response;
  try {
    // A redirect could point anywhere, so it is never followed.
    upstream = await fetch(target, { redirect: "manual", signal: AbortSignal.timeout(45_000) });
  } catch {
    return fail("The LMS didn't respond.", 504);
  }
  if (upstream.status === 401 || upstream.status === 403) return fail("The LMS refused this file.", 403);
  if (upstream.status === 404) return fail("File not found on the LMS.", 404);
  if (!upstream.ok || !upstream.body) return fail("The LMS couldn't serve this file.", 502);

  // Moodle answers a bad token with a JSON error body rather than an HTTP error.
  const upstreamType = upstream.headers.get("content-type") ?? "";
  if (/json/i.test(upstreamType) && !/json/i.test(file.mimeType ?? "")) {
    return fail("The LMS refused this file. Sign in again.", 401);
  }

  const declared = Number(upstream.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) return fail("This file is too large to download here.", 413);

  let received = 0;
  const limited = upstream.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > MAX_BYTES) controller.error(new Error("File exceeds the size limit."));
        else controller.enqueue(chunk);
      },
    }),
  );

  const headers: Record<string, string> = {
    ...baseHeaders,
    "Content-Type": servedContentType(file.mimeType || upstreamType),
    "Content-Disposition": contentDisposition(file.name, wantInline),
  };
  if (Number.isFinite(declared) && declared > 0 && !upstream.headers.get("content-encoding")) {
    headers["Content-Length"] = String(declared);
  }
  return new Response(limited, { headers });
}
