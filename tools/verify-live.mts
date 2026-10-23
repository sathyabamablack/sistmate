/**
 * Live verification against YOUR OWN ERP + Moodle accounts.
 *
 *   npm run verify:live              sign in, run every section, validate, save captures
 *   npm run verify:live -- --inspect  no sign-in: only inspect the public endpoints
 *   npm run verify:live -- --no-save  don't write captures/
 *
 * Passwords are read from a hidden prompt, used for this run only and never
 * printed or written anywhere. Raw responses go to captures/ (gitignored —
 * it's your personal data) so the mappers can be fitted to the real API.
 */
import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { SessionExpiredError, computeGpa } from "@usp/core";
import { createLiveErpAdapter } from "@usp/erp-adapter";
import { createLiveLmsAdapter } from "@usp/lms-adapter";

const ERP_URL = process.env.ERP_BASE_URL ?? "https://erp.sathyabama.ac.in";
const LMS_URL = process.env.LMS_BASE_URL ?? "https://sathyabama.cognibot.in";
const args = new Set(process.argv.slice(2));
const INSPECT = args.has("--inspect");
const SAVE = !args.has("--no-save");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CAPTURES = path.join(ROOT, "captures");

/* ------------------------------- output -------------------------------- */

const c = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
};
const heading = (s: string) => console.log(`\n${c.bold(s)}`);
const info = (label: string, value: unknown) =>
  console.log(`  ${c.dim(label.padEnd(22))} ${String(value)}`);

interface Row {
  source: "ERP" | "LMS";
  section: string;
  status: "pass" | "warn" | "fail";
  count?: number;
  sample?: string;
  notes: string[];
}
const rows: Row[] = [];

/* ------------------------------- prompts ------------------------------- */

function ask(question: string, { hidden = false } = {}): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const raw = rl as unknown as { _writeToOutput: (s: string) => void };
    let muted = false;
    raw._writeToOutput = (s) => {
      if (!muted) process.stdout.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
    muted = hidden;
  });
}

/* ------------------------------- captures ------------------------------ */

async function save(rel: string, content: string | Buffer): Promise<void> {
  if (!SAVE) return;
  const file = path.join(CAPTURES, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

/** Drop anything credential-like before a response touches disk. */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) =>
        /token|password|sesskey|secret|DOB|dob/i.test(k) ? [k, "[redacted]"] : [k, redact(v)],
      ),
    );
  }
  return value;
}

/* ------------------------------- checks -------------------------------- */

function sampleOf(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  if (first === undefined) return "—";
  const s = JSON.stringify(first);
  return s.length > 110 ? `${s.slice(0, 107)}...` : s;
}

async function check<T>(
  source: Row["source"],
  section: string,
  load: () => Promise<T>,
  validate: (value: T) => string[] = () => [],
): Promise<T | undefined> {
  try {
    const value = await load();
    const notes = validate(value);
    const count = Array.isArray(value) ? value.length : 1;
    if (count === 0) notes.unshift("returned 0 items — check the endpoint or request body");
    rows.push({ source, section, status: notes.length ? "warn" : "pass", count, sample: sampleOf(value), notes });
    return value;
  } catch (err) {
    const message =
      err instanceof SessionExpiredError
        ? "session expired or 401/403 — token may be invalid"
        : err instanceof Error
          ? err.message
          : String(err);
    rows.push({ source, section, status: "fail", notes: [message] });
    return undefined;
  }
}

const near = (a: number, b: number, eps = 0.05) => Math.abs(a - b) <= eps;

/* ------------------------------- inspect ------------------------------- */

