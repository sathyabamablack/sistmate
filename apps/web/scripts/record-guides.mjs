#!/usr/bin/env node
/**
 * Records the animated install guides (/install) as shareable video files.
 *
 * It starts nothing itself: point it at a running server (dev or production),
 * for example
 *
 *   DATA_SOURCE=mock SESSION_SECRET=... npx next dev -p 3400      (another terminal)
 *   node scripts/record-guides.mjs                                 (defaults to http://localhost:3400)
 *   node scripts/record-guides.mjs --url http://localhost:3400 --only android,laptop
 *
 * For each guide it opens the chromeless capture page /install/capture/<guide>
 * (720 x 1280 for phone guides, 1280 x 720 for the laptop one), saves a poster
 * PNG of the title card, plays the guide once and writes
 *
 *   public/guides/<guide>.mp4   H.264, no audio: plays on iPhones and in WhatsApp
 *   public/guides/<guide>.webm  VP9 (or VP8), no audio
 *   public/guides/<guide>.png   poster
 *
 * Two recording engines:
 *   tab        (default when Chrome or Edge is installed) Chrome's own tab capture
 *              and MediaRecorder, which encode H.264 MP4 and VP9 WebM directly,
 *              at a steady 30 fps. Needs no ffmpeg.
 *   playwright Playwright's screencast (VP8 WebM). With ffmpeg on PATH (or FFMPEG=path)
 *              it is also transcoded to H.264 MP4 with +faststart; otherwise WebM only.
 * Force one with --engine tab|playwright. With ffmpeg available, tab-engine MP4s are
 * also remuxed with +faststart (non-fragmented) for the widest player support.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "guides");
const GUIDES = [
  { id: "android", device: "phone" },
  { id: "iphone", device: "phone" },
  { id: "phone-connect", device: "phone" },
  { id: "laptop", device: "laptop" },
];
const MAX_MP4_BYTES = 3 * 1024 * 1024;
const HOLD_START_MS = 1600; // title card before playback
const HOLD_END_MS = 1800; // last frame after playback

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : fallback;
}

const baseUrl = arg("url", process.env.GUIDES_URL || "http://localhost:3400").replace(/\/$/, "");
const only = arg("only", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const scheme = arg("scheme", "light");
const guides = only.length ? GUIDES.filter((g) => only.includes(g.id)) : GUIDES;
if (guides.length === 0) {
  console.error(`No guides match --only ${only.join(",")}. Known: ${GUIDES.map((g) => g.id).join(", ")}`);
  process.exit(1);
}

/** ffmpeg from FFMPEG=path or PATH, or null. */
function findFfmpeg() {
  for (const bin of [process.env.FFMPEG, "ffmpeg"].filter(Boolean)) {
    const r = spawnSync(bin, ["-version"], { encoding: "utf8" });
    if (r.status === 0) return bin;
  }
  return null;
}

/** An installed Chrome or Edge (they ship the H.264 encoder; Playwright's Chromium does not). */
async function launchBrandedBrowser() {
  for (const channel of ["chrome", "msedge"]) {
    try {
      const browser = await chromium.launch({ channel, headless: true, args: ["--auto-accept-this-tab-capture"] });
      return { browser, channel };
    } catch {
      /* not installed */
    }
  }
  return null;
}

const sizeOf = (device) => (device === "phone" ? { width: 720, height: 1280 } : { width: 1280, height: 720 });
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

