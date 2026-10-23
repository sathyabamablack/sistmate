# Put your own copy online (free, about 10 minutes)

This guide is for the person setting up the site, not for students using it. No coding is
needed: you fork the project, press a button, and fill in four settings.

**What you get:** your own web address, such as `https://my-portal.vercel.app`, where you (and
friends you share it with) can open the dashboard on a phone or computer. Each person signs in
with their own college account and only ever sees their own data. Nothing is stored in a database.

## The short version

1. **Fork** this repository on GitHub (the Fork button, top right). Keep it **private** if you
   like; Vercel can still use it.
2. Press **Deploy** (the button below), pick your fork, and fill in the four settings.
3. Open `https://<your-site>/setup`. Every line should be green.
4. Open the site on your phone and **install** it (Add to Home Screen).
5. **Connect your ERP** from the "Get started" steps on the welcome page.

### The Deploy button

> The project has no public repository address yet, so the link below contains a placeholder.
> Replace `<YOUR_REPO_URL>` with the web address of **your fork** (for example
> `https://github.com/your-name/unified-student-portal`) and keep the rest as it is.

```
https://vercel.com/new/clone?repository-url=<YOUR_REPO_URL>&root-directory=apps/web&env=SESSION_SECRET,DATA_SOURCE,ERP_BASE_URL,LMS_BASE_URL&envDescription=SESSION_SECRET%20is%20a%20long%20random%20password.%20DATA_SOURCE%20is%20live.%20The%20two%20addresses%20are%20your%20college%20ERP%20and%20LMS.&envLink=<YOUR_REPO_URL>%2Fblob%2Fmain%2Fdocs%2FDEPLOY.md
```

Once you have filled it in, you can put it in your fork's README as a button:

```markdown
[![Deploy with Vercel](https://vercel.com/button)](PASTE-THE-LINK-ABOVE-HERE)
```

Prefer clicking through? Go to <https://vercel.com/new>, import your fork, and set
**Root Directory** to `apps/web`. Leave everything else on its default. Vercel finds the
workspace and installs from the repository root.

## The four settings

Vercel asks for these when you deploy (and you can change them later under
**Project, Settings, Environment Variables**; after any change press **Redeploy**).

| Name | What to put | Why |
|------|-------------|-----|
| `SESSION_SECRET` | A long random password (below) | Locks the sign-in cookie so nobody can forge it |
| `DATA_SOURCE` | `live` | Use your real ERP. `mock` shows sample data and accepts any login (good for a demo) |
| `ERP_BASE_URL` | `https://erp.sathyabama.ac.in` | Your college ERP address, with no extra path |
| `LMS_BASE_URL` | `https://sathyabama.cognibot.in` | Your college LMS address (its Moodle site). Optional; leave it out to switch the LMS off |

**Making a `SESSION_SECRET`.** On any computer with Node installed, run:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Copy the line it prints into the `SESSION_SECRET` box. Keep it private. If you ever change it, everyone is signed out,
which is also how you sign everyone out in an emergency. No Node on that computer? Any password
manager's "generate a 40 character password" works just as well. It only needs to be at least 32 characters.

## Check your setup: the /setup page

Open `https://<your-site>/setup`. It lists each requirement with a green, amber or red mark and
says exactly what to change if something is not right. It never shows your keys or addresses.

- **Green:** done.
- **Amber:** it works, but look at the note. For example, you are still in demo (`mock`) mode.
- **Red:** fix this first. A missing or short `SESSION_SECRET` is the usual one: nobody can sign in until it is set.

Press **Also test the connection to my college** to make the server try to reach your ERP and
LMS. The same facts, for monitors and scripts, are at `/api/health` (add `?deep=1` for the
connection test). `/api/health` answers 200 when ready and 503 when something is red.

## Using it

- **Install it.** In Chrome (Android) or Edge: menu, Install app. In Safari (iPhone): Share, Add to Home Screen.
- **Connect your ERP.** The ERP's own sign-in page is protected by a security check
  (Cloudflare Turnstile) that only a person in a real browser can pass, and this project never
  tries to get around it. You sign in on the real ERP site as usual; your browser then hands
  your session to the portal. On a computer that uses the small connector extension, on a phone
  the "Connect from your phone" steps. Both are explained step by step on the welcome page.
- **Sessions end.** The ERP ends your session after a while. When that happens you are sent back to
  connect again; that is normal, not a fault.

## Honest limits

Read these before you share the link around.

- **Vercel Hobby is for personal, non-commercial use.** Fine for you and a few classmates. If it
  becomes a service for the whole college, you need a paid plan or your own server.
- **The college may block cloud servers.** Your browser talks to the ERP when you sign in, but the
  portal's server then fetches your data from the ERP. Some college sites block traffic from
  data centers (you will see "refused a request from this server", HTTP 403 or empty sections).
  Vercel uses fixed regions (`bom1`, Mumbai, is set in `apps/web/vercel.json`), which helps for Indian
  sites but is not a guarantee. If it is blocked, run the app on your own PC or a small server
  (see Self-hosting below).
- **The cache is per server instance.** Recent data is kept in memory and in the temp folder for
  3 minutes so reloads are fast and the ERP is not hammered. On Vercel each running instance has its
  own copy, and a cold start begins empty. If the ERP is down, the app can show the last copy it
  still has (marked "Showing data saved at ...") only if the same instance saw it earlier.
- **The sign-in rate limit is best effort.** It stops you locking your own college account with
  repeated mistakes. It is counted per instance, so it is not protection against a determined attacker.
- **No uptime promise.** If the ERP or LMS changes how it works, sections can break until the
  code is updated. Broken sections show a message while the rest of the app keeps working.
- **Your data stays with you.** Nothing is stored in a database. Passwords are never saved; the
  ERP session lives in an encrypted cookie in your own browser.

## Self-hosting (home PC or a small VPS)

Use this if the college blocks Vercel, or you simply prefer it. You need Node 20.9 or newer
(the repository's `.nvmrc` says `20`).

```bash
git clone <YOUR_REPO_URL>
cd unified-student-portal
npm install
cp apps/web/.env.example apps/web/.env.local   # then edit it: set SESSION_SECRET (see above)
npm run build
npm start                                      # http://localhost:3000
```

- To reach it from your phone on the same Wi-Fi, open `http://<your-PC-address>:3000`. Sign-in
  works over plain `http` on your own network. Installing it as an app needs `https`
  (and phone browsers can be stricter about other features too), so for that put it behind a free tunnel or proxy (for example Cloudflare Tunnel or
  Tailscale Funnel). A proxy must forward the `x-forwarded-proto` header.
- Your home internet address is usually accepted by the college where a data center is not.
- Open `http://localhost:3000/setup` to check the settings.

## Maintaining it

- **Updating:** pull new changes into your fork and Vercel redeploys on its own. The installed app
  updates itself the next time it is opened (the service worker is versioned per deploy).
- **Checks:** `.github/workflows/ci.yml` runs type checks, unit tests, lint, a build, a health check and the
  browser tests on every push. `.github/dependabot.yml` proposes dependency updates weekly.
- **Environment variables on your machine** are listed, with defaults, in `apps/web/.env.example`.

## Known advisory

`npm audit` reports a high-severity advisory in `braces`, pulled in only by
`eslint-config-next`'s glob matcher at lint time. No fixed version exists and it never ships in
the app bundle; the production dependency audit (`npm audit --omit=dev`) is checked in CI as
information only.
