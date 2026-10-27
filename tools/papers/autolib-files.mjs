#!/usr/bin/env node
/**
 * Finds each library paper's real file name. The question bank listing has no file names and many
 * papers aren't stored as "<accession>.<ext>" (e.g. "SFA1303-MAY23.doc"), so this reads every
 * paper's "view" page (guest login, as in autolib-index.mjs) and records the file it links to.
 *
 *   node tools/papers/autolib-files.mjs [--concurrency 4]   resolve (resumable) -> files.jsonl
 *   node tools/papers/autolib-files.mjs --apply             write the names into the papers database
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { get, login } from "./autolib-index.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const DIR = arg("dir", "X:/DevCache/papers-raw/autolib");
const INDEX = join(DIR, "index.jsonl");
const OUT = join(DIR, "files.jsonl");
const CONCURRENCY = Number(arg("concurrency", "4"));
const WORKER_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../workers/papers");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readJsonl(file, prefix) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.startsWith(prefix))
    .map((l) => JSON.parse(l));
}

/** The file linked from a view page: "/AutoLib/filePath/QUESTION BANK/SFA1303-MAY23.doc " -> "SFA1303-MAY23.doc". */
export function fileFromView(html) {
  const m = /href="\/AutoLib\/filePath\/QUESTION BANK\/([^"]+?)\s*"/i.exec(html);
  return m ? m[1].trim() : null;
}

async function resolve() {
  const accnos = [...new Set(readJsonl(INDEX, '{"accno"').filter((r) => r.code).map((r) => r.accno))];
  const done = new Set(readJsonl(OUT, '{"accno"').map((r) => r.accno));
  const todo = accnos.filter((a) => !done.has(a));
  console.log(`[files] ${accnos.length} papers, ${todo.length} still to look up, ${CONCURRENCY} at a time`);
  await login();

  let n = 0;
  let relogins = 0;
  const started = Date.now();
  async function worker() {
    while (todo.length) {
      const accno = todo.shift();
      let r = await get(`/AutoLib/QBSearch/QBSearchServlet?accno=${accno}`);
      if (r.status === 302 && /sessiontimeout/i.test(r.location ?? "")) {
        if (++relogins > 50) throw new Error("too many session losses");
        await login();
        r = await get(`/AutoLib/QBSearch/QBSearchServlet?accno=${accno}`);
      }
      appendFileSync(OUT, `${JSON.stringify({ accno, file: fileFromView(r.body) })}\n`);
      if (++n % 500 === 0) {
        const rate = n / ((Date.now() - started) / 1000);
        console.log(`[files] ${n} looked up, ~${Math.round(todo.length / rate / 60)} min left`);
      }
      await sleep(250);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`[files] done: ${n} looked up in ${Math.round((Date.now() - started) / 60000)} min -> ${OUT}`);
}

function apply() {
  const rows = readJsonl(OUT, '{"accno"').filter((r) => r.file);
  const sql = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const statements = rows.map((r) => `UPDATE papers SET file_name = ${sql(r.file)} WHERE id = ${sql(`a${String(r.accno).padStart(15, "0")}`)};`);
  const sqlDir = join(DIR, "sql");
  mkdirSync(sqlDir, { recursive: true });
  const PER_FILE = 5000;
  const files = [];
  for (let i = 0; i < statements.length; i += PER_FILE) {
    const file = join(sqlDir, `files-${String(files.length + 1).padStart(3, "0")}.sql`);
    writeFileSync(file, statements.slice(i, i + PER_FILE).join("\n"));
    files.push(file);
  }
  console.log(`[files] ${rows.length} file names in ${files.length} SQL files`);
  for (const [i, file] of files.entries()) {
    execFileSync("npx", ["--yes", "wrangler@4.152.0", "d1", "execute", "sistmate-papers", "--remote", "--yes", `--file=${file}`], {
      cwd: WORKER_DIR,
      shell: true,
      stdio: "ignore",
    });
    console.log(`[files] ${i + 1}/${files.length} applied`);
  }
}

if (process.argv[1]?.endsWith("autolib-files.mjs")) {
  (process.argv.includes("--apply") ? Promise.resolve(apply()) : resolve()).catch((err) => {
    console.error(`[files] FAILED: ${err.message}`);
    process.exitCode = 1;
  });
}
