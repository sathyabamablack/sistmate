/**
 * Read the expiry of a JWT without verifying it. Used only to tell the student
 * how long their ERP connection lasts; it is never a security decision (the
 * ERP rejects an expired or forged token itself).
 */

function decodeBase64Url(segment: string): string | null {
  try {
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** The token's `exp` claim as a Date, or null when it is missing or the token is not a JWT. */
export function jwtExpiry(token: string | null | undefined): Date | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  const json = decodeBase64Url(parts[1]);
  if (json === null) return null;
  try {
    const payload: unknown = JSON.parse(json);
    if (typeof payload !== "object" || payload === null) return null;
    const exp = (payload as { exp?: unknown }).exp;
    if (typeof exp !== "number" || !Number.isFinite(exp) || exp <= 0) return null;
    const date = new Date(exp * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

export type ConnectionState =
  | { status: "connected"; expiresAt: Date }
  | { status: "expired"; expiresAt: Date }
  /** A token exists but carries no readable expiry. */
  | { status: "unknown" }
  | { status: "none" };

export function connectionState(token: string | null | undefined, now: Date = new Date()): ConnectionState {
  if (!token) return { status: "none" };
  const expiresAt = jwtExpiry(token);
  if (!expiresAt) return { status: "unknown" };
  return expiresAt.getTime() > now.getTime()
    ? { status: "connected", expiresAt }
    : { status: "expired", expiresAt };
}
