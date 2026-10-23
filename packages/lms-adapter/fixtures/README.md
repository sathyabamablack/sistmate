# LMS fixtures — ALL SYNTHETIC

**Nothing in this folder came from the real LMS.** Every file was hand-written to
match the documented shapes of stock Moodle 4.x (web-service JSON) and the Boost
theme (HTML). Names, register numbers, ids, tokens and URLs
(`https://lms.example.edu`) are fictional.

HTML files say so in a leading comment. JSON cannot carry comments, so this file
is the marker for `ws/*.json`.

## Shared fictional dataset

- Student: Aarav Krishnan, username `41110987`, Moodle `userid` 2417
- Site: `https://lms.example.edu` (siteurl returned with a trailing slash on purpose)
- "Today" in the data: **2026-10-11** (IST, +05:30)
- Courses (category id 12, "B.E. CSE / Semester 5"):

| course id | short  | full name                              | progress |
|-----------|--------|----------------------------------------|----------|
| 101       | CS1501 | Design and Analysis of Algorithms      | 72       |
| 102       | CS1502 | Database Management Systems            | 88       |
| 103       | CS1503 | Operating Systems                      | 54       |
| 104       | CS1504 | Computer Networks                      | 41       |
| 105       | CS1505 | Theory of Computation                  | 63       |
| 106       | CS1506 | Object Oriented Software Engineering   | null (completion off) |

- Assignments (assign instance id / **cmid** — canonical `Assignment.id` is the cmid):

| assign id | cmid | course | due (IST)            | state                         |
|-----------|------|--------|----------------------|-------------------------------|
| 301       | 5001 | 101    | 2026-10-15 23:59     | pending (status `new`)        |
| 307       | 5007 | 101    | 2026-10-01 23:59     | submitted, graded 9.50/10     |
| 302       | 5002 | 102    | 2026-10-09 23:59     | submitted, graded 18/20       |
| 306       | 5006 | 102    | none (`duedate: 0`)  | no status entry at all        |
| 303       | 5003 | 103    | 2026-10-04 23:59     | OVERDUE, not submitted        |
| 304       | 5004 | 104    | 2026-10-20 23:59     | submitted, not yet graded     |
| 305       | 5005 | 105    | 2026-10-18 23:59     | `draft` → not submitted       |

- Calendar events 801–806, notifications 9001–9004.

## Files

`ws/` — one file per Moodle web-service function response:

| file | function |
|------|----------|
| `core_webservice_get_site_info.json` | `core_webservice_get_site_info` |
| `core_enrol_get_users_courses.json` | `core_enrol_get_users_courses` |
| `mod_assign_get_assignments.json` | `mod_assign_get_assignments` |
| `mod_assign_get_submission_status.bundle.json` | **not a single response**: an object mapping assign instance id → that assignment's `mod_assign_get_submission_status` response (Moodle needs one call per assignment) |
| `core_calendar_get_action_events_by_timesort.json` | `core_calendar_get_action_events_by_timesort` |
| `core_calendar_get_calendar_upcoming_view.json` | `core_calendar_get_calendar_upcoming_view` |
| `message_popup_get_popup_notifications.json` | `message_popup_get_popup_notifications` |
| `token_success.json`, `token_error.json` | `login/token.php` |
| `ws_exception_invalidtoken.json`, `ws_exception_ws_disabled.json` | Moodle exception envelopes |

`html/` — Boost-theme pages: `login.html`, `login_failed.html`, `my_courses.html`
(cards, saved after JS), `course_index.html`, `assign_index_course102.html` (stock
columns), `assign_index_course101_custom_theme.html` (reordered/renamed columns),
`upcoming.html`.

## Replacing with real captures

1. Save real responses/pages into `captures/lms/` (strip your token/session
   cookies and anything personal you don't want in git).
2. Copy them over the files here, keeping the file names.
3. Run the tests. Expect the *value* assertions (names, counts) to fail — update
   them to the real data. *Shape* failures (`LmsParseError`) mean a Zod schema in
   `src/parsers/ws/` or a selector in `src/parsers/html/selectors.ts` needs editing.
