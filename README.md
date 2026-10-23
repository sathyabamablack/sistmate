# Unified Student Portal

One fast, modern dashboard over a Sathyabama student's **own** ERP and LMS data.

> Personal-use project: it reads only what you can already see when you log in yourself,
> using your own account. Your password is never stored, and the ERP's captcha / security
> check (Cloudflare Turnstile) is never touched by this app: you sign in on the real ERP site.

## Features

The ERP and the LMS are separate sites with separate logins. This app puts both behind one
sign-in and adds what the raw data doesn't give you:

| Area | What you get |
|---|---|
| Attendance | **Bunk calculator** per subject: "can skip 8", "attend the next 4 in a row" |
| Next class | "Tomorrow, Mon 9:00, Computer Networks, 87%, can skip 8" from timetable and attendance |
| Results | CGPA estimate, best/latest GPA and a **planner** for a target grade or CGPA |
| Deadlines | One de-duplicated timeline: LMS assignments, exams and ERP fee due dates |
| Notifications | ERP circulars + LMS notifications in one searchable feed |
| Devices | Phone-first, light + dark, installable (PWA), command palette |
| Resilience | Each section loads on its own; a failure or a slow portal shows a note while everything else works, and the last good copy is shown if the ERP is down |

## Put it online

Free, no coding, about 10 minutes: **[docs/DEPLOY.md](docs/DEPLOY.md)** (Vercel one-click: fork,
deploy, set four variables, open `/setup`). After deploying, `/setup` tells you in plain words
whether everything is configured, and what to change if not.

Note the honest limits in that guide: the college may block cloud servers (then run it on your own
PC with `npm run build && npm start`), the cache and sign-in rate limit are per server instance.

## Structure

```
apps/web/               Next.js 16 (App Router) + Tailwind 4: UI and server-side data proxy
packages/core/          Canonical types (Zod), adapter interfaces, attendance/GPA maths
packages/erp-adapter/   ERP: mock + live REST API client, tests
packages/lms-adapter/   LMS (the college's Moodle site): mock + live adapter (official web-services API), tests
packages/cache/         Two-tier cache (memory + JSON files): stale-while-error, de-duplication
tools/                  ERP connector browser extension, live verification script
docs/DEPLOY.md          Deploy your own copy (Vercel, or self-host)
docs/CAPTURE-GUIDE.md   Recording real ERP responses (ERP_CAPTURE / ERP_REPLAY)
```

## How data flows

```
ERP REST API ─► live adapter ─┐
LMS web services ─► mappers ───┼─► per-section Zod validation ─► per-user cache ─► UI
mock data (dates shifted to today) ┘
```

`DATA_SOURCE=mock` uses realistic sample data (any login works). `DATA_SOURCE=live` uses your
real ERP and LMS. The ERP session token comes from your own browser after you sign in on the
ERP site; the portal never sees your ERP password.

## Security model

- Sessions are **iron-session** cookies (AES-256-GCM, httpOnly, SameSite=Lax, 8 h). They hold only
  the ERP session token and LMS token, never a password. `Secure` follows how the browser
  reached the app (`x-forwarded-proto`), so plain-http LAN use works too.
- An expired ERP token (its `exp` claim) is noticed immediately and sends you to reconnect.
- Cache keys are scoped per user (hashed register number); sign-out clears them.
- Origin checks on every POST, sign-out URL only acts for same-site requests, best-effort per-instance
  login throttling, strict CSP and security headers.
- The service worker never stores pages, API responses or personal data.

## Develop

Needs Node 20.9 or newer (`.nvmrc` says 20).

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # set SESSION_SECRET; use DATA_SOURCE=mock for sample data
npm run dev                                     # http://localhost:3000 (any login works in mock mode)
```

```bash
npm test             # unit tests in every package
npm run typecheck
npm run lint
npm run build
npm run test:e2e --workspace apps/web   # browser tests against a production build (mock data)
```

Useful environment switches (all in `apps/web/.env.example`): `DATA_SOURCE`, `SESSION_SECRET`,
`ERP_BASE_URL`, `LMS_BASE_URL`, and for development only `ERP_CAPTURE=1` / `ERP_REPLAY=1`
([docs/CAPTURE-GUIDE.md](docs/CAPTURE-GUIDE.md)).

Health: `GET /api/health` (JSON, no sign-in, no secrets; `?deep=1` also tests reaching the ERP
and LMS) and the human-readable `/setup` page.
