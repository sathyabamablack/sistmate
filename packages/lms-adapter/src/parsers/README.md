# Moodle parsers

Pure functions that turn Moodle responses into the canonical `@usp/core` types
(`LmsCourse`, `Assignment`, `CalendarEvent`, `Notification`). No network code
lives here — the live adapter fetches, these parse. Every output object is
validated with its `@usp/core` Zod schema before it is returned, so drift fails
loudly with an `LmsParseError` naming the parser and the offending field.

```ts
import { ws, html, MoodleWsError, LmsParseError } from "./parsers/index.js";
```

## Two paths

### 1. `ws.*` — REST web services (PREFERRED)

Moodle's web-service JSON is documented and versioned, so it does not break when
the college changes its theme. Flow:

1. `POST {site}/login/token.php?service=moodle_mobile_app` (username, password)
   → `ws.parseTokenResponse(body)` → `{ ok: true, token } | { ok: false, error }`.
2. `GET {site}/webservice/rest/server.php?wstoken=…&moodlewsrestformat=json&wsfunction=…`

| wsfunction | mapper | output |
|------------|--------|--------|
| `core_webservice_get_site_info` | `ws.mapSiteInfo(json)` | `{ userid, fullname, username, siteurl, functions }` |
| `core_enrol_get_users_courses` (`userid`) | `ws.mapCourses(json, { siteUrl, categoryNames?, grades? })` | `LmsCourse[]` (keeps `lastaccess` as `lastAccess`) |
| `core_course_get_categories` (optional) | `ws.mapCategoryNames(json)` | category id → "Parent / Child" |
| `gradereport_overview_get_course_grades` (`userid`, optional) | `ws.mapCourseGrades(json)` | course id → displayed course total |
| `mod_assign_get_assignments` | `ws.mapAssignments(json, { siteUrl, submissionStatuses })` | `Assignment[]` |
| `mod_assign_get_submission_status` (`assignid`, one call each) | merged via `submissionStatuses[assignId]` | |
| `core_calendar_get_action_events_by_timesort` / `core_calendar_get_calendar_upcoming_view` | `ws.mapCalendarEvents(json)` | `CalendarEvent[]` |
| `message_popup_get_popup_notifications` (`useridto`) | `ws.mapNotifications(json)` | `Notification[]` |

Moodle returns HTTP 200 even for errors. Every mapper first calls
`ws.parseWsError(json)`, which throws a `MoodleWsError` for
`{ exception, errorcode, message }`. Check `err.isAuthError` (re-login) and
`err.isWebServiceUnavailable` (switch to the HTML path).

Conventions:
- UNIX seconds → ISO UTC (`unixToIso`); `0`/missing → `null` (e.g. no due date).
- HTML in names/messages is stripped and entities decoded (`stripHtml`).
- **`Assignment.id` is the course-module id (`cmid`)**, the id in
  `mod/assign/view.php?id=…`, so WS and HTML paths agree.
- Calendar ids are `lms-event-<moodle id>` on both paths (de-duplicable).

### 2. `html.*` — page scraping (FALLBACK)

Use only if the institution has disabled web services / the mobile service
(`token.php` returns `enablewsdescription` / `servicenotavailable`, or non-JSON).
Requires `cheerio`.

| page | parser |
|------|--------|
| `login/index.php` | `html.parseLoginForm(html, pageUrl)` → `{ action, logintoken, fields, usernameField, passwordField }`; after POST: `html.detectLoginFailure(html)` → message or `null`; `html.isLoggedInPage(html)` |
| `my/courses.php` (saved after JS), dashboard, `course/index.php` | `html.parseMyCourses(html, { baseUrl })` |
| `mod/assign/index.php?id=COURSE` | `html.parseAssignmentIndex(html, { courseId?, courseName?, baseUrl?, tzOffset? })` |
| `calendar/view.php?view=upcoming` | `html.parseUpcoming(html, { baseUrl?, tzOffset? })` |

**Every selector, header alias and text pattern is in `html/selectors.ts`.**
Themes vary — when real captures arrive, edit that one file. Table columns are
matched by header text (aliases), never by position. Scraped dates carry no
timezone; they are interpreted as `+05:30` unless you pass `tzOffset`
(prefer the `time=` UNIX param on calendar links where Moodle provides it).

Known HTML-path limits: `my/courses.php` cards are rendered by JavaScript
(a plain HTTP fetch gets an empty shell — use `course/index.php` or the
assignment/calendar pages); submission status/grades are only as precise as the
text in the table.

## Swapping fixtures for real captures

1. Log in to the real LMS in a browser. For WS, call the functions above with
   your token (e.g. via curl) and save each JSON body; for HTML, save each page.
   Put raw captures in `captures/lms/` (keep tokens/cookies out of git).
2. Copy them over the matching files in `packages/lms-adapter/fixtures/`
   (names listed in `fixtures/README.md`), removing the "SYNTHETIC FIXTURE" note.
3. Run the package tests (`vitest`). Value assertions will need updating to the
   real data; shape failures tell you which Zod schema (`ws/*.ts`) or selector
   (`html/selectors.ts`) to adjust.
