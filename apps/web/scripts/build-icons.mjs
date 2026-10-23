// Renders the portal mark (app/icon.svg) into every raster size the app ships:
// favicon.ico (16/32/48), the PWA icons and the Apple touch icon.
// Run from apps/web:  node scripts/build-icons.mjs   (uses the repo's Playwright Chromium)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "..");
const { chromium } = await import(
  pathToFileURL(path.resolve(web, "../../node_modules/@playwright/test/index.mjs")).href
);

const PINE = "#13483f";
const MINT = "#dcebe4";
const AMBER = "#e09f1f";

/**
 * The mark: a ring three quarters full (the 75% attendance line) on pine, with an
 * amber tick where the ring stops. `inset` shrinks the artwork for maskable icons.
 */
function mark({ rounded = true, inset = 1 } = {}) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const s = inset;
  const o = (64 - 64 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" ${rounded ? 'rx="16"' : ""} fill="${PINE}"/>
  <g transform="translate(${o} ${o}) scale(${s})">
    <circle cx="32" cy="32" r="${r}" fill="none" stroke="${MINT}" stroke-opacity="0.22" stroke-width="9"/>
    <circle cx="32" cy="32" r="${r}" fill="none" stroke="${MINT}" stroke-width="9" stroke-linecap="round"
      stroke-dasharray="${(c * 0.75).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 32 32)"/>
    <line x1="7.5" y1="32" x2="19" y2="32" stroke="${AMBER}" stroke-width="5" stroke-linecap="round"/>
  </g>
</svg>
`;
}

fs.writeFileSync(path.join(web, "app/icon.svg"), mark());

const browser = await chromium.launch();
async function png(svg, size, transparent) {
  const ctx = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  const buf = await page.screenshot({ omitBackground: transparent });
  await ctx.close();
  return buf;
}

const icons = path.join(web, "public/icons");
fs.mkdirSync(icons, { recursive: true });
const out = [
  ["icon-192.png", 192, mark(), true],
  ["icon-512.png", 512, mark(), true],
  ["icon-maskable-192.png", 192, mark({ rounded: false, inset: 0.78 }), false],
  ["icon-maskable-512.png", 512, mark({ rounded: false, inset: 0.78 }), false],
  ["apple-touch-icon.png", 180, mark({ rounded: false, inset: 0.92 }), false],
];
for (const [file, size, svg, transparent] of out) {
  fs.writeFileSync(path.join(icons, file), await png(svg, size, transparent));
}

// favicon.ico: an ICO container holding 16, 32 and 48 px PNGs.
const sizes = [16, 32, 48];
const images = [];
for (const size of sizes) images.push(await png(mark(), size, true));
await browser.close();

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
const dir = Buffer.alloc(16 * images.length);
let offset = 6 + dir.length;
images.forEach((img, i) => {
  const e = i * 16;
  dir.writeUInt8(sizes[i] % 256, e);
  dir.writeUInt8(sizes[i] % 256, e + 1);
  dir.writeUInt8(0, e + 2);
  dir.writeUInt8(0, e + 3);
  dir.writeUInt16LE(1, e + 4);
  dir.writeUInt16LE(32, e + 6);
  dir.writeUInt32LE(img.length, e + 8);
  dir.writeUInt32LE(offset, e + 12);
  offset += img.length;
});
fs.writeFileSync(path.join(web, "app/favicon.ico"), Buffer.concat([header, dir, ...images]));
console.log("Wrote app/icon.svg, app/favicon.ico and public/icons/*");
