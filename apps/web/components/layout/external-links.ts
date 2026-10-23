/**
 * Links back to the real portals. Server-safe (no React): the (app) layout reads
 * the environment once and passes plain strings down through AppShell.
 */

export const DEFAULT_ERP_URL = "https://erp.sathyabama.ac.in";
export const DEFAULT_LMS_URL = "https://sathyabama.cognibot.in";

/** Returns the normalised URL when it is http(s), otherwise undefined. */
export function safeHttpUrl(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** The ERP and Moodle addresses to link to. Call on the server. */
export function portalLinks(env: NodeJS.ProcessEnv = process.env): {
  erpUrl: string;
  lmsUrl: string;
} {
  return {
    erpUrl: safeHttpUrl(env.ERP_BASE_URL) ?? DEFAULT_ERP_URL,
    lmsUrl: safeHttpUrl(env.LMS_BASE_URL) ?? DEFAULT_LMS_URL,
  };
}

/** Attributes every outbound portal link carries. */
export const EXTERNAL_LINK_PROPS = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;
