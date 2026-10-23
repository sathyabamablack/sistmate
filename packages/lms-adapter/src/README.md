# @usp/lms-adapter

Adapter for the college **Learning Management System (Moodle)**. Implements the
`LmsAdapter` interface from `@usp/core`, so it is interchangeable with the mock
and selected at runtime by the `DATA_SOURCE` env var.

## Two implementations

| Factory | File | Use |
| --- | --- | --- |
| `createMockLmsAdapter()` | `mock.ts` | Deterministic, offline, realistic sem-5 CSE data. Dev/demo/tests. |
| `createLiveLmsAdapter(opts?)` | `live.ts` | Real Moodle client (skeleton). |

Both return `Promise`-based methods: `authenticate`, `getCourses`,
`getAssignments`, `getCalendar`, `getNotifications`.

## This is the STABLE path

The live adapter talks to Moodle's **documented, versioned web-services REST
API** — the exact API the official Moodle mobile app uses. This matters:

- Unlike the ERP integration (which scrapes HTML and breaks whenever a page is
  restyled), the Moodle REST API is a **published contract**. Field names and
  function signatures are stable across minor releases and documented at
  <https://docs.moodle.org/dev/Web_service_API_functions>.
- Responses are mapped to the canonical `@usp/core` types and validated with the
  shared Zod schemas, so a contract drift fails **loudly** at the boundary
  instead of silently corrupting the dashboard.

Prefer this path over scraping whenever the institution has web services
enabled.

## Getting a token

The live adapter needs a web-service token. Two ways to obtain one:

1. **Programmatic** — `authenticate({ username, password })` POSTs to
   `${baseUrl}/login/token.php` with `service=moodle_mobile_app` and stores the
   returned token on the instance.
2. **Manual (paste a token)** — in Moodle: **Preferences → Security keys**, copy
   the key for the *Moodle mobile web service*, then construct directly:

   ```ts
   const lms = createLiveLmsAdapter({
     baseUrl: "https://lms.sathyabama.ac.in",
     token: "<paste-token-here>",
   });
   ```

## If web services are disabled

Some institutions turn off the external/mobile web service. Then
`/login/token.php` returns an error (e.g. "Web services are not enabled") and
there is **no REST path**. The only fallback is to scrape the authenticated HTML
(cookie session against `/login/index.php`). That fallback is intentionally
**not** implemented here — it is fragile and belongs with the scraping layer,
not on this stable API path. The adapter surfaces the error to the caller.

## Finishing the live skeleton

`live.ts` compiles and is fully typed but makes no network calls yet. To go live:

1. **Wire `httpFetch`** — the single, clearly-marked HTTP touch point. Replace
   its `NotImplementedError` with a real `fetch` (a reference implementation is
   in the method's doc comment).
2. **Confirm `wsfunction` names** are enabled on the target site.
3. **Verify field mappings** — every `// TODO(verify)` in the `map*` functions
   marks a Moodle field name/shape to confirm against a real JSON response
   (names vary by Moodle version and token capabilities).

### Moodle web-service functions used

| Canonical method | Moodle `wsfunction`(s) |
| --- | --- |
| (bootstrap userid) | `core_webservice_get_site_info` |
| `getCourses` | `core_enrol_get_users_courses` |
| `getAssignments` | `mod_assign_get_assignments` + `mod_assign_get_submission_status` |
| `getCalendar` | `core_calendar_get_calendar_upcoming_view` / `core_calendar_get_action_events_by_timesort` |
| `getNotifications` | `message_popup_get_popup_notifications` |

REST shape for every call:

```
${baseUrl}/webservice/rest/server.php?wstoken=<token>&moodlewsrestformat=json&wsfunction=<fn>&<params>
```
