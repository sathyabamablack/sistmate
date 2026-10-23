import { z } from "zod";
import { MoodleWsError } from "../errors";

/**
 * Moodle's REST server answers HTTP 200 even on failure, with a body like:
 *
 *   { "exception": "moodle_exception", "errorcode": "invalidtoken",
 *     "message": "Invalid token - token not found" }
 *
 * Every WS mapper calls `parseWsError` first so these never get mistaken for
 * (and fail validation as) a data payload.
 */
export const RawMoodleExceptionSchema = z
  .object({
    exception: z.string(),
    errorcode: z.string().optional(),
    message: z.string().optional(),
    debuginfo: z.string().nullish(),
  })
  .passthrough();
export type RawMoodleException = z.infer<typeof RawMoodleExceptionSchema>;

/** True when `json` is a Moodle exception envelope. */
export function isMoodleException(json: unknown): json is RawMoodleException {
  return RawMoodleExceptionSchema.safeParse(json).success;
}

/** Convert an exception envelope into a `MoodleWsError`, or `null` if `json` is not one. */
export function toMoodleWsError(json: unknown): MoodleWsError | null {
  const r = RawMoodleExceptionSchema.safeParse(json);
  if (!r.success) return null;
  return new MoodleWsError({
    exception: r.data.exception,
    errorcode: r.data.errorcode ?? "unknown",
    message: r.data.message ?? r.data.exception,
    debuginfo: r.data.debuginfo,
  });
}

/**
 * Recognise a Moodle exception response and throw it as a typed
 * `MoodleWsError`. Returns normally (no-op) for any other payload.
 */
export function parseWsError(json: unknown): void {
  const err = toMoodleWsError(json);
  if (err) throw err;
}
