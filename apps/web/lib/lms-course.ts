import "server-only";

import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { cache as reactCache } from "react";
import { SessionExpiredError, type CourseContents, type LmsAdapter } from "@usp/core";
import { createMockLmsAdapter, createLiveLmsAdapter } from "@usp/lms-adapter";
import { createCache } from "@usp/cache";
import { dataSource, getSession } from "./session";
import { mockDayOffset } from "./mock-clock";

/**
 * Per-course Moodle contents for the in-app course view.
 *
 * Built the same way the dashboard builds its adapters (session token, same
 * mock/live switch) but cached per user and course, because loading one
 * course takes several Moodle calls. Failures never throw: the page gets a
 * status it can explain to the student.
 */

const TTL_MS = 5 * 60 * 1000;

const store = createCache({
  dir: process.env.VERCEL
    ? path.join(os.tmpdir(), "usp-cache")
    : path.join(process.cwd(), "data", "cache"),
  namespace: "lms-course",
});

export type CourseView =
  | { status: "ok"; contents: CourseContents }
  | { status: "signed-out" }
  | { status: "not-connected" }
  | { status: "expired" }
  | { status: "error"; message: string };

function scope(username: string): string {
  const id = createHash("sha256").update(username).digest("hex").slice(0, 16);
  return `usp:${dataSource()}:${id}:course`;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DAY_MS = 86_400_000;

/** The mock data is written around one fixed day; move every timestamp to today. */
function shiftIsoStrings<T>(value: T, days: number): T {
  if (typeof value === "string") {
    if (!ISO.test(value)) return value;
    const t = Date.parse(value);
    return (Number.isNaN(t) ? value : new Date(t + days * DAY_MS).toISOString()) as T;
  }
  if (Array.isArray(value)) return value.map((v) => shiftIsoStrings(v, days)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, shiftIsoStrings(v, days)]),
    ) as T;
  }
  return value;
}

export const loadCourseContents = reactCache(async (courseId: number): Promise<CourseView> => {
  const session = await getSession();
  if (!session.username) return { status: "signed-out" };

  if (dataSource() === "mock") {
    try {
      const contents = await createMockLmsAdapter().getCourseContents(courseId);
      return { status: "ok", contents: shiftIsoStrings(contents, mockDayOffset()) };
    } catch {
      return { status: "error", message: "This course isn't available." };
    }
  }

  if (!session.lmsToken) return { status: "not-connected" };
  const lms: LmsAdapter = createLiveLmsAdapter({
    baseUrl: process.env.LMS_BASE_URL,
    token: session.lmsToken,
  });

  try {
    const contents = await store.wrap<CourseContents>(
      `${scope(session.username)}:${courseId}`,
      TTL_MS,
      () => lms.getCourseContents(courseId),
    );
    return { status: "ok", contents };
  } catch (err) {
    if (err instanceof SessionExpiredError) return { status: "expired" };
    // Log the message only, never request bodies or tokens.
    console.error(`[lms] course ${courseId}: ${err instanceof Error ? err.message : "failed"}`);
    return {
      status: "error",
      message: "The LMS didn't return this course. It may be slow or the course may not be open to you.",
    };
  }
});

/**
 * A course's contents only if they are already at hand: the mock data, or a
 * fresh entry in the per-course cache (the student opened that course in the
 * last few minutes). Never calls Moodle, so the course list can show
 * "4 units, 9 files" without one request per course. Returns null otherwise.
 */
export async function peekCourseContents(courseId: number): Promise<CourseContents | null> {
  const session = await getSession();
  if (!session.username) return null;
  if (dataSource() === "mock") {
    const view = await loadCourseContents(courseId);
    return view.status === "ok" ? view.contents : null;
  }
  if (!session.lmsToken) return null;
  try {
    return (await store.get<CourseContents>(`${scope(session.username)}:${courseId}`)) ?? null;
  } catch {
    return null;
  }
}

// Pure course logic (units, files, grouping, search) lives in ./course-work so it can be
// unit tested; re-exported here so callers find everything in one place.
export * from "./course-work";
