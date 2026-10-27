import "server-only";

import { signToken, subjectFor, type Role } from "@usp/core/papers";
import { getSession } from "./session";

/**
 * Question papers live in a Cloudflare Worker (workers/papers), not on Vercel, so downloads and
 * uploads never run a function here. A page that shows papers mints a short-lived token for the
 * signed-in student and the browser calls the Worker with it.
 *
 *   PAPERS_API_URL      the Worker's origin, e.g. https://sistmate-papers.<sub>.workers.dev
 *   PAPERS_SIGNING_KEY  shared with the Worker (wrangler secret put PAPERS_SIGNING_KEY)
 *   PAPERS_ADMINS       comma-separated register numbers that may review papers
 *
 * All optional: without them the Papers page says the feature isn't set up.
 */

const TOKEN_SECONDS = 60 * 60;

export interface PapersAccess {
  apiUrl: string;
  token: string;
  isAdmin: boolean;
  /** Seconds since the epoch; the browser asks for a reload after this. */
  expiresAt: number;
}

export function papersConfigured(): boolean {
  return Boolean(process.env.PAPERS_API_URL?.trim() && process.env.PAPERS_SIGNING_KEY?.trim());
}

export function isPapersAdmin(registerNumber: string): boolean {
  const admins = (process.env.PAPERS_ADMINS ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return admins.includes(registerNumber.trim().toUpperCase());
}

/** A token for the signed-in student, or null when signed out or the feature isn't configured. */
export async function papersAccess(): Promise<PapersAccess | null> {
  if (!papersConfigured()) return null;
  const { username } = await getSession();
  if (!username) return null;
  const key = process.env.PAPERS_SIGNING_KEY!.trim();
  const isAdmin = isPapersAdmin(username);
  const role: Role = isAdmin ? "admin" : "student";
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_SECONDS;
  const token = await signToken({ sub: await subjectFor(username, key), role, exp: expiresAt }, key);
  return { apiUrl: process.env.PAPERS_API_URL!.trim().replace(/\/+$/, ""), token, isAdmin, expiresAt };
}