async function inspectErp(): Promise<void> {
  heading(`ERP public check — ${ERP_URL}`);
  try {
    const res = await fetch(ERP_URL, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
    const html = await res.text();
    await save("erp/index.html", html);
    info("final URL", res.url);
    info("HTTP status", res.status);
    info("title", /<title[^>]*>([^<]*)/i.exec(html)?.[1]?.trim() ?? "—");

    const isAngular = /ng-version|angular/i.test(html);
    info("Angular SPA", isAngular ? c.green("yes") : "no");

    const scriptMatch = html.match(/src="([^"]*main\.[^"]+\.js)"/);
    info("main bundle", scriptMatch?.[1] ?? "not found");

    const turnstile = /turnstile|challenges\.cloudflare/i.test(html);
    info("Cloudflare Turnstile", turnstile ? c.yellow("detected") : "no");

    const apiBase = `${ERP_URL}/erp/api/v1.0/`;
    info("API base", apiBase);

    // Probe the API base to see if it responds
    try {
      const apiRes = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json", skip: "true" },
        body: "{}",
        signal: AbortSignal.timeout(10_000),
      });
      info("API probe status", apiRes.status);
    } catch (e) {
      info("API probe", c.yellow(e instanceof Error ? e.message : "failed"));
    }

    console.log(
      isAngular
        ? `  ${c.green("✓ Angular SPA confirmed — REST API adapter should work.")}`
        : `  ${c.yellow("! Not an Angular SPA? The REST API adapter may not work here.")}`,
    );
  } catch (err) {
    console.log(`  ${c.red("failed:")} ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function inspectLms(): Promise<void> {
  heading(`Moodle public config — ${LMS_URL}`);
  try {
    const res = await fetch(`${LMS_URL}/lib/ajax/service-nologin.php?info=tool_mobile_get_public_config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ index: 0, methodname: "tool_mobile_get_public_config", args: {} }]),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json()) as [{ error: boolean; data?: Record<string, unknown>; exception?: { message?: string } }];
    const data = body[0]?.data;
    if (!data) {
      console.log(`  ${c.red("no public config:")} ${body[0]?.exception?.message ?? JSON.stringify(body).slice(0, 200)}`);
      return;
    }
    await save("lms/public-config.json", JSON.stringify(redact(data), null, 2));
    const loginType = { 1: "in-app (username + password)", 2: "browser SSO", 3: "embedded browser SSO" }[
      Number(data.typeoflogin)
    ];
    info("site", data.sitename);
    info("Moodle release", data.release ?? "—");
    info("web services", data.enablewebservices ? c.green("enabled") : c.red("disabled"));
    info("mobile service", data.enablemobilewebservice ? c.green("enabled") : c.red("disabled"));
    info("login type", loginType ?? data.typeoflogin);
    const works = data.enablewebservices && data.enablemobilewebservice && Number(data.typeoflogin) === 1;
    console.log(
      works
        ? `  ${c.green("✓ The LMS adapter's token sign-in should work on this site.")}`
        : `  ${c.yellow("! Token sign-in with a password won't work here — the HTML fallback is needed.")}`,
    );
  } catch (err) {
    console.log(`  ${c.red("failed:")} ${err instanceof Error ? err.message : String(err)}`);
  }
}

/* ---------------------------- full live run ---------------------------- */

async function verifyErp(username: string): Promise<void> {
  heading("ERP — signing in (REST API)");
  let current = "login";

  const password = await ask("  ERP password/DOB (hidden): ", { hidden: true });
  if (!password) {
    rows.push({ source: "ERP", section: "sign-in", status: "warn", notes: ["skipped (no password entered)"] });
    return;
  }

  const erp = createLiveErpAdapter({
    baseUrl: ERP_URL,
    onResponse: ({ url, response }) => void save(`erp/${current}.json`, JSON.stringify(redact(response), null, 2)),
  });

  current = "login-response";
  const auth = await erp.authenticate({ username, password });
  if (!auth.ok || !auth.session) {
    rows.push({ source: "ERP", section: "sign-in", status: "fail", notes: [auth.error ?? "rejected"] });
    console.log(`  ${c.red("✗")} ${auth.error ?? "Sign-in rejected."}`);
    return;
  }
  rows.push({ source: "ERP", section: "sign-in", status: "pass", notes: [] });
  console.log(`  ${c.green("✓ signed in")} — fetching every section…`);

  const live = createLiveErpAdapter({
    baseUrl: ERP_URL,
    session: auth.session,
    onResponse: ({ url, response }) => void save(`erp/${current}.json`, JSON.stringify(redact(response), null, 2)),
  });
  const step = <T,>(name: string, load: () => Promise<T>, validate?: (v: T) => string[]) => {
    current = name;
    return check("ERP", name, load, validate);
  };

  await step("profile", () => live.getProfile(), (p) =>
    p.registerNumber === username ? [] : [`register number in response (${p.registerNumber}) ≠ login (${username})`],
  );
  await step("attendance", () => live.getAttendance(), (subjects) =>
    subjects.flatMap((s) => [
      ...(s.attended > s.totalClasses ? [`${s.code}: attended ${s.attended} > total ${s.totalClasses}`] : []),
      ...(s.totalClasses > 0 && !near(s.percentage, (s.attended / s.totalClasses) * 100, 0.6)
        ? [`${s.code}: says ${s.percentage}% but ${s.attended}/${s.totalClasses} = ${((s.attended / s.totalClasses) * 100).toFixed(2)}%`]
        : []),
    ]),
  );
  await step("marks", () => live.getMarks(), (subjects) =>
    subjects.flatMap((s) =>
      s.components
        .filter((m) => m.scored !== null && m.scored > m.max)
        .map((m) => `${s.code} ${m.name}: ${m.scored} > max ${m.max}`),
    ),
  );
  await step("results", () => live.getResults(), (sems) =>
    sems.flatMap((sem) => {
      const graded = sem.results.filter((r) => r.gradePoint > 0);
      const gpa = computeGpa(graded);
      return graded.length && !near(gpa, sem.gpa, 0.02)
        ? [`semester ${sem.semester}: API GPA ${sem.gpa}, recomputed ${gpa.toFixed(2)}`]
        : [];
    }),
  );
  await step("timetable", () => live.getTimetable(), (slots) =>
    slots.filter((s) => s.startTime >= s.endTime).map((s) => `${s.courseCode} day ${s.day}: ${s.startTime}–${s.endTime}`),
  );
  await step("fees", () => live.getFees());
  await step("notifications", () => live.getNotifications(), (notes) =>
    notes.filter((n) => Number.isNaN(Date.parse(n.date))).map((n) => `unparsed date on "${n.title}"`),
  );
}

