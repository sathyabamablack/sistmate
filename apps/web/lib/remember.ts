import "server-only";

import { cookies, headers } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";

/**
 * "Keep me signed in": the register number and password, sealed (AES-256-GCM, iron-session) in an
 * httpOnly cookie on the student's own device. Nothing is written on the server. When the ERP
 * session runs out, /api/auth/resume opens the cookie and signs in again, so the student never
 * sees the login form again until they sign out or change their password.
 *
 * SECURITY: never log or return the password from here.
 */
export const REMEMBER_COOKIE = "usp_remember";
/** Set for a minute after a quiet sign-in, so a session that fails straight away cannot loop. */
export const RESUMED_COOKIE = "usp_resumed";

const REMEMBER_TTL_S = 60 * 60 * 24 * 60; // 60 days

interface RememberData {
  username?: string;
  password?: string;
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 32) return `${value}:remember`;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters.");
  }
  return "dev-only-insecure-secret-change-me-0123456789:remember";
}

async function secure(): Promise<boolean> {
  try {
    const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    if (proto) return proto === "https";
  } catch {
    // No request in scope.
  }
  return false;
}

async function options(): Promise<SessionOptions> {
  return {
    password: secret(),
    cookieName: REMEMBER_COOKIE,
    ttl: REMEMBER_TTL_S,
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: await secure(), path: "/" },
  };
}

async function jar() {
  return getIronSession<RememberData>(await cookies(), await options());
}

/** True when a remembered sign-in exists on this device (cheap: it does not open the cookie). */
export async function hasRemembered(): Promise<boolean> {
  return Boolean((await cookies()).get(REMEMBER_COOKIE)?.value);
}

export async function getRemembered(): Promise<{ username: string; password: string } | null> {
  try {
    const d = await jar();
    return d.username && d.password ? { username: d.username, password: d.password } : null;
  } catch {
    return null;
  }
}

/** Route handlers and server actions only (it sets a cookie). */
export async function saveRemembered(username: string, password: string): Promise<void> {
  const d = await jar();
  d.username = username;
  d.password = password;
  await d.save();
}

export async function clearRemembered(): Promise<void> {
  (await jar()).destroy();
}
