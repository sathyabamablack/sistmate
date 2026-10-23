/**
 * Reads the `exp` (expiry) claim from a JWT without verifying it.
 *
 * This is only used to notice early that a stored ERP token has lapsed, so the
 * student is sent to reconnect instead of watching every section fail. The
 * ERP itself still decides what is valid. Works in Node and in browsers, and
 * never throws.
 */
export function decodeJwtExpiry(token: string | undefined | null): number | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const json = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    const claims: unknown = JSON.parse(json);
    if (typeof claims !== "object" || claims === null) return null;
    const exp = (claims as { exp?: unknown }).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** True only when the token carries an `exp` that has passed. Tokens without one are never "expired" here. */
export function isJwtExpired(token: string | undefined | null, now: number = Date.now()): boolean {
  const expiresAt = decodeJwtExpiry(token);
  return expiresAt !== null && expiresAt <= now;
}

/** Expiry (epoch ms) of the ERP token inside the serialized session cookie value, or null. */
export function erpSessionExpiry(erpSession: string | undefined | null): number | null {
  if (!erpSession) return null;
  try {
    const parsed: unknown = JSON.parse(erpSession);
    const token = (parsed as { token?: unknown } | null)?.token;
    return typeof token === "string" ? decodeJwtExpiry(token) : null;
  } catch {
    return null;
  }
}
