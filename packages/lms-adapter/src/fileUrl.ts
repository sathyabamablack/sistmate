/**
 * Pure helpers for the app's Moodle file-download route. Kept free of
 * framework code so the security-relevant parts can be unit-tested.
 */

/**
 * Validate a Moodle file URL and attach the web-service token.
 *
 * Returns null unless the URL is on exactly the configured Moodle host (same
 * scheme, host and port), carries no embedded credentials, and points into
 * Moodle's pluginfile endpoint. This is what stops the download route being
 * used as an open proxy / SSRF primitive. Plain `/pluginfile.php/` URLs are
 * rewritten to `/webservice/pluginfile.php/`, the variant that accepts a token.
 */
export function resolveMoodleFileUrl(fileUrl: string, baseUrl: string, token: string): string | null {
  if (!token) return null;
  let base: URL;
  let url: URL;
  try {
    base = new URL(baseUrl);
    url = new URL(fileUrl);
  } catch {
    return null;
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") return null;
  if (url.protocol !== base.protocol || url.host !== base.host) return null;
  if (url.username || url.password) return null;

  const prefix = base.pathname.replace(/\/+$/, "");
  const rest = url.pathname.startsWith(`${prefix}/`) ? url.pathname.slice(prefix.length) : null;
  if (rest === null) return null;

  let path: string;
  if (rest.startsWith("/webservice/pluginfile.php/")) path = rest;
  else if (rest.startsWith("/pluginfile.php/")) path = `/webservice${rest}`;
  else return null;
  if (path.split("/").some((seg) => seg === ".." || seg === ".")) return null;

  const out = new URL(`${base.origin}${prefix}${path}`);
  url.searchParams.forEach((v, k) => {
    if (k.toLowerCase() !== "token") out.searchParams.append(k, v);
  });
  out.searchParams.set("token", token);
  return out.href;
}

/** True when `candidate` is a same-host Moodle URL, ignoring the token (for redirect checks and logs). */
export function isSameMoodleHost(candidate: string, baseUrl: string): boolean {
  try {
    const a = new URL(candidate);
    const b = new URL(baseUrl);
    return a.protocol === b.protocol && a.host === b.host;
  } catch {
    return false;
  }
}

/** A filename that is safe to put in a header and on disk. */
export function safeFilename(name: string | null | undefined): string {
  const cleaned = (name ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, "_")
    .replace(/^\.+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  return cleaned || "download";
}

/** Types a browser can show safely in a tab on our origin. Everything else is download-only. */
const INLINE_SAFE = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
]);

const NEVER_SERVE_AS_IS = /^(text\/html|application\/xhtml|image\/svg|text\/xml|application\/xml|text\/javascript|application\/javascript|application\/x-javascript|text\/css)/i;

export function canViewInline(mime: string | null | undefined): boolean {
  return INLINE_SAFE.has((mime ?? "").split(";")[0]!.trim().toLowerCase());
}

/** The Content-Type to send: the file's own type unless it could execute in our origin. */
export function servedContentType(mime: string | null | undefined): string {
  const type = (mime ?? "").split(";")[0]!.trim().toLowerCase();
  if (!type || NEVER_SERVE_AS_IS.test(type)) return "application/octet-stream";
  return type;
}

export function contentDisposition(filename: string, inline: boolean): string {
  const safe = safeFilename(filename);
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/%/g, "_");
  const encoded = encodeURIComponent(safe).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
