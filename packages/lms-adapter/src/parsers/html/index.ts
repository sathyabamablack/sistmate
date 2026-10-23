/**
 * HTML scrape fallback (use when the institution has disabled web services).
 * All selectors / header aliases / text patterns live in ./selectors.ts.
 */
export * as selectors from "./selectors";
export { DEFAULT_TZ_OFFSET, parseMoodleDate, unixParamToIso, type DateParseOptions } from "./dates";
export { parseLoginForm, detectLoginFailure, isLoggedInPage, type LoginForm } from "./login";
export { parseMyCourses, type HtmlCoursesOptions } from "./myCourses";
export {
  parseAssignmentIndex,
  matchColumns,
  isSubmittedText,
  type AssignmentIndexOptions,
  type AssignColumn,
  type ColumnMap,
  type HeaderAliases,
} from "./assignmentIndex";
export { parseUpcoming, type UpcomingOptions } from "./upcoming";