async function verifyLms(username: string): Promise<void> {
  heading("LMS (Moodle) — signing in");
  const password = await ask("  LMS password (hidden, Enter to skip the LMS): ", { hidden: true });
  if (!password) {
    rows.push({ source: "LMS", section: "sign-in", status: "warn", notes: ["skipped (no password entered)"] });
    return;
  }
  const counts = new Map<string, number>();
  const onResponse = (fn: string, json: unknown) => {
    const n = (counts.get(fn) ?? 0) + 1;
    counts.set(fn, n);
    void save(`lms/ws/${fn}${n > 1 ? `.${n}` : ""}.json`, JSON.stringify(redact(json), null, 2));
  };
  const auth = await createLiveLmsAdapter({ baseUrl: LMS_URL, onResponse })
    .authenticate({ username, password })
    .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e), session: undefined }));
  if (!auth.ok || !auth.session) {
    rows.push({ source: "LMS", section: "sign-in", status: "fail", notes: [auth.error ?? "rejected"] });
    return;
  }
  rows.push({ source: "LMS", section: "sign-in", status: "pass", notes: [] });

  const lms = createLiveLmsAdapter({ baseUrl: LMS_URL, token: auth.session, onResponse });
  await check("LMS", "courses", () => lms.getCourses());
  await check("LMS", "assignments", () => lms.getAssignments(), (list) =>
    list.filter((a) => a.dueDate && Number.isNaN(Date.parse(a.dueDate))).map((a) => `bad due date on "${a.name}"`),
  );
  await check("LMS", "calendar", () => lms.getCalendar());
  await check("LMS", "notifications", () => lms.getNotifications());
}

/* -------------------------------- main --------------------------------- */

function report(): void {
  heading("Results");
  for (const r of rows) {
    const mark = r.status === "pass" ? c.green("✓") : r.status === "warn" ? c.yellow("!") : c.red("✗");
    const count = r.count === undefined ? "" : c.dim(` ${r.count} item${r.count === 1 ? "" : "s"}`);
    console.log(`  ${mark} ${r.source} ${r.section}${count}`);
    if (r.sample && r.status !== "fail") console.log(`      ${c.dim(r.sample)}`);
    for (const n of r.notes) console.log(`      ${r.status === "fail" ? c.red(n) : c.yellow(n)}`);
  }
  const failed = rows.filter((r) => r.status === "fail").length;
  const warned = rows.filter((r) => r.status === "warn").length;
  console.log(
    `\n  ${rows.length - failed - warned} passed, ${warned} warnings, ${failed} failed.` +
      (SAVE ? c.dim(`  Raw responses saved to ${path.relative(process.cwd(), CAPTURES) || "captures"}/ (gitignored, your personal data).`) : ""),
  );
  process.exitCode = failed ? 1 : 0;
}

async function main(): Promise<void> {
  console.log(c.bold("Unified Student Portal — live verification"));
  console.log(c.dim(`  ERP ${ERP_URL}\n  LMS ${LMS_URL}`));

  await inspectErp();
  await inspectLms();
  if (INSPECT) return;

  if (!process.stdin.isTTY) {
    console.log(c.red("\nRun this in an interactive terminal — it needs to prompt for your passwords."));
    process.exitCode = 1;
    return;
  }
  const username = await ask("\nRegister number: ");
  if (!username) return;

  await verifyErp(username).catch((e: unknown) =>
    rows.push({ source: "ERP", section: "run", status: "fail", notes: [e instanceof Error ? e.message : String(e)] }),
  );
  await verifyLms(username).catch((e: unknown) =>
    rows.push({ source: "LMS", section: "run", status: "fail", notes: [e instanceof Error ? e.message : String(e)] }),
  );
  report();
}

await main();
