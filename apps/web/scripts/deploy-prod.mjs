#!/usr/bin/env node
/**
 * Production deploy with the static files (/_next/static: JS, CSS, fonts) served from Cloudflare
 * (an assets-only Worker) instead of Vercel, so those requests don't count against the Vercel Hobby plan.
 *
 *   node apps/web/scripts/deploy-prod.mjs              build + copy assets + check, then stop
 *   node apps/web/scripts/deploy-prod.mjs --promote    ...and make it the live production deployment
 *   node apps/web/scripts/deploy-prod.mjs --promote-url <deployment url>   promote an earlier run
 *
 * Run it from the directory linked to the Vercel project (the one with .vercel/project.json).
 * Needs the Vercel CLI and wrangler (via npx) signed in. Set VERCEL_GLOBAL_CONFIG to use a Vercel
 * login kept in its own config dir instead of the default one.
 *
 * Order matters, so a live page never points at a file that isn't on Cloudflare yet:
 *   1. Vercel builds a production deployment with ASSET_PREFIX, without taking the domain.
 *   2. Its /usp-assets.json (scripts/list-static-assets.mjs) lists every static file.
 *   3. Missing files are downloaded into ASSET_STORE, which keeps every earlier build's files too,
 *      so tabs still open on an older version can lazy-load their chunks.
 *   4. ASSET_STORE is deployed to Cloudflare, then every file is checked there (status, CORS).
 *   5. Only then, with --promote, the deployment takes the production domain.
 * If anything fails before step 5, production is untouched. The files are on Vercel as well, and
 * the service worker falls back to them if the asset host ever fails.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ASSET_HOST = process.env.ASSET_HOST || "https://sistmate-static.sistmate-static.workers.dev";
/** Optional: a Vercel CLI config dir holding the login to use (`vercel login --global-config <dir>`). */
const VERCEL_CONFIG = process.env.VERCEL_GLOBAL_CONFIG ? ["--global-config", `"${process.env.VERCEL_GLOBAL_CONFIG}"`] : [];
/** Holds wrangler.jsonc for the assets-only Worker "sistmate-static" and, in public/, every build's files. */
const ASSET_WORKER_DIR = process.env.ASSET_WORKER_DIR || "X:/DevCache/sistmate-static";
const ASSET_STORE = join(ASSET_WORKER_DIR, "public");
const PROD_URL = process.env.PROD_URL || "https://sistmate.vercel.app";
const CONCURRENCY = 12;

const args = process.argv.slice(2);
const promote = args.includes("--promote");
const promoteOnly = args.includes("--promote-url") ? args[args.indexOf("--promote-url") + 1] : "";

const log = (msg) => console.log(`[deploy] ${msg}`);
/** Stops the run; main() reports it. (No process.exit mid-fetch: Node on Windows can crash on that.) */
const fail = (msg) => {
  throw new Error(msg);
};

/** Runs a CLI through the shell (vercel and npx are .cmd shims on Windows) and returns stdout. */
function run(cmd, cmdArgs, { input } = {}) {
  const res = spawnSync(cmd, cmdArgs, { shell: true, encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) fail(`${cmd} ${cmdArgs.join(" ")}\n${res.stdout}\n${res.stderr}`);
  return `${res.stdout}\n${res.stderr}`;
}

function project() {
  const file = join(process.cwd(), ".vercel", "project.json");
  if (!existsSync(file)) fail(`no .vercel/project.json in ${process.cwd()}`);
  return JSON.parse(readFileSync(file, "utf8"));
}

/** The project's "Protection Bypass for Automation" secret, so preview checks get past Vercel Authentication. */
function bypassSecret({ projectId, orgId }) {
  const out = execFileSync("vercel", ["api", `/v9/projects/${projectId}?teamId=${orgId}`, ...VERCEL_CONFIG], {
    shell: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  });
  const bypass = JSON.parse(out.slice(out.indexOf("{"))).protectionBypass ?? {};
  const secret = Object.entries(bypass).find(([, v]) => v?.scope === "automation-bypass")?.[0];
  if (!secret) fail("the project has no Protection Bypass for Automation secret");
  return secret;
}

async function get(url, headers = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers, redirect: "manual" });
      if (res.status >= 500 && attempt < 4) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

async function pool(items, worker) {
  const queue = [...items];
  const errors = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const item = queue.shift();
        try {
          await worker(item);
        } catch (err) {
          errors.push(`${item}: ${err.message}`);
        }
      }
    }),
  );
  return errors;
}

