/**
 * Typed errors raised by the Moodle parsers.
 *
 * - `MoodleWsError`  — Moodle answered, but with an exception envelope
 *                      (`{ exception, errorcode, message }`). The request reached
 *                      Moodle; Moodle refused it (bad token, missing capability,
 *                      web services disabled, ...).
 * - `LmsParseError`  — the response/page did not have the shape we expected.
 *                      Usually means the institution's Moodle differs from the
 *                      fixtures (version, theme, plugin) and a schema or a
 *                      selector in `html/selectors.ts` needs updating.
 */

/** Moodle error codes that mean "your token/session is no longer valid". */
const AUTH_ERROR_CODES = new Set(["invalidtoken", "invalidlogin", "requireloginerror"]);

/**
 * Error codes that mean "the web-service path is not usable on this site" —
 * the adapter should fall back to HTML scraping. Observed on stock Moodle;
 * verify against the institution's real responses.
 */
const WS_UNAVAILABLE_CODES = new Set([
  "enablewsdescription", // "Web services must be enabled in Advanced features."
  "servicenotavailable", // the requested service (e.g. moodle_mobile_app) is disabled
  "servicerequireslogin",
  "webservicesnotenabled",
]);

export interface MoodleWsErrorInit {
  exception: string;
  errorcode: string;
  message: string;
  debuginfo?: string | null;
}

export class MoodleWsError extends Error {
  readonly exception: string;
  readonly errorcode: string;
  readonly debuginfo: string | undefined;

  constructor(init: MoodleWsErrorInit) {
    super(`LMS error [${init.errorcode}]: ${init.message}`);
    this.name = "MoodleWsError";
    this.exception = init.exception;
    this.errorcode = init.errorcode;
    this.debuginfo = init.debuginfo ?? undefined;
  }

  /** Token expired / revoked / wrong — re-authenticate. */
  get isAuthError(): boolean {
    return AUTH_ERROR_CODES.has(this.errorcode);
  }

  /** Web services are disabled for this site/user — use the HTML fallback. */
  get isWebServiceUnavailable(): boolean {
    return WS_UNAVAILABLE_CODES.has(this.errorcode);
  }
}

export class LmsParseError extends Error {
  /** Which parser failed, e.g. "ws.mapCourses" or "html.parseAssignmentIndex". */
  readonly parser: string;
  /** Underlying cause (ZodError, etc.) when available. */
  readonly details: unknown;

  constructor(parser: string, message: string, details?: unknown) {
    super(`[${parser}] ${message}`);
    this.name = "LmsParseError";
    this.parser = parser;
    this.details = details;
  }
}
