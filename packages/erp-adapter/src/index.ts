import type { ErpAdapter } from "@usp/core";
import { createMockAdapter, type MockErpOptions } from "./mock";
import { createLiveAdapter, type LiveErpOptions } from "./live";

/**
 * Entry point for the Sathyabama ERP adapter.
 *
 *  - **mock**: realistic, internally-consistent sample data (no network).
 *  - **live**: REST API client for the ERP's Angular SPA backend. Uses the
 *    JWT + StudentId from the student's own ERP sign-in (handed over by the
 *    ERP Connector extension) as Bearer auth for every request.
 *
 * The web layer picks one from DATA_SOURCE; the UI only sees `ErpAdapter`.
 */

export function createMockErpAdapter(opts?: MockErpOptions): ErpAdapter {
  return createMockAdapter(opts);
}

export function createLiveErpAdapter(opts?: LiveErpOptions): ErpAdapter {
  return createLiveAdapter(opts);
}

export type { LiveErpOptions } from "./live";
export type { MockErpOptions } from "./mock";
export { clampRange, parseDailyReply, parseErpDate, parseHourlyRow, parseHourlyRows } from "./attendance-days";
export { MISSING_STUDENT_ID } from "./live";
export { DEFAULT_PATHS, resolvePaths, type ErpPaths } from "./paths";
export * as parsers from "./parsers/index";
