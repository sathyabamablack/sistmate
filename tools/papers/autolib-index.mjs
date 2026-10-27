#!/usr/bin/env node
/**
 * Indexes the Sathyabama library's question bank (AutoLib "Question Bank" search) into a JSONL file.
 * Only the listing is read here; the files themselves stay on the library server and the papers
 * Worker relays them on demand (workers/papers, source "autolib").
 *
 *   node tools/papers/autolib-index.mjs [--out X:/DevCache/papers-raw/autolib/index.jsonl] [--concurrency 4]
 *
 * Login: AUTOLIB_USER / AUTOLIB_PASSWORD from X:/DevCache/autolib.env (the library's public OPAC guest
 * account). The server is old and shared by every student, so requests are few at a time with a
 * pause, retried on errors, and the run resumes from the pages already saved.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const BASE = "http://59.145.65.67:8080";
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const OUT = arg("out", "X:/DevCache/papers-raw/autolib/index.jsonl");
const CONCURRENCY = Number(arg("concurrency", "4"));
const PAUSE_MS = 250;

const env = Object.fromEntries(
  readFileSync(arg("env", "X:/DevCache/autolib.env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

let cookie = "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function get(path, attempt = 1) {
  try {
    const res = await fetch(BASE + path, {
      redirect: "manual",
      headers: { Cookie: cookie, "User-Agent": "SISTmate question paper index (sistmate.vercel.app)" },
      signal: AbortSignal.timeout(60_000),
    });
    for (const c of res.headers.getSetCookie()) {
      const pair = c.split(";")[0];
      const name = pair.split("=")[0];
      cookie = [...cookie.split("; ").filter((x) => x && !x.startsWith(`${name}=`)), pair].join("; ");
    }
    const body = Buffer.from(await res.arrayBuffer()).toString("latin1");
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
    return { status: res.status, location: res.headers.get("location"), body };
  } catch (err) {
    if (attempt >= 5) throw err;
    await sleep(1000 * 2 ** attempt);
    return get(path, attempt + 1);
  }
}

export async function login() {
  cookie = "";
  await get("/AutoLib/index.jsp");
  let r = await get(
    `/AutoLib/Login?${new URLSearchParams({ txtuserid: env.AUTOLIB_USER, txtpasword: env.AUTOLIB_PASSWORD, flag: "login", libSubmit: "Login" })}`,
  );
  for (let i = 0; i < 5 && r.location; i++) r = await get(r.location.replace(BASE, ""));
  if (!r.body.includes("QBSearch")) throw new Error("login failed (no Question Bank menu after signing in)");
}

/** Runs the all-years search; the result list then lives in this session and pages are read from it. */
async function search() {
  const q = new URLSearchParams({ subjectName: "", subject: "", semester: "ALL", qcourse: "NO", dname: "NO", months: "NO", Year: "", flag: "", hid: "search" });
  const r = await get(`/AutoLib/QBSearch/QBSearchServlet?${q}`);
  const m = /([\d,]+) items? found/.exec(r.body);
  if (!m) throw new Error("search returned no count");
  return Number(m[1].replace(/,/g, ""));
}

const decode = (s) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/** "SCI5104(2016) (1)" -> "SCI5104"; "SCSA4002-3" -> "SCSA4002". Null when there is no usable code. */
export function cleanCode(raw) {
  for (const m of raw.toUpperCase().matchAll(/S[A-Z0-9]{4,10}/g)) if (/\d/.test(m[0])) return m[0];
  return null;
}

/** ":Advanced Design of Steel Structures (1)" -> "Advanced Design of Steel Structures". */
export function cleanTitle(raw) {
  return raw.replace(/^[\s:.\-]+/, "").replace(/\s*\(\d+\)\s*$/, "").replace(/\uFFFD/g, "-").trim();
}

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

export function parsePage(html) {
  const rows = [];
  for (const tr of html.matchAll(/<tr class="(?:odd|even)">([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
    const accno = /accno=(\d+)/.exec(tr[1])?.[1];
    if (!accno || cells.length < 8) continue;
    const [code, title, dept, course, major, year, month, semester] = cells.map(decode);
    const monthIndex = MONTHS.indexOf(month.toUpperCase());
    rows.push({
      accno: Number(accno),
      rawCode: code,
      code: cleanCode(code),
      title: cleanTitle(title),
      dept,
      course,
      major,
      year: /^\d{4}$/.test(year) ? Number(year) : null,
      month: monthIndex >= 0 ? monthIndex + 1 : null,
      semester,
    });
  }
  return rows;
}

async function main() {
  const done = new Set();
  if (existsSync(OUT)) {
    for (const line of readFileSync(OUT, "utf8").split("\n")) {
      if (line.startsWith('{"page"')) done.add(JSON.parse(line).page);
    }
  }
  await login();
  const total = await search();
  const pages = Math.ceil(total / 20);
  const todo = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => !done.has(p));
  console.log(`[autolib] ${total} papers on ${pages} pages; ${todo.length} pages to fetch, ${CONCURRENCY} at a time`);

  let fetched = 0;
  let rowsWritten = 0;
  let relogins = 0;
  const started = Date.now();
  async function worker() {
    while (todo.length) {
      const page = todo.shift();
      let r = await get(`/AutoLib/QBSearch/simpleSearchdisplay.jsp?d-1663680-p=${page}`);
      let rows = parsePage(r.body);
      if (rows.length === 0 && page < pages) {
        // Session expired or the stored search was lost: sign in again, search again, retry once.
        if (++relogins > 20) throw new Error("too many session losses");
        await login();
        await search();
        r = await get(`/AutoLib/QBSearch/simpleSearchdisplay.jsp?d-1663680-p=${page}`);
        rows = parsePage(r.body);
      }
      appendFileSync(OUT, rows.map((row) => `${JSON.stringify(row)}\n`).join("") + `${JSON.stringify({ page, rows: rows.length })}\n`);
      rowsWritten += rows.length;
      if (++fetched % 50 === 0) {
        const rate = fetched / ((Date.now() - started) / 1000);
        console.log(`[autolib] ${fetched}/${pages} pages, ${rowsWritten} rows, ~${Math.round(todo.length / rate)}s left`);
      }
      await sleep(PAUSE_MS);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`[autolib] done: ${fetched} pages, ${rowsWritten} rows in ${Math.round((Date.now() - started) / 1000)}s -> ${OUT}`);
}

// Run only when executed directly, so tests can import the parsers.
if (process.argv[1]?.endsWith("autolib-index.mjs")) {
  main().catch((err) => {
    console.error(`[autolib] FAILED: ${err.message}`);
    process.exitCode = 1;
  });
}
