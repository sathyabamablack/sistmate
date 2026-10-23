/**
 * ERP HTML parser layer.
 *
 * Every parser is a pure function `(html, opts?) => CanonicalType`:
 * no network, no global state. Page-specific knowledge (selectors, header
 * aliases, grade points) lives ONLY in ./selectors.ts - when the real portal
 * pages are captured, that is the file to edit. See ./README.md.
 *
 * All parsers validate their output with the matching @usp/core Zod schema
 * and throw {@link ParseError} (with the page name and a reason) when the page
 * doesn't look as expected.
 */

export { ParseError, validate, type PageName } from "./errors";

export {
  DEFAULT_SELECTORS,
  type ErpSelectors,
  type TableSpec,
  type ProfileField,
  type AttendanceField,
  type MarksField,
  type ResultsField,
  type GpaField,
  type FeesField,
  type TimetableLegendField,
  type NoticeField,
} from "./selectors";

export {
  cleanText,
  normalizeKey,
  isBlank,
  optText,
  toNumber,
  toInt,
  parseFraction,
  round2,
  romanToInt,
  toSemester,
  toIsoDate,
  toIsoDateTime,
  parseTime,
  parseTimeRange,
  dayIndex,
  stableHash,
  resolveUrl,
  cellLines,
  tableGrid,
  headerMatches,
  mapHeader,
  candidateTables,
  findTables,
  findTable,
  readRows,
  scopeOf,
  type Sel,
  type GridCell,
  type TableMatch,
  type TimeOptions,
  type ReadRowsOptions,
} from "./table";

export {
  parseLoginForm,
  detectLoginFailure,
  isLoginPage,
  type LoginForm,
  type LoginParseOptions,
} from "./login";
export { parseProfile, type ProfileParseOptions } from "./profile";
export { parseAttendance, type AttendanceParseOptions } from "./attendance";
export { parseMarks, parseComponentHeader, type MarksParseOptions } from "./marks";
export { parseResults, type ResultsParseOptions } from "./results";
export { parseTimetable, type TimetableParseOptions } from "./timetable";
export { parseFees, type FeesParseOptions } from "./fees";
export {
  parseNotifications,
  notificationId,
  type NotificationsParseOptions,
} from "./notifications";
