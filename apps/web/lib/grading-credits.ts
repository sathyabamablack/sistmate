import {
  GRADING_COOKIE,
  parseGradingSettings,
  serializeGradingSettings,
  type GradingSettings,
} from "./grading-settings";

/**
 * Pure helpers for correcting one subject's credits. The correction lives in the
 * `usp-grading` cookie, so it must be merged into whatever is already there rather
 * than replacing it. No server-only imports: safe in client components.
 */

export const MIN_CREDITS = 0;
export const MAX_CREDITS = 12;
export const CREDIT_STEP = 0.5;

/** A credit value the student typed: clamped to 0-12 and rounded to the nearest half. null if unusable. */
export function normalizeCredits(raw: string | number): number | null {
  if (typeof raw === "string" && raw.trim() === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const stepped = Math.round(n / CREDIT_STEP) * CREDIT_STEP;
  return Math.min(MAX_CREDITS, Math.max(MIN_CREDITS, stepped));
}

/**
 * Settings with one subject's credits set to `credits`. A value equal to the
 * official (or estimated) default removes the override instead of storing it.
 */
export function withCreditOverride(
  settings: GradingSettings,
  code: string,
  credits: number,
  templateDefault: number,
): GradingSettings {
  const next = { ...settings.credits };
  if (credits === templateDefault) delete next[code];
  else next[code] = credits;
  return { ...settings, credits: next };
}

/** The raw value of one cookie from a `document.cookie` string, decoded. */
export function readCookie(cookieHeader: string, name: string): string | undefined {
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

const ONE_YEAR = 60 * 60 * 24 * 365;

/** A `document.cookie` assignment string that stores the settings for a year. */
export function gradingCookieString(settings: GradingSettings): string {
  return `${GRADING_COOKIE}=${encodeURIComponent(serializeGradingSettings(settings))}; path=/; max-age=${ONE_YEAR}; SameSite=Lax`;
}

/**
 * Merge a credit correction into the cookie currently in `cookieHeader` and return
 * the string to assign to `document.cookie`. The other subjects' corrections are kept.
 */
export function creditOverrideCookie(
  cookieHeader: string,
  code: string,
  credits: number,
  templateDefault: number,
): string {
  const current = parseGradingSettings(readCookie(cookieHeader, GRADING_COOKIE));
  return gradingCookieString(withCreditOverride(current, code, credits, templateDefault));
}
