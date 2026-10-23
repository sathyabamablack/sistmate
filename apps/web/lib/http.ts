import "server-only";

import { NextResponse } from "next/server";

/**
 * Reject cross-site POSTs. SameSite=lax cookies already block most CSRF, and
 * JSON bodies force a CORS preflight — this is a cheap third layer.
 */
export function rejectCrossOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) return null; // same-origin fetches from older browsers / curl
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host === host) return null;
  } catch {
    /* malformed origin */
  }
  return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
}

/**
 * Best-effort throttle (default 5 attempts / 10 min per key).
 *
 * The counters live in this process's memory, so the limit is PER INSTANCE:
 * on serverless hosts every warm instance (and every cold start) has its own
 * window, and an attacker who is spread over instances is not stopped. It
 * exists to protect your own portal account from being locked by repeated
 * mistaken attempts, not to defend against abuse. A shared limiter would need
 * a store such as Redis; that is deliberately not required here.
 */
const WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map<string, number[]>();

export function rateLimited(key: string, maxAttempts = 5): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  attempts.set(key, recent);
  if (attempts.size > 5000) attempts.clear(); // bound memory
  return recent.length > maxAttempts;
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/** The origin the browser used (honours x-forwarded-* from a proxy), for building redirects. */
export function requestOrigin(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

/**
 * True when the browser says the request did not come from another site.
 * `same-origin` is our own page, `none` is the user typing or bookmarking the
 * address. A missing header (old browsers, curl) is allowed so nothing breaks.
 * `cross-site` and `same-site` (a sibling subdomain) are not.
 */
export function isSameOriginNavigation(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  return site === null || site === "same-origin" || site === "none";
}
