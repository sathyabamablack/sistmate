import type { z } from "zod";
import type { CalendarEvent } from "@usp/core";
import { LmsParseError } from "./errors";

/**
 * Small, dependency-free helpers shared by the WS (JSON) and HTML parsers.
 */

/**
 * Validate `data` against `schema`; on failure throw an `LmsParseError` that
 * names the parser and lists every Zod issue (path + message), so a shape
 * change on the real LMS points straight at the offending field.
 */
export function parseWith<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
  parser: string,
): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const summary = result.error.issues
      .map((i) => `${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`)
      .join("; ");
    throw new LmsParseError(parser, `Unexpected shape — ${summary}`, result.error);
  }
  return result.data as z.output<S>;
}

/**
 * Moodle timestamps are UNIX seconds. `0`, `null`, `undefined`, negative or
 * non-finite values mean "not set" (e.g. an assignment with no due date) and
 * become `null`.
 */
export function unixToIso(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  rarr: "→",
  larr: "←",
};

/** Decode HTML entities in a single pass (so `&amp;lt;` stays `&lt;`). */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/**
 * Turn an HTML fragment (Moodle message bodies, formatted names, grade
 * displays) into plain single-line text: drops <script>/<style>, removes tags,
 * decodes entities, collapses whitespace.
 */
export function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  const noTags = input
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  return decodeEntities(noTags).replace(/\s+/g, " ").trim();
}

/** Collapse whitespace (incl. NBSP) and trim. */
export function cleanText(input: string | null | undefined): string {
  return (input ?? "").replace(/[\s ]+/g, " ").trim();
}

/** Remove trailing slashes: "https://lms.example.edu/" → "https://lms.example.edu". */
export function normalizeSiteUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Moodle activity module → canonical calendar event type.
 * Accepts either a `modulename` ("assign") or a frankenstyle component
 * ("mod_assign"). Anything not listed maps to "other".
 */
const MODULE_EVENT_TYPES: Record<string, CalendarEvent["type"]> = {
  assign: "assignment",
  quiz: "exam",
};

export function moduleToEventType(module: string | null | undefined): CalendarEvent["type"] {
  if (!module) return "other";
  const key = module.trim().toLowerCase().replace(/^mod_/, "");
  return MODULE_EVENT_TYPES[key] ?? "other";
}

/**
 * Tidy a Moodle grade string for display:
 *   "18.00 / 20.00" → "18 / 20",  "9.50 / 10.00" → "9.5 / 10",  "A+" → "A+".
 * Returns null for the "no grade" markers Moodle uses ("-", "", "Not graded").
 */
export function tidyGrade(raw: string | null | undefined): string | null {
  const text = cleanText(raw);
  if (!text || text === "-" || /^not\s+graded$/i.test(text) || /^no\s+grade$/i.test(text)) {
    return null;
  }
  return text.replace(/(\d+)\.(\d*?)0+(?=\D|$)/g, (_m, int: string, frac: string) =>
    frac ? `${int}.${frac}` : int,
  );
}

/** Format a numeric grade without pointless trailing zeros. */
export function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}
