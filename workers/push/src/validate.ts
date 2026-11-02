/**
 * Input checks for the push Worker. Pure functions, no Workers APIs, so they run under `node --test`.
 */

export interface SubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** The only hosts a browser's push service uses. The Worker POSTs to the endpoint, so anything else is refused. */
export function isPushHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "fcm.googleapis.com" ||
    h === "updates.push.services.mozilla.com" ||
    h.endsWith(".push.services.mozilla.com") ||
    h === "web.push.apple.com" ||
    h.endsWith(".push.apple.com") ||
    h.endsWith(".notify.windows.com")
  );
}

const B64URL = /^[A-Za-z0-9_-]+$/;

/** A subscription as PushSubscription.toJSON() gives it, or null if anything is off. */
export function parseSubscription(raw: unknown): SubscriptionInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") return null;
  if (endpoint.length > 700) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (!isPushHost(url.hostname)) return null;
  // 65-byte P-256 public key = 87 base64url characters; 16-byte auth secret = 22.
  if (p256dh.length < 80 || p256dh.length > 90 || !B64URL.test(p256dh)) return null;
  if (auth.length < 20 || auth.length > 24 || !B64URL.test(auth)) return null;
  return { endpoint, p256dh, auth };
}

export interface Alert {
  title: string;
  body: string;
  /** A path on the site to open when the alert is tapped, or "" for the home page. */
  url: string;
}

/** C0 controls, DEL, and the Unicode line/paragraph separators. Built from code points so no raw separator sits in this file. */
const CONTROL_CLASS = "[\u0000-\u001f\u007f" + String.fromCharCode(0x2028) + String.fromCharCode(0x2029) + "]";
const CONTROL_RUN = new RegExp(CONTROL_CLASS, "g");
const HAS_CONTROL = new RegExp("[\u0000-\u001f]");

/** Collapses whitespace and strips control characters, then cuts to `max`. */
export function cleanLine(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(CONTROL_RUN, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export const MAX_TITLE = 80;
export const MAX_BODY = 240;

/** An alert from the admin form. Null when the title or body is empty or the link is not a site path. */
export function parseAlert(raw: unknown): Alert | null {
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as { title?: unknown; body?: unknown; url?: unknown };
  const title = cleanLine(input.title, MAX_TITLE);
  const body = cleanLine(input.body, MAX_BODY);
  if (!title || !body) return null;
  const url = typeof input.url === "string" ? input.url.trim() : "";
  if (url) {
    // Same-site paths only: "/notifications", never "//evil.example" or "https://...".
    const hasControl = HAS_CONTROL.test(url);
    if (!url.startsWith("/") || url.startsWith("//") || url.includes("\\") || url.length > 200 || hasControl) {
      return null;
    }
  }
  return { title, body, url };
}

/** A non-negative integer cursor, else 0. */
export function parseCursor(raw: unknown): number {
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw < 1e12 ? raw : 0;
}
