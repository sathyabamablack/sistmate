# Capture guide: record real ERP responses to build and test against

The live ERP adapter talks to the same JSON API as the ERP's own website. When a section looks
wrong, or you want to build a new one, you record the real
responses once, with secrets removed, and then work from the recording instead of the live site.

`captures/` is gitignored because it holds your personal data. Never commit it, never paste it
into a chat or an issue before reading it through.

> The ERP's sign-in is protected by Cloudflare Turnstile. Nothing here, and nothing in this
> project, solves, replays or skips that check. You always sign in yourself on the real ERP
> site; captures only record what the ERP returns after that.

## 1. Record everything the app already reads: `ERP_CAPTURE=1`

On your own machine (not on Vercel; it is switched off there):

```bash
# apps/web/.env.local
DATA_SOURCE=live
ERP_BASE_URL=https://erp.sathyabama.ac.in
```

```bash
ERP_CAPTURE=1 npm run dev        # PowerShell: $env:ERP_CAPTURE=1; npm run dev
```

Sign in as usual (connect your ERP session) and open the dashboard. For every ERP call the app makes,
one file appears in `captures/live/`, named after the endpoint:

```
captures/live/MasterStudent__view.json
captures/live/StudentAttendanceHourly__getStudentAcademicHourwise.json
captures/live/ResultMark__studentResult.json
...
```

Before writing, the app removes fields that look like secrets: anything named `token`,
`accessToken`, `password`, `otp`, `dob`, `aadhar` / `aadhaar` or ending in `pan`. It does not remove
names, phone numbers or marks, so **read each file before sharing it** and delete what you do not
want to show.

## 2. Work from the recording: `ERP_REPLAY=1`

```bash
ERP_REPLAY=1 npm run dev
```

With replay on, ERP calls are answered from `captures/live/` instead of the network, so you can
change the screens and the field mapping against real response shapes with no live session. A call
with no recording answers "No Records Found", like an empty section.

You still need to be signed in (the app only asks the ERP once per section, but it still wants a
session). Do that once with a real connection, then replay as often as you like. Replay is
switched off on Vercel.

The parsers' automated tests use the small, made-up files in `packages/erp-adapter/fixtures/` and
`packages/lms-adapter/fixtures/`. When you find a real shape the tests do not cover, copy a
**cleaned** capture there (names and numbers replaced), then add a test.

```bash
npm test --workspace packages/erp-adapter
npm test --workspace packages/lms-adapter
```

## 3. Day-wise and hour-wise attendance: help tighten the parsers

The Attendance page now reads two more ERP endpoints, so `ERP_CAPTURE=1` records them like any
other section once you open the dashboard or the Attendance page:

```
captures/live/StudentDailyAttendance__StudentWiseAttendance.json
captures/live/StudentAttendanceHourly__generateStudentwiseReport.json
```

- **`StudentWiseAttendance`** (day-wise): the app asks for the current month up to today (or, from
  the Attendance page's period dropdown, last month, the past 3 months or the semester; ranges are
  trimmed to the ERP's academic window, since the ERP has no day-wise records outside it). It
  expects `responseData` to hold `AttendanceDetails` (your absent days, `AttendanceDate` as
  `DD/MM/YYYY`), `HolidayList` (`HoliDay`, `Comments`), `TimetableDetails` (`TimeSetDays`,
  `AcademicMonthStartDate`, `AcademicMonthEndDate`) and `ActualWorkingDays` (`Date`).
- **`generateStudentwiseReport`** (hour-wise): the app asks for the last 14 days (longer periods
  from the dropdown are asked 31 days at a time, at most 4 requests). Each row has
  `AttendanceDate`, `totalHours`, `Present`, `Absent` and `AttNotGiven`. We do not know yet whether
  `Present` / `Absent` / `AttNotGiven` are counts (`4`) or lists of hour numbers (`"1,2,4"`); the
  parser accepts both. A real capture settles it, and if they are lists the app can show which
  subject each hour was.

These two files are the most useful captures to share right now. Clean them first (script below:
it keeps dates and hour numbers, which is all the parsers need), read them, then add them as
fixtures next to the made-up ones in `packages/erp-adapter/test/fixtures/` and run
`npm test --workspace packages/erp-adapter`.

If you prefer to record them from the ERP website itself (for example the hour-wise report page):

1. Sign in to the ERP in your browser as usual and open the page that shows the report.
2. Press `F12`, open the **Network** tab, tick **Preserve log**, then reload that page.
3. In the list, find the request whose name ends with `StudentWiseAttendance` or
   `generateStudentwiseReport`. Click it.
4. **Response** tab: copy everything and save it under the file name above.
5. **Payload** (or **Request**) tab: copy the JSON body that was sent and save it next to it with
   `.request.json` at the end. Do **not** copy the headers: the `Authorization: Bearer ...` header
   is your login.
6. Clean both files with the script below, then read them.

```js
// strip.mjs  -  usage: node strip.mjs input.json output.json
import { readFileSync, writeFileSync } from "node:fs";

const SECRET = /token|password|otp|dob|aadhaar|aadhar|pan$|authorization|cookie/i;
const PERSONAL = /name$|^name|phone|mobile|email|address|photo|image|parent|guardian/i;

function clean(value, key = "") {
  if (Array.isArray(value)) return value.map((v) => clean(v, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !SECRET.test(k))
        .map(([k, v]) => [k, PERSONAL.test(k) && typeof v === "string" ? "REDACTED" : clean(v, k)]),
    );
  }
  // Long digit runs (register numbers, ids, phone numbers) are replaced with zeros.
  return typeof value === "string" ? value.replace(/\d{8,}/g, (m) => "0".repeat(m.length)) : value;
}

const [input, output] = process.argv.slice(2);
writeFileSync(output, JSON.stringify(clean(JSON.parse(readFileSync(input, "utf8"))), null, 2));
```

Keep subject codes and names, dates, hours and present/absent flags: those are what the mapping
needs. Put the cleaned files in `captures/live/` for your own use. To share them for development,
open the cleaned files one more time and check them by eye first.

## 4. If a section stops working later

1. Open the app, look at the banner: it names the section that failed.
2. Run the app with `ERP_CAPTURE=1` once and open that page; compare the new file in
   `captures/live/` with the previous one. A renamed or moved field is the usual cause.
3. Fix the mapping in `packages/erp-adapter/src/live.ts`, then add the cleaned capture as a test fixture.

## LMS

The LMS (the college's Moodle site) uses its official web-service API and needs no captures: the app
signs in with your LMS username and password once, keeps only the web-service token, and reads documented JSON. If your
LMS has the mobile web service switched off, sign-in fails with "web services are off"; only the
college can turn that on. `npm run verify:live` signs in to both with your own accounts (hidden
password prompt) and saves raw responses to `captures/` so mappings can be checked.
