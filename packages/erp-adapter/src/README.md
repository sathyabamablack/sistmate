# @usp/erp-adapter

Turns Sathyabama University ERP data into the project's canonical types
(`@usp/core`). Two interchangeable implementations of the `ErpAdapter`
interface; the UI only ever sees the interface.

```ts
import { createMockErpAdapter, createLiveErpAdapter } from "@usp/erp-adapter";

const erp =
  process.env.DATA_SOURCE === "live"
    ? createLiveErpAdapter({ baseUrl: "https://erp.sathyabama.ac.in" })
    : createMockErpAdapter();

await erp.authenticate({ username, password });
const profile = await erp.getProfile();
```

## Mock vs Live

| | `createMockErpAdapter()` | `createLiveErpAdapter(opts?)` |
|---|---|---|
| Source | hand-crafted sample data (`src/mock.ts`) | real ERP scraper skeleton (`src/live.ts`) |
| Network | none | real HTTP (once wired) |
| Credentials | any non-empty pair "succeeds" | real login form |
| Use for | local dev, demos, tests, UI work | production, bring-your-own-credentials |

The mock is **internally consistent**: the same sem-5 course codes thread
through attendance, marks and the timetable; semester GPAs are computed with
`computeGpa` from `@usp/core`; and attendance deliberately spans safe (>75%),
borderline (~75-76%) and below-threshold so the bunk calculator has data to
show.

## Wiring the live adapter from captures

The live adapter is a **skeleton** — it models the real flow but throws
`NotImplementedError` everywhere a real selector/endpoint is still unknown.
To finish it:

1. **Capture pages.** Log into the real ERP in a browser, and save each page
   (HTML only) into `captures/erp/` using the filenames in the `src/live.ts`
   TODOs (`login.html`, `profile.html`, `attendance.html`, `marks.html`,
   `results.html`, `timetable.html`, `fees.html`, `notifications.html`).
   See `docs/CAPTURE-GUIDE.md`.
2. **Auth.** In `authenticate()`, wire: GET login page -> scrape hidden
   anti-forgery token (`__VIEWSTATE` / CSRF) -> POST credentials -> detect
   success. Watch for a CAPTCHA / OTP blocker (noted in the code comments).
   Store cookies in the in-memory `CookieJar` on the instance.
3. **Fetch.** Implement `fetchHtml()` to do the authenticated `fetch` with the
   cookie jar (sample code is in the method's doc comment).
4. **Parse.** For each `parseXxx(html)` helper, load the matching capture with
   cheerio, read the stable selectors, build the canonical object, and finish
   with the matching Zod schema's `.parse(obj)` so a page change throws loudly
   instead of silently rendering garbage.

Search for `// TODO(capture):` markers to find every spot that needs work.