function promoteDeployment(url) {
  log(`promoting ${url} to production`);
  run("vercel", ["promote", url, "--yes", ...VERCEL_CONFIG]);
}

async function checkLive() {
  const res = await get(`${PROD_URL}/welcome`);
  const html = await res.text();
  if (res.status !== 200) fail(`${PROD_URL}/welcome answered ${res.status}`);
  log(`live: /welcome ${res.status}, assets from ${html.includes(`${ASSET_HOST}/_next/static/`) ? ASSET_HOST : "this site"}`);
}

async function main() {
  if (promoteOnly) {
    promoteDeployment(promoteOnly);
    await checkLive();
    return;
  }

  const proj = project();
  const bypass = { "x-vercel-protection-bypass": bypassSecret(proj) };

  // 1. Build on Vercel without taking the production domain.
  log(`building a production deployment with ASSET_PREFIX=${ASSET_HOST} (domain not assigned yet)`);
  const out = run("vercel", ["deploy", "--prod", "--skip-domain", "--yes", "--build-env", `ASSET_PREFIX=${ASSET_HOST}`, ...VERCEL_CONFIG]);
  const url = [...out.matchAll(/https:\/\/[a-z0-9-]+\.vercel\.app/g)].map((m) => m[0]).find((u) => u !== PROD_URL);
  if (!url) fail(`could not find the deployment URL in:\n${out}`);
  log(`deployment: ${url}`);

  // 2. The build's own list of static files.
  const listRes = await get(`${url}/usp-assets.json`, bypass);
  if (!listRes.ok) fail(`usp-assets.json answered ${listRes.status}`);
  const list = await listRes.json();
  if (list.assetPrefix !== ASSET_HOST) fail(`the build used ASSET_PREFIX "${list.assetPrefix}", expected ${ASSET_HOST}`);
  log(`${list.files.length} static files in this build`);

  // 3. Download what the store doesn't have yet (content-hashed names never change content).
  const missing = list.files.filter((f) => !existsSync(join(ASSET_STORE, "_next", "static", f)));
  log(`${missing.length} new files to copy into ${ASSET_STORE}`);
  const downloadErrors = await pool(missing, async (f) => {
    const res = await get(`${url}/_next/static/${f}`, bypass);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const dest = join(ASSET_STORE, "_next", "static", f);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  });
  if (downloadErrors.length) fail(`downloads failed:\n${downloadErrors.slice(0, 20).join("\n")}`);

  writeFileSync(
    join(ASSET_STORE, "_headers"),
    [
      "/_next/static/*",
      "  Access-Control-Allow-Origin: *",
      "  Cache-Control: public, max-age=31536000, immutable",
      "  X-Content-Type-Options: nosniff",
      "  X-Robots-Tag: noindex",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(ASSET_STORE, "index.html"),
    `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Static files</title><p>Static files for <a href="${PROD_URL}">${PROD_URL}</a>.</p>\n`,
  );

  // 4. Publish to Cloudflare (an assets-only Worker: no script runs, so requests are free and
  // unlimited) and check every file of this build is served with CORS.
  log(`deploying ${ASSET_STORE} to the Cloudflare assets Worker`);
  run("npx", ["--yes", "wrangler@4", "deploy", "--config", `"${join(ASSET_WORKER_DIR, "wrangler.jsonc")}"`]);

  const origin = { Origin: PROD_URL };
  const checkErrors = await pool(list.files, async (f) => {
    const res = await get(`${ASSET_HOST}/_next/static/${f}`, origin);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    if (res.headers.get("access-control-allow-origin") !== "*") throw new Error("no CORS header");
    await res.arrayBuffer();
  });
  if (checkErrors.length) fail(`asset host check failed:\n${checkErrors.slice(0, 20).join("\n")}`);
  log(`all ${list.files.length} files are served by ${ASSET_HOST} with CORS`);

  // The deployment's own pages really point there.
  const page = await (await get(`${url}/welcome`, bypass)).text();
  if (!page.includes(`${ASSET_HOST}/_next/static/`)) fail("the new /welcome does not load its files from the asset host");

  if (!promote) {
    log(`ready. Check ${url}, then: node apps/web/scripts/deploy-prod.mjs --promote-url ${url}`);
    return;
  }
  // 5. Go live.
  promoteDeployment(url);
  await checkLive();
}

main().catch((err) => {
  console.error(`[deploy] FAILED: ${err.message}`);
  process.exitCode = 1;
});
