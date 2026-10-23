/**
 * Moodle REST web-services mappers (preferred path).
 * Each mapper takes the decoded JSON (`unknown`), rejects Moodle exception
 * envelopes via `parseWsError`, validates the raw shape with a lenient Zod
 * schema, and returns canonical `@usp/core` types validated by their schemas.
 */
export * from "./wsError";
export * from "./token";
export * from "./siteInfo";
export * from "./courses";
export * from "./courseContents";
export * from "./assignments";
export * from "./calendar";
export * from "./notifications";
