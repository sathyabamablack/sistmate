import "server-only";

import { createHash } from "node:crypto";
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

/**
 * The same throttle, but shared across every serverless instance when a Redis store is configured
 * (Upstash, or Vercel KV: the same REST variables lib/interest.ts reads). Fixed 10-minute windows, one
 * counter per key; the key is hashed so no register number is stored. If the store is missing or
 * answers an error, it falls back to the per-instance counter above instead of blocking sign-in.
 */
export async function checkRate(key: string, maxAttempts = 5): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.KV_REST_API_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim();
  if (url && token) {
    try {
      const slot = `rl:${createHash("sha256").update(key).digest("hex").slice(0, 32)}:${Math.floor(Date.now() / WINDOW_MS)}`;
      const res = await fetch(`${url.replace(/\/+$/, "")}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify([["INCR", slot], ["EXPIRE", slot, String(WINDOW_MS / 1000)]]),
        cache: "no-store",
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const answers = (await res.json()) as { result?: unknown }[];
        const count = Number(answers[0]?.result);
        if (Number.isFinite(count)) return count > maxAttempts;
      }
    } catch {
      /* store unreachable: use the in-memory counter (and say so, so an outage is visible in the logs) */
    }
    console.warn("[ratelimit] shared store unavailable; counting per instance for now.");
  }
  return rateLimited(key, maxAttempts);
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
