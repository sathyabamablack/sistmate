#!/usr/bin/env node
/**
 * Runs after `next build` (npm "postbuild"). Writes public/usp-assets.json, served as
 * /usp-assets.json: every file the build put under /_next/static. (Vercel only serves the files
 * Next itself put in <distDir>/static, so the list lives in public/.) scripts/deploy-prod.mjs
 * reads it from a new deployment to copy exactly those files to the asset host (ASSET_PREFIX in
 * next.config.mjs) before that deployment goes live. The files are public already; this only lists them.
 */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const staticDir = join(root, process.env.NEXT_DIST_DIR || ".next", "static");
const OUT = "usp-assets.json";

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(staticDir)
  .map((f) => relative(staticDir, f).split(sep).join("/"))
  .sort();

writeFileSync(join(root, "public", OUT), JSON.stringify({ assetPrefix: process.env.ASSET_PREFIX || "", files }));
console.log(`[build] listed ${files.length} static files in /${OUT}`);
