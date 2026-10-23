import * as cheerio from "cheerio";
import { cleanText } from "../shared";
import { HIDDEN_TEXT } from "./selectors";

/** Small cheerio helpers so parsers can walk ordered selector-fallback lists. */

const PLACEHOLDER_BASE = "http://placeholder.invalid/";

/** Load HTML; optionally drop screen-reader-only text first (sr-only labels pollute .text()). */
export function loadPage(html: string, opts: { stripHidden?: boolean } = {}): cheerio.CheerioAPI {
  const $ = cheerio.load(html);
  if (opts.stripHidden) $(HIDDEN_TEXT).remove();
  return $;
}

/** Try each selector in order; return the first non-empty result, or null. */
export function firstMatch<T extends { length: number }>(
  selectors: readonly string[],
  query: (selector: string) => T,
): T | null {
  for (const sel of selectors) {
    const r = query(sel);
    if (r.length > 0) return r;
  }
  return null;
}

/** Try each selector in order; return the first non-empty cleaned text, or "". */
export function firstText(selectors: readonly string[], getText: (selector: string) => string): string {
  for (const sel of selectors) {
    const t = cleanText(getText(sel));
    if (t) return t;
  }
  return "";
}

/** Try each attribute name in order; return the first non-empty value. */
export function firstAttr(
  attrs: readonly string[],
  getAttr: (attr: string) => string | undefined,
): string | undefined {
  for (const a of attrs) {
    const v = getAttr(a)?.trim();
    if (v) return v;
  }
  return undefined;
}

/** Read a numeric query param from a link whose path contains `pathIncludes`. */
export function idFromHref(
  href: string | undefined,
  pathIncludes: string,
  param = "id",
): number | undefined {
  if (!href) return undefined;
  try {
    const u = new URL(href, PLACEHOLDER_BASE);
    if (!u.pathname.includes(pathIncludes)) return undefined;
    const v = u.searchParams.get(param);
    return v && /^\d+$/.test(v) ? Number(v) : undefined;
  } catch {
    return undefined;
  }
}

/** Resolve `href` against `baseUrl` when given; otherwise return it unchanged. */
export function absUrl(href: string | undefined, baseUrl?: string): string | undefined {
  if (!href) return undefined;
  if (!baseUrl) return href;
  try {
    return new URL(href, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).href;
  } catch {
    return href;
  }
}

/** Normalise a table header for alias matching: lower-case, no punctuation, single spaces. */
export function normalizeHeader(text: string): string {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
