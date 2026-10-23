import { z } from "zod";
import { RawMoodleExceptionSchema } from "./wsError";

/**
 * `POST /login/token.php?service=moodle_mobile_app` with username/password.
 *
 * Success: { "token": "abc123...", "privatetoken": "xyz..." }   (privatetoken only over HTTPS)
 * Failure: { "error": "Invalid login, please try again", "errorcode": "invalidlogin",
 *            "stacktrace": null, "debuginfo": null, "reproductionlink": null }
 */
export const RawTokenSuccessSchema = z
  .object({
    token: z.string().min(1),
    privatetoken: z.string().nullish(),
  })
  .passthrough();

export const RawTokenErrorSchema = z
  .object({
    error: z.string(),
    errorcode: z.string().nullish(),
    stacktrace: z.unknown().optional(),
    debuginfo: z.unknown().optional(),
    reproductionlink: z.unknown().optional(),
  })
  .passthrough();

export type TokenResult =
  | { ok: true; token: string; privateToken?: string }
  | { ok: false; error: string; errorcode?: string };

/**
 * Parse a token.php response. Accepts the decoded JSON or the raw body text.
 * Never throws for a failed login — that is a normal `{ ok: false }` result.
 */
export function parseTokenResponse(input: unknown): TokenResult {
  let json: unknown = input;
  if (typeof input === "string") {
    try {
      json = JSON.parse(input);
    } catch {
      return {
        ok: false,
        error:
          "token.php did not return JSON (web services may be disabled, or the site redirected to an SSO/login page).",
        errorcode: "nonjson",
      };
    }
  }

  const ok = RawTokenSuccessSchema.safeParse(json);
  if (ok.success) {
    return ok.data.privatetoken
      ? { ok: true, token: ok.data.token, privateToken: ok.data.privatetoken }
      : { ok: true, token: ok.data.token };
  }

  const err = RawTokenErrorSchema.safeParse(json);
  if (err.success) {
    return err.data.errorcode
      ? { ok: false, error: err.data.error, errorcode: err.data.errorcode }
      : { ok: false, error: err.data.error };
  }

  // Some Moodle versions answer token.php problems with a WS exception envelope.
  const exc = RawMoodleExceptionSchema.safeParse(json);
  if (exc.success) {
    return {
      ok: false,
      error: exc.data.message ?? exc.data.exception,
      errorcode: exc.data.errorcode ?? exc.data.exception,
    };
  }

  return { ok: false, error: "Unrecognised token.php response.", errorcode: "unrecognised" };
}
