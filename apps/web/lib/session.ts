import "server-only";

import { cookies, headers } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import type { AuthResult } from "@usp/core";
import { createLiveErpAdapter } from "@usp/erp-adapter";
import { createLiveLmsAdapter } from "@usp/lms-adapter";
import { parseDataSource, type DataSourceMode } from "./env-check";

/**
 * Encrypted, stateless session (iron-session: AES-256-GCM sealed cookie).
 *
 * The cookie carries only what the live adapters need to keep talking to the
 * portals: the ERP cookie jar and the Moodle web-service token. The password
 * is used once to obtain those and is never stored, logged, or returned.
 * Stateless means no database — it runs on any free serverless host.
 */

export interface SessionData {
  username?: string;
  createdAt?: string;
  /** Serialized ERP session: JSON with JWT token + register number (live mode only). */
  erpSession?: string;
  /** Moodle web-service token (live mode only). */
  lmsToken?: string;
}

export type DataSource = DataSourceMode;

/** DATA_SOURCE is case-insensitive; anything other than "live" means demo (mock) data. */
export function dataSource(): DataSource {
  return parseDataSource(process.env.DATA_SOURCE).mode;
}

const DEV_SECRET = "dev-only-insecure-secret-change-me-0123456789";

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters.");
  }
  return DEV_SECRET;
}

/**
 * Whether the cookie may be marked `Secure`. That depends on how the browser
 * reached us, not on NODE_ENV: a LAN `npm start` over plain http would
 * otherwise have its cookie silently dropped and the login would loop. Hosts
 * such as Vercel and most reverse proxies send `x-forwarded-proto`.
 */
async function cookieShouldBeSecure(): Promise<boolean> {
  try {
    const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    if (proto) return proto === "https";
  } catch {
    // No request in scope (tests, scripts): fall through.
  }
  return false;
}

function sessionOptions(secure: boolean): SessionOptions {
  return {
    password: secret(),
    cookieName: "usp_session",
    ttl: 60 * 60 * 8, // 8h — portal sessions rarely last longer anyway
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions(await cookieShouldBeSecure()));
}

export async function isAuthenticated(): Promise<boolean> {
  return Boolean((await getSession()).username);
}

export interface LoginInput {
  username: string;
  password: string;
  /** Moodle password, if different from the ERP one. */
  lmsPassword?: string;
}

export interface LoginResult {
  ok: boolean;
  error?: string;
  /** Live mode: whether the LMS connected (login still succeeds without it). */
  lmsConnected?: boolean;
  lmsError?: string;
}

/**
 * SECURITY: never log or return `input.password` / `input.lmsPassword`.
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const username = input.username.trim();
  if (!username) {
    return { ok: false, error: "Enter your register number." };
  }
  if (!input.password) {
    return { ok: false, error: "Enter your password." };
  }

  const session = await getSession();

  if (dataSource() === "mock") {
    session.username = username;
    session.createdAt = new Date().toISOString();
    await session.save();
    return { ok: true, lmsConnected: true };
  }

  // Live: ERP first (required). The LMS is only tried once the ERP accepts the
  // login, so a typo never sends credentials to Moodle or risks locking that
  // account. An LMS failure doesn't block sign-in.
  const failed = (e: unknown, fallback: string): AuthResult => ({
    ok: false,
    error: e instanceof Error ? e.message : fallback,
  });

  const erpAuth = await createLiveErpAdapter({
    baseUrl: process.env.ERP_BASE_URL,
    authBaseUrl: process.env.ERP_AUTH_URL,
  })
    .authenticate({ username, password: input.password })
    .catch((e: unknown) => failed(e, "ERP sign-in failed."));

  if (!erpAuth.ok || !erpAuth.session) {
    return { ok: false, error: erpAuth.error ?? "ERP sign-in failed." };
  }

  const lmsAuth = process.env.LMS_BASE_URL
    ? await createLiveLmsAdapter({ baseUrl: process.env.LMS_BASE_URL })
        .authenticate({ username, password: input.lmsPassword || input.password })
        .catch((e: unknown) => failed(e, "LMS sign-in failed."))
    : failed(null, "LMS is not configured.");

  session.username = username;
  session.createdAt = new Date().toISOString();
  session.erpSession = erpAuth.session;
  session.lmsToken = lmsAuth.ok ? lmsAuth.session : undefined;
  await session.save();

  return {
    ok: true,
    lmsConnected: Boolean(lmsAuth.ok && lmsAuth.session),
    lmsError: lmsAuth.ok ? undefined : lmsAuth.error,
  };
}

export async function logout(): Promise<void> {
  (await getSession()).destroy();
}
