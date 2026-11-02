# Sathyabama Black: on hold (2 Nov 2026)

The feature is paused, not deleted. Nothing links to it and its routes are switched off.

## What was done

- `app/black/` moved to `app/_black/` (a private folder, so Next.js does not route it): the `/black`
  page and its share image.
- `app/api/interest/route.ts` moved to `app/_black/interest/route.ts` (the "I'm interested" counter).
- `e2e/black.spec.ts` renamed to `e2e/black.spec.ts.hold` so Playwright skips it.
- These references were removed:
  - `components/black/BlackNotice` from `app/(app)/notifications/page.tsx`
  - `components/black/BlackStrip` from `app/(app)/page.tsx`
  - `components/black/BlackDot` from the footers in `app/welcome/WelcomeView.tsx` and `components/public/PublicShell.tsx`
  - `components/black/BlackPopup` (lazy-loaded) from `components/layout/AppShell.tsx`
- Untouched: `components/black/*`, `lib/black.ts`, `lib/interest.ts` and their unit tests.

## To bring it back

1. Move the folders back: `app/_black/page.tsx` and `opengraph-image.tsx` to `app/black/`,
   and `app/_black/interest/route.ts` to `app/api/interest/route.ts`.
2. Rename `e2e/black.spec.ts.hold` back to `e2e/black.spec.ts`.
3. Put the five components back where they were (see the list above).
4. Set a new `OPENS_AT` in `lib/black.ts` (it was Fri 30 Oct 2026, 23:00 IST).
5. The counter needs the `KV_REST_API_*` (or `UPSTASH_REDIS_REST_*`) variables, already set on the project.
