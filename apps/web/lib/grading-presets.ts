import "server-only";

import { resolveCourse, type CourseInfo, type ResolvedCourse } from "@usp/core";
import { courseInfo } from "@usp/core/sathyabama";
import type { GradingSettings } from "./grading-settings";

/**
 * Server side of the grading settings: the official course catalog behind every
 * estimated grade. Client components import ./grading-settings instead, so the
 * ~380 KB catalog never reaches the browser.
 */
export * from "./grading-settings";

/** Official (or fallback) facts for one course, before any student correction. */
export function officialCourse(code: string, title: string): CourseInfo {
  return courseInfo(code, title);
}

/**
 * Credits and mark maxima for one subject: the student's correction, else the official
 * catalog, else the fallback guess. Passed straight to `estimateGrades`.
 */
export function creditsResolver(settings: GradingSettings) {
  return (code: string, title: string): ResolvedCourse =>
    resolveCourse(courseInfo(code, title), settings.credits[code]);
}
