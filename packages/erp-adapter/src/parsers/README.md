# ERP parsers

Pure functions that turn ERP HTML into the canonical `@usp/core` types:

| Page | Function | Returns |
| --- | --- | --- |
| Login | `parseLoginForm(html)` / `detectLoginFailure(html)` / `isLoginPage(html)` | form action, method, every hidden field, user/pass/captcha inputs |
| Profile | `parseProfile(html, { baseUrl })` | `StudentProfile` |
| Attendance | `parseAttendance(html)` | `AttendanceSubject[]` |
| Internal marks | `parseMarks(html)` | `SubjectMarks[]` |
| Results | `parseResults(html)` | `SemesterResult[]` |
| Timetable | `parseTimetable(html)` | `TimetableSlot[]` |
| Fees | `parseFees(html)` | `FeeRecord[]` |
| Notices | `parseNotifications(html, { baseUrl })` | `Notification[]` |

Every parser validates its output with the matching Zod schema. If a page
doesn't look as expected it throws `ParseError` (`err.page`, `err.reason`)
instead of returning wrong data. The message lists the header rows it saw,
which tells you what alias to add.

## How it's organised

- **`selectors.ts`** holds everything that is specific to a page: container
  CSS selectors, **header aliases** for each table column, profile label
  aliases, grade points, timetable cell patterns. **This is the only file you
  should need to edit.**
- `table.ts` has generic helpers. It finds a table by matching its header
  row against aliases (not by column position), expands rowspan/colspan, and
  normalises values (`toNumber`, `toIsoDate`, `parseTimeRange`, `dayIndex`…).
- One file per page (`attendance.ts`, `marks.ts`, …), each exporting a single
  pure function.

The fixtures in `../../fixtures/*.html` are **synthetic**. They imitate a
typical ASP.NET WebForms ERP and use the same fictional student and course
codes as `mock.ts`.

## Switching to the real portal

1. **Save the real pages.** Log in to the ERP in a browser, open each page,
   and save it with *Save page as → Web page, HTML only* (or copy
   `document.documentElement.outerHTML` from DevTools). Put the files in
   `captures/erp/` using the fixture names: `login.html`, `profile.html`,
   `attendance.html`, `marks.html`, `results.html`, `timetable.html`,
   `fees.html`, `notifications.html`.
   > These contain your personal data. Keep `captures/` out of git (it is
   > already in `.gitignore`; check before committing).
2. **Run the tests against them:**
   ```bash
   ERP_FIXTURES_DIR=../../captures/erp npx vitest run test/parsers.test.ts
   ```
   (`ERP_FIXTURES_DIR` is resolved from the `packages/erp-adapter` folder.)
3. **Read the failures.** A `ParseError` like
   `[erp:attendance] no table matched headers code + (total & attended) … Header rows seen: [S.No | Sub Code | Hrs Conducted | …]`
   tells you exactly which header text is missing.
4. **Edit `selectors.ts` until the tests pass:**
   - add the real header text to the right `columns` alias list (matching
     ignores case, whitespace and punctuation, and also tries the text with
     any `(...)` part removed);
   - set `container` to the real table/panel id (e.g.
     `#ctl00_ContentPlaceHolder1_GridView1`) if several tables look alike;
   - for the profile, add label aliases or set `profile.valueSelectors`
     (e.g. `{ registerNumber: "#ContentPlaceHolder1_lblRegNo" }`);
   - for the timetable, adjust `courseCodePattern`, `skipCellTokens`,
     `assumePmBelowHour` (header times written like `01.30` with no AM/PM),
     and `dayAliases` if the grid uses day orders (`{ "day 1": 0, … }`).
5. Exact-value assertions in the tests describe the synthetic student. Once
   the structural checks pass on your captures, either copy your captures
   over the fixtures and update the expected values, or keep the synthetic
   fixtures and add a separate `real-pages.test.ts`.

If the real page has a layout no alias can describe (for example marks
with a two-row header where each component spans "Max | Obtained"), change
the page parser. That should be rare, and nothing outside `src/parsers/`
should need to change.

## Login notes

- Post back **every** field in `form.fields`. ASP.NET rejects the POST
  without `__VIEWSTATE`, `__EVENTVALIDATION` and the others.
- Include `form.submit` (`btnLogin=Login`). WebForms only runs the click
  handler when the button's name/value is in the POST.
- If `hasCaptcha` is true, the live adapter cannot log in unattended. It
  must show `captchaImageUrl` to the student, using the same cookie jar.
- After the POST, `detectLoginFailure(html)` returns the portal's error
  text, for example "Invalid Username or Password". `isLoginPage(html)`
  returning true on a data page means the session expired.
