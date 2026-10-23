/**
 * Moodle parser layer.
 *
 *   ws.*    — REST web-services JSON → canonical types   (preferred, stable)
 *   html.*  — Boost-theme page scraping → canonical types (fallback)
 *
 * Both produce `@usp/core` canonical shapes validated by their Zod schemas.
 * See ./README.md.
 */
export * as ws from "./ws/index";
export * as html from "./html/index";
export { MoodleWsError, LmsParseError, type MoodleWsErrorInit } from "./errors";
export {
  unixToIso,
  stripHtml,
  decodeEntities,
  cleanText,
  tidyGrade,
  moduleToEventType,
  normalizeSiteUrl,
} from "./shared";
