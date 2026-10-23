import type { z } from "zod";

/** The ERP pages we know how to parse. Used to label errors. */
export type PageName =
  | "login"
  | "profile"
  | "attendance"
  | "marks"
  | "results"
  | "timetable"
  | "fees"
  | "notifications";

/**
 * Thrown whenever a page doesn't look the way the parser expects: a required
 * table/field is missing, a value can't be read, or the parsed object fails the
 * canonical Zod schema.
 *
 * The point is to fail LOUDLY when the college changes a page, instead of
 * silently showing the student wrong numbers. The message always says which
 * page broke and why, e.g.
 *   [erp:attendance] no table matched headers code + (total & attended) ...
 */
export class ParseError extends Error {
  readonly page: PageName;
  readonly reason: string;

  constructor(page: PageName, reason: string, options?: { cause?: unknown }) {
    super(`[erp:${page}] ${reason}`, options);
    this.name = "ParseError";
    this.page = page;
    this.reason = reason;
  }
}

/**
 * Run a Zod schema and convert a validation failure into a {@link ParseError}
 * that names the page and lists the offending paths.
 */
export function validate<S extends z.ZodTypeAny>(
  page: PageName,
  schema: S,
  value: unknown,
): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data as z.output<S>;
  const issues = result.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  throw new ParseError(page, `parsed data failed schema validation - ${issues}`, {
    cause: result.error,
  });
}
