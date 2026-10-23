import fs from "node:fs";

/** Read a fixture file as text (path relative to packages/lms-adapter/fixtures/). */
export function fixture(relPath: string): string {
  return fs.readFileSync(new URL(`../fixtures/${relPath}`, import.meta.url), "utf8");
}

/** Read and JSON-parse a fixture. Returned as `unknown`, like a real HTTP body. */
export function jsonFixture(relPath: string): unknown {
  return JSON.parse(fixture(relPath)) as unknown;
}

export const SITE = "https://lms.example.edu";

/** "Now" for the synthetic dataset: Sunday 2026-10-11, 11:30 IST. */
export const NOW = new Date("2026-10-11T06:00:00Z");
