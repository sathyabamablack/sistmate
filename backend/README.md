# Mock Sathyabama ERP — local login backend

A **fake**, zero-dependency server that imitates the Sathyabama ERP *login
service* and data API, so you can develop and test the portal's auth flow on
your own machine. It serves **fake data**, never contacts the real portal, and
has **no captcha**.

> ⚠️ Development only. Don't deploy this or treat its tokens as real. It exists
> precisely so you never have to automate the real, Turnstile-gated login.

## Run it

```bash
cd backend
npm start          # http://localhost:8787
# or: npm run dev  # restarts on file changes
```

## Log in and get an access token

```bash
curl -s http://localhost:8787/api/login \
  -H "Content-Type: application/json" \
  -d '{"RegisterNumber":"41110999","Password":"test123"}'
```

Response (shape matches what the app's `erp-adapter` parses):

```json
{
  "status": true,
  "message": "Login successful",
  "responseData": {
    "login": {
      "accessToken": "<HS256 JWT>",
      "StudentId": "145530",
      "RegisterNumber": "41110999",
      "roleName": "Student"
    }
  }
}
```

Then call a data endpoint with the token:

```bash
curl -s http://localhost:8787/erp/api/v1.0/MasterStudent/view \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" -d '{}'
```

`requests.http` has the same flow for the VS Code REST Client / Postman.

## Point the real app at it

The web app reads two env vars (`apps/web/lib/session.ts`). Set both to this
server for local work — e.g. in `apps/web/.env.local`:

```
ERP_AUTH_URL=http://localhost:8787
ERP_BASE_URL=http://localhost:8787
```

`ERP_AUTH_URL` is the login service (`/api/login`); `ERP_BASE_URL` is the data
API (`/erp/api/v1.0/*`). With both pointed here, the app's sign-in and dashboard
run end-to-end with no real portal and no captcha.

## Test logins

Seeded in `students.json` (passwords imitate the real ERP default = date of
birth, `DD-MM-YYYY`):

| Register number | Password     |
|-----------------|--------------|
| `41110999`     | `test123`    |
| `41110999`      | `01-01-2004` |
| `41110567`      | `15-08-2005` |

Add your own by editing `students.json`, or start with `DEV_ALLOW_ANY=1` to
accept any register number + password.

## Config (env vars)

| Var             | Default                      | Purpose                                        |
|-----------------|------------------------------|------------------------------------------------|
| `PORT`          | `8787`                       | Listen port                                    |
| `JWT_SECRET`    | `dev-secret-not-for-production` | HS256 signing key for the fake token        |
| `TOKEN_TTL_SEC` | `3600`                       | Token lifetime — lower it to test expiry       |
| `DEV_ALLOW_ANY` | *(off)*                      | `1` = accept any login, fabricate a student    |

## What this tells us about the project's constraints

This mock mirrors the real contract so we can reason about the limits without
touching the portal:

- **The real login is gated by Cloudflare Turnstile** that a server can't solve.
  That's *why* the architecture uses a separate login service that returns the
  ERP's JWT — and why we never script the real login. The mock simply has no
  captcha.
- **Auth is `RegisterNumber` + `Password`** (the API field is literally `DOB`
  because the default password is the date of birth; students who changed it
  pass the new one). Login returns a **JWT**; every data call carries it as a
  `Bearer` token.
- **Tokens expire.** When a data call gets `401`, the adapter raises
  `SessionExpiredError` and the user must sign in again. Lower `TOKEN_TTL_SEC`
  here to exercise that path.
- **Data endpoints are all `POST`** under `/erp/api/v1.0/`, returning a
  `{ responseData: { data: [...] | StudentInfo: [...] } }` envelope.

Only `MasterStudent/view` is filled out here; other endpoints return a valid
empty envelope. Flesh them out (from `captures/live/*.json`) as you need them.

## Testing against the *real* portal

Keep doing it the safe way: sign in through the real ERP in your own browser and
paste your own session token into the app. Don't put real credentials in code,
config, or chat — if a password ends up somewhere shared, rotate it.
