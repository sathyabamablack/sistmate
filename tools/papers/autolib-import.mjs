#!/usr/bin/env node
/**
 * Loads the library question bank index (tools/papers/autolib-index.mjs) into the papers database.
 * Only the listing goes in; the papers Worker fetches each file from the library when it's opened.
 *
 *   node tools/papers/autolib-import.mjs [--in X:/DevCache/papers-raw/autolib/index.jsonl] [--dry-run]
 *
 * Library papers are the university's own, so they go in approved. Re-running is safe: rows are
 * keyed by the library's accession number ("autolib:<accno>") and existing ones are left alone.
 * Needs wrangler signed in to the Cloudflare account that owns the D1 database.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkMeta, storedType } from "../../packages/core/src/papers.ts";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const IN = arg("in", "X:/DevCache/papers-raw/autolib/index.jsonl");
const DRY = process.argv.includes("--dry-run");
const WORKER_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../workers/papers");
const SQL_DIR = join(dirname(IN), "sql");
const ROWS_PER_INSERT = 100;
const INSERTS_PER_FILE = 50;

const sql = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

const byAccno = new Map();
let skipped = { noCode: 0, invalid: 0 };
for (const line of readFileSync(IN, "utf8").split("\n")) {
  if (!line.startsWith('{"accno"')) continue;
  const r = JSON.parse(line);
  if (!r.code) {
    skipped.noCode++;
    continue;
  }
  const meta = checkMeta({ courseCode: r.code, courseTitle: r.title, examType: "end_sem", year: r.year ?? "", month: r.month ?? "" });
  if (!meta.ok) {
    skipped.invalid++;
    continue;
  }
  byAccno.set(r.accno, { ...meta.value, accno: r.accno, dept: r.dept || null });
}

const rows = [...byAccno.values()];
const years = new Map();
for (const r of rows) years.set(r.year, (years.get(r.year) ?? 0) + 1);
console.log(`[import] ${rows.length} papers to load (skipped ${skipped.noCode} without a subject code, ${skipped.invalid} with bad details)`);
console.log(`[import] by year: ${[...years].sort((a, b) => b[0] - a[0]).map(([y, n]) => `${y}:${n}`).join(" ")}`);
console.log(`[import] ${new Set(rows.map((r) => r.courseCode)).size} subjects`);
if (DRY) process.exit(0);

const now = new Date().toISOString();
const statements = [];
for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
  const values = rows.slice(i, i + ROWS_PER_INSERT).map((r) =>
    `(${[
      `a${String(r.accno).padStart(15, "0")}`,
      r.courseCode,
      r.courseTitle,
      storedType(r),
      r.year,
      r.month,
      "autolib",
      String(r.accno),
      0,
      `autolib:${r.accno}`,
      "approved",
      now,
      r.dept,
    ]
      .map(sql)
      .join(",")})`,
  );
  statements.push(
    `INSERT OR IGNORE INTO papers (id, course_code, course_title, exam_type, year, month, source, source_ref, bytes, sha256, status, created_at, department) VALUES\n${values.join(",\n")};`,
  );
}

mkdirSync(SQL_DIR, { recursive: true });
const files = [];
for (let i = 0; i < statements.length; i += INSERTS_PER_FILE) {
  const file = join(SQL_DIR, `autolib-${String(files.length + 1).padStart(3, "0")}.sql`);
  writeFileSync(file, statements.slice(i, i + INSERTS_PER_FILE).join("\n"));
  files.push(file);
}
console.log(`[import] ${files.length} SQL files in ${SQL_DIR}`);

for (const [n, file] of files.entries()) {
  const out = execFileSync("npx", ["--yes", "wrangler@4.152.0", "d1", "execute", "sistmate-papers", "--remote", "--yes", `--file=${file}`], {
    cwd: WORKER_DIR,
    encoding: "utf8",
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const written = /"rows_written":\s*(\d+)/.exec(out)?.[1] ?? "?";
  console.log(`[import] ${n + 1}/${files.length} loaded (rows written: ${written})`);
}
// Drop the Worker's cached subject list so the new subjects are searchable at once.
execFileSync("npx", ["--yes", "wrangler@4.152.0", "kv", "key", "delete", "--binding=FILES", "--remote", "cache/subjects"], {
  cwd: WORKER_DIR,
  shell: true,
  stdio: "ignore",
});
console.log("[import] done.");
