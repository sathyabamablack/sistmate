/**
 * API endpoint paths for the Sathyabama ERP REST API.
 *
 * The live adapter hard-codes these (they come from the Angular bundle analysis).
 * This module is kept for backward compatibility and mock/fixture tooling.
 *
 * The HTML page paths below are ONLY used by the fixture-tested parsers in
 * ./parsers/ (which remain as the mock-data pipeline for development and tests).
 */
export interface ErpPaths {
  login: string;
  profile: string;
  attendance: string;
  marks: string;
  results: string;
  timetable: string;
  fees: string;
  notifications: string;
}

export const DEFAULT_PATHS: ErpPaths = {
  login: "/",
  profile: "/Student/Profile.aspx",
  attendance: "/Student/Attendance.aspx",
  marks: "/Student/InternalMarks.aspx",
  results: "/Student/Results.aspx",
  timetable: "/Student/TimeTable.aspx",
  fees: "/Student/FeeDetails.aspx",
  notifications: "/Student/Circulars.aspx",
};

/** Defaults overlaid with the ERP_PAGE_PATHS env override (invalid JSON is ignored). */
export function resolvePaths(override?: Partial<ErpPaths>): ErpPaths {
  let fromEnv: Partial<ErpPaths> = {};
  const raw = typeof process !== "undefined" ? process.env.ERP_PAGE_PATHS : undefined;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") fromEnv = parsed as Partial<ErpPaths>;
    } catch {
      /* ignore malformed override */
    }
  }
  return { ...DEFAULT_PATHS, ...fromEnv, ...override };
}