async function openCapture(browser, guide) {
  const size = sizeOf(guide.device);
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 1,
    colorScheme: scheme === "dark" ? "dark" : "light",
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/install/capture/${guide.id}`, { waitUntil: "networkidle", timeout: 180_000 });
  // The dev server's overlay button would end up in the video.
  await page.addStyleTag({ content: "nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }" });
  await page.waitForSelector("[data-ready]", { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const duration = await page.evaluate(() => window.__guide?.duration ?? 0);
  if (!duration) throw new Error(`${guide.id}: the capture page did not expose window.__guide`);
  return { context, page, size, duration, errors };
}

async function waitForEnd(page, duration) {
  await page.waitForFunction(() => document.querySelector("[data-guide]")?.getAttribute("data-state") === "ended", null, {
    timeout: duration + 60_000,
    polling: 100,
  });
}

/** Chrome tab capture + MediaRecorder: MP4 (H.264) and WebM (VP9) in one pass. */
async function recordWithTabCapture(page, duration) {
  const chunks = { mp4: [], webm: [] };
  await page.exposeFunction("__guideChunk", (kind, b64) => {
    chunks[kind].push(Buffer.from(b64, "base64"));
  });
  const types = await page.evaluate(async () => {
    const pick = (list) => list.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
    const mp4 = pick(["video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1", "video/mp4"]);
    const webm = pick(["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]);
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: false,
      preferCurrentTab: true,
    });
    const send = (kind) => async (e) => {
      if (!e.data.size) return;
      const bytes = new Uint8Array(await e.data.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      await window.__guideChunk(kind, btoa(bin));
    };
    const recorders = [];
    for (const [kind, mimeType, bits] of [
      ["mp4", mp4, 400_000],
      ["webm", webm, 280_000],
    ]) {
      if (!mimeType) continue;
      const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bits });
      rec.ondataavailable = send(kind);
      rec.start(1000);
      recorders.push(rec);
    }
    window.__guideStop = async () => {
      await Promise.all(
        recorders.map(
          (rec) =>
            new Promise((resolve) => {
              rec.addEventListener("stop", () => setTimeout(resolve, 300), { once: true });
              rec.stop();
            }),
        ),
      );
      stream.getTracks().forEach((t) => t.stop());
    };
    return { mp4, webm };
  });
  await page.waitForTimeout(HOLD_START_MS);
  await page.evaluate(() => window.__guide.start());
  await waitForEnd(page, duration);
  await page.waitForTimeout(HOLD_END_MS);
  await page.evaluate(() => window.__guideStop());
  // Let the last exposed-function calls land.
  await page.waitForTimeout(500);
  return {
    mp4: types.mp4 ? Buffer.concat(chunks.mp4) : null,
    webm: types.webm ? Buffer.concat(chunks.webm) : null,
    types,
  };
}

/** Playwright's screencast: VP8 WebM. */
async function recordWithScreencast(page, size, duration, file) {
  await page.screencast.start({ path: file, size, fps: 30, quality: 90 });
  await page.waitForTimeout(HOLD_START_MS);
  await page.evaluate(() => window.__guide.start());
  await waitForEnd(page, duration);
  await page.waitForTimeout(HOLD_END_MS);
  await page.screencast.stop();
  return readFileSync(file);
}

// ---------------------------------------------------------------------------
// Durations. MediaRecorder streams its output, so neither file says how long
// it is: the WebM has no Duration (players show "live" and seek badly) and the
// fragmented MP4 has 0 in its headers. Both are patched from the frames.
// ---------------------------------------------------------------------------

/** Top-level MP4 boxes in [start, end). */
function mp4Boxes(buf, start, end) {
  const out = [];
  let o = start;
  while (o + 8 <= end) {
    let size = buf.readUInt32BE(o);
    let hdr = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(o + 8));
      hdr = 16;
    } else if (size === 0) {
      size = end - o;
    }
    if (size < hdr) break;
    out.push({ o, size, hdr, type: buf.toString("latin1", o + 4, o + 8) });
    o += size;
  }
  return out;
}

const child = (buf, box, type) => mp4Boxes(buf, box.o + box.hdr, box.o + box.size).find((b) => b.type === type);

/** Writes the real duration into a fragmented MP4 (mvhd, tkhd, mdhd and a new mehd). */
export function fixMp4Duration(input) {
  const buf = Buffer.from(input);
  const top = mp4Boxes(buf, 0, buf.length);
  const moov = top.find((b) => b.type === "moov");
  if (!moov) return buf;
  const mvhd = child(buf, moov, "mvhd");
  const trak = child(buf, moov, "trak");
  const mvex = child(buf, moov, "mvex");
  const tkhd = trak && child(buf, trak, "tkhd");
  const mdia = trak && child(buf, trak, "mdia");
  const mdhd = mdia && child(buf, mdia, "mdhd");
  if (!mvhd || !tkhd || !mdhd) return buf;
  const v1 = (box) => buf[box.o + 8] === 1;
  const movieScale = buf.readUInt32BE(mvhd.o + (v1(mvhd) ? 28 : 20));
  const mediaScale = buf.readUInt32BE(mdhd.o + (v1(mdhd) ? 28 : 20));
  const trex = mvex && child(buf, mvex, "trex");
  const trexDuration = trex ? buf.readUInt32BE(trex.o + 20) : 0;

  let end = 0;
  for (const moof of top.filter((b) => b.type === "moof")) {
    const traf = child(buf, moof, "traf");
    if (!traf) continue;
    const tfhd = child(buf, traf, "tfhd");
    const tfdt = child(buf, traf, "tfdt");
    const trun = child(buf, traf, "trun");
    if (!trun) continue;
    let defaultDuration = trexDuration;
    if (tfhd) {
      const flags = buf.readUInt32BE(tfhd.o + 8) & 0xffffff;
      let p = tfhd.o + 16;
      if (flags & 0x1) p += 8;
      if (flags & 0x2) p += 4;
      if (flags & 0x8) defaultDuration = buf.readUInt32BE(p);
    }
    const base = tfdt ? (v1(tfdt) ? Number(buf.readBigUInt64BE(tfdt.o + 12)) : buf.readUInt32BE(tfdt.o + 12)) : 0;
    const flags = buf.readUInt32BE(trun.o + 8) & 0xffffff;
    const count = buf.readUInt32BE(trun.o + 12);
    let p = trun.o + 16;
    if (flags & 0x1) p += 4;
    if (flags & 0x4) p += 4;
    const fields = [0x100, 0x200, 0x400, 0x800].filter((f) => flags & f).length;
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += flags & 0x100 ? buf.readUInt32BE(p) : defaultDuration;
      p += fields * 4;
    }
    end = Math.max(end, base + total);
  }
  if (!end) return buf;
  const movieDuration = Math.round((end * movieScale) / mediaScale);

  const put = (box, v1Offset, v0Offset, value) => {
    if (v1(box)) buf.writeBigUInt64BE(BigInt(value), box.o + v1Offset);
    else buf.writeUInt32BE(value, box.o + v0Offset);
  };
  put(mvhd, 32, 24, movieDuration);
  put(tkhd, 36, 28, movieDuration);
  put(mdhd, 32, 24, end);

  if (!mvex || child(buf, mvex, "mehd") || moov.hdr !== 8 || mvex.hdr !== 8) return buf;
  // Fragment offsets are relative to each moof, so growing the moov is safe.
  const mehd = Buffer.alloc(20);
  mehd.writeUInt32BE(20, 0);
  mehd.write("mehd", 4, "latin1");
  mehd.writeUInt32BE(0x01000000, 8);
  mehd.writeBigUInt64BE(BigInt(movieDuration), 12);
  buf.writeUInt32BE(moov.size + 20, moov.o);
  buf.writeUInt32BE(mvex.size + 20, mvex.o);
  return Buffer.concat([buf.subarray(0, mvex.o + 8), mehd, buf.subarray(mvex.o + 8)]);
}

/** EBML variable-length integer at `o`: { length, value } (value without the marker bit). */
function vint(buf, o) {
  const first = buf[o];
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
  let value = BigInt(first & (0xff >> length));
  let allOnes = value === BigInt((0xff >> length));
  for (let i = 1; i < length; i++) {
    value = (value << 8n) | BigInt(buf[o + i]);
    if (buf[o + i] !== 0xff) allOnes = false;
  }
  return { length, value: allOnes ? -1n : value };
}

function ebmlId(buf, o) {
  const { length } = vint(buf, o);
  return { length, id: buf.readUIntBE(o, length) };
}

const EBML = {
  segment: 0x18538067,
  info: 0x1549a966,
  timecodeScale: 0x2ad7b1,
  duration: 0x4489,
  cluster: 0x1f43b675,
  timecode: 0xe7,
  simpleBlock: 0xa3,
  blockGroup: 0xa0,
  block: 0xa1,
};

/** Writes the real duration into a WebM made by MediaRecorder (it leaves Duration out). */
export function fixWebmDuration(input) {
  const buf = Buffer.from(input);
  const header = (o) => {
    const id = ebmlId(buf, o);
    const size = vint(buf, o + id.length);
    return { id: id.id, data: o + id.length + size.length, size: size.value };
  };
  // EBML header, then the Segment.
  const ebml = header(0);
  let o = ebml.data + Number(ebml.size);
  const segment = header(o);
  if (segment.id !== EBML.segment) return buf;
  const segmentEnd = segment.size < 0n ? buf.length : segment.data + Number(segment.size);

  let info = null;
  let infoStart = -1;
  let lastTime = 0;
  let frame = 33;
  o = segment.data;
  while (o < segmentEnd) {
    const el = header(o);
    if (el.id === EBML.info) {
      info = el;
      infoStart = o;
    }
    if (el.id === EBML.cluster) {
      const end = el.size < 0n ? segmentEnd : el.data + Number(el.size);
      let clusterTime = 0;
      let p = el.data;
      let prev = null;
      while (p < end) {
        const c = header(p);
        if (c.id === EBML.cluster || c.size < 0n) break; // an unsized cluster ends where the next begins
        if (c.id === EBML.timecode) clusterTime = buf.readUIntBE(c.data, Number(c.size));
        const blockAt = c.id === EBML.simpleBlock ? c.data : c.id === EBML.blockGroup ? header(c.data).data : -1;
        if (blockAt >= 0) {
          const track = vint(buf, blockAt);
          const t = clusterTime + buf.readInt16BE(blockAt + track.length);
          if (prev !== null && t > prev) frame = Math.min(frame, t - prev) || frame;
          prev = t;
          lastTime = Math.max(lastTime, t);
        }
        p = c.data + Number(c.size);
      }
      o = el.size < 0n ? p : end;
      continue;
    }
    if (el.size < 0n) break;
    o = el.data + Number(el.size);
  }
  if (!info || !lastTime) return buf;

  // Already has a duration?
  let scale = 1_000_000;
  for (let p = info.data; p < info.data + Number(info.size); ) {
    const c = header(p);
    if (c.id === EBML.duration) return buf;
    if (c.id === EBML.timecodeScale) scale = buf.readUIntBE(c.data, Number(c.size));
    p = c.data + Number(c.size);
  }
  const durationMs = lastTime + frame;
  const duration = Buffer.alloc(11);
  duration.writeUInt16BE(EBML.duration, 0);
  duration[2] = 0x88; // size 8
  duration.writeDoubleBE((durationMs * 1_000_000) / scale, 3);

  const body = Buffer.concat([buf.subarray(info.data, info.data + Number(info.size)), duration]);
  const size = Buffer.alloc(8);
  size.writeBigUInt64BE(BigInt(body.length));
  size[0] = 0x01; // 8-byte vint
  const infoHeader = Buffer.from([0x15, 0x49, 0xa9, 0x66]);
  const rebuilt = Buffer.concat([
    buf.subarray(0, infoStart),
    infoHeader,
    size,
    body,
    buf.subarray(info.data + Number(info.size)),
  ]);
  // A sized Segment grows by the same amount (MediaRecorder writes it unsized).
  if (segment.size >= 0n) {
    const segOffset = ebml.data + Number(ebml.size);
    const sizeAt = segOffset + 4;
    const len = vint(rebuilt, sizeAt).length;
    const grown = segment.size + BigInt(rebuilt.length - buf.length);
    for (let i = len - 1, v = grown; i >= 0; i--, v >>= 8n) rebuilt[sizeAt + i] = Number(v & 0xffn);
    rebuilt[sizeAt] |= 0x80 >> (len - 1);
  }
  return rebuilt;
}

function ffmpegToMp4(ffmpeg, input, output, { copy = false, crf = 28 } = {}) {
  const codec = copy
    ? ["-c:v", "copy"]
    : ["-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2"];
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", input, ...codec, "-an", "-movflags", "+faststart", output]);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const work = path.join(tmpdir(), `record-guides-${process.pid}`);
  mkdirSync(work, { recursive: true });
  const ffmpeg = findFfmpeg();
  const forced = arg("engine", "");

  let browser;
  let engine = "playwright";
  if (forced !== "playwright") {
    const branded = await launchBrandedBrowser();
    if (branded) {
      browser = branded.browser;
      engine = "tab";
      console.log(`Recording with ${branded.channel} tab capture (H.264 MP4 + WebM).`);
    } else if (forced === "tab") {
      throw new Error("--engine tab needs Chrome or Edge installed.");
    }
  }
  if (!browser) {
    browser = await chromium.launch();
    console.log(`Recording with Playwright's screencast (WebM).${ffmpeg ? " ffmpeg found: MP4 too." : " No ffmpeg: WebM only."}`);
  }

  const results = [];
  try {
    for (const guide of guides) {
      const { context, page, size, duration, errors } = await openCapture(browser, guide);
      const poster = path.join(OUT, `${guide.id}.png`);
      await page.screenshot({ path: poster });

      const webmPath = path.join(OUT, `${guide.id}.webm`);
      const mp4Path = path.join(OUT, `${guide.id}.mp4`);
      if (engine === "tab") {
        const { mp4, webm } = await recordWithTabCapture(page, duration);
        if (webm) writeFileSync(webmPath, fixWebmDuration(webm));
        if (mp4) {
          if (ffmpeg) {
            const raw = path.join(work, `${guide.id}.frag.mp4`);
            writeFileSync(raw, mp4);
            ffmpegToMp4(ffmpeg, raw, mp4Path, { copy: true });
          } else {
            writeFileSync(mp4Path, fixMp4Duration(mp4));
          }
        }
      } else {
        const raw = path.join(work, `${guide.id}.webm`);
        await recordWithScreencast(page, size, duration, raw);
        renameSync(raw, webmPath);
        if (ffmpeg) {
          for (const crf of [28, 32, 36]) {
            ffmpegToMp4(ffmpeg, webmPath, mp4Path, { crf });
            if (statSync(mp4Path).size <= MAX_MP4_BYTES) break;
          }
        } else {
          rmSync(mp4Path, { force: true });
        }
      }
      await context.close();

      const files = [mp4Path, webmPath, poster].flatMap((f) => {
        try {
          return [`${path.basename(f)} ${mb(statSync(f).size)}`];
        } catch {
          return [];
        }
      });
      results.push({ id: guide.id, files });
      console.log(`  ${guide.id}: ${files.join(", ")}${errors.length ? `  (page errors: ${errors.join("; ")})` : ""}`);
      try {
        if (statSync(mp4Path).size > MAX_MP4_BYTES) console.warn(`  ${guide.id}.mp4 is over 3 MB; lower the bitrate.`);
      } catch {
        /* no mp4 */
      }
    }
  } finally {
    await browser.close();
    rmSync(work, { recursive: true, force: true });
  }
  console.log(`Done: ${results.length} guide(s) in ${path.relative(process.cwd(), OUT) || OUT}`);
}

// `--fix <file>...` only patches durations in existing recordings.
if (process.argv[2] === "--fix") {
  for (const file of process.argv.slice(3)) {
    const data = readFileSync(file);
    writeFileSync(file, file.endsWith(".webm") ? fixWebmDuration(data) : fixMp4Duration(data));
    console.log(`Fixed ${file}`);
  }
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
