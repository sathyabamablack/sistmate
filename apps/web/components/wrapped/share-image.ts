import type { SummaryTile, WrappedSummary } from "@/lib/wrapped";
import { tileRows } from "@/lib/wrapped";

/**
 * The 1080 x 1920 share image (Instagram story / WhatsApp status), drawn with the Canvas 2D
 * API in the browser. It is drawn from the same `WrappedSummary` as the closing card, so
 * "Hide GPA" removes the GPA and CGPA from both. Nothing here touches the network.
 */

export const IMAGE_WIDTH = 1080;
export const IMAGE_HEIGHT = 1920;

/** The share card's palette: pine on paper, the mint wash and the logo's amber tick. */
export const BRAND = {
  pine: "#134841",
  pineDeep: "#0d342e",
  ink: "#0f2421",
  paper: "#f3f6f4",
  mint: "#64c9a7",
  mintWash: "#d9ede3",
  amber: "#e09f1f",
} as const;

/** Tile colours; Summary.tsx uses the same pairs as Tailwind classes. */
export const TILE_COLORS: Record<SummaryTile["id"], { bg: string; fg: string }> = {
  cgpa: { bg: BRAND.mint, fg: BRAND.ink },
  credits: { bg: BRAND.paper, fg: BRAND.ink },
  best: { bg: BRAND.amber, fg: BRAND.ink },
  "top-grades": { bg: BRAND.mintWash, fg: BRAND.ink },
  attendance: { bg: BRAND.paper, fg: BRAND.ink },
};

const FALLBACK_FONTS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export interface ImageFonts {
  display: string;
  sans: string;
}

/**
 * The app's own fonts (next/font exposes them as --font-bricolage and --font-hanken) once they
 * are loaded, else the system font.
 */
export async function resolveFonts(): Promise<ImageFonts> {
  const css = getComputedStyle(document.body);
  const ready = async (family: string, weight: number) => {
    if (!family || !("fonts" in document)) return false;
    try {
      await document.fonts.load(`${weight} 64px ${family}`, "Semester 0123456789.");
      return document.fonts.check(`${weight} 64px ${family}`);
    } catch {
      return false;
    }
  };
  const display = css.getPropertyValue("--font-bricolage").trim();
  const sans = css.getPropertyValue("--font-hanken").trim();
  const [displayOk, sansOk, sansBold] = await Promise.all([
    ready(display, 600),
    ready(sans, 500),
    ready(sans, 600),
  ]);
  return {
    display: displayOk ? `${display}, ${FALLBACK_FONTS}` : FALLBACK_FONTS,
    sans: sansOk && sansBold ? `${sans}, ${FALLBACK_FONTS}` : FALLBACK_FONTS,
  };
}

type Ctx = CanvasRenderingContext2D;

function setFont(ctx: Ctx, weight: number, size: number, family: string, tracking = 0) {
  ctx.font = `${weight} ${size}px ${family}`;
  // Letter spacing is a newer canvas property; without it the text is just a little looser.
  if ("letterSpacing" in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${tracking}px`;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Largest size from `start` down to `min` at which `text` fits in `maxWidth`. */
function fitSize(ctx: Ctx, text: string, maxWidth: number, start: number, min: number, weight: number, family: string, tracking = 0) {
  let size = start;
  for (; size > min; size -= 4) {
    setFont(ctx, weight, size, family, tracking * (size / start));
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  setFont(ctx, weight, min, family, tracking * (min / start));
  return min;
}

/** Word-wraps `text` into at most `maxLines`, ending the last with an ellipsis if it overflows. */
function wrapLines(ctx: Ctx, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]!;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = words[i]!;
    if (lines.length === maxLines) {
      line = "";
      break;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) lines.length = maxLines;
  const used = lines.join(" ").split(/\s+/).length;
  if (used < words.length && lines.length > 0) {
    let last = lines[lines.length - 1]!;
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1).trimEnd();
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

/** The portal mark: a ring with the amber tick where it stops. */
function drawMark(ctx: Ctx, cx: number, cy: number, r: number, width: number, fraction: number, color: string, track: number) {
  ctx.save();
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.globalAlpha = track;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  const start = -Math.PI / 2;
  const end = start + Math.PI * 2 * Math.max(0.001, Math.min(1, fraction));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, end);
  ctx.stroke();
  ctx.strokeStyle = BRAND.amber;
  ctx.lineWidth = width * 0.55;
  const inner = r - width * 0.95;
  const outer = r + width * 0.95;
  ctx.beginPath();
  ctx.moveTo(cx + inner * Math.cos(end), cy + inner * Math.sin(end));
  ctx.lineTo(cx + outer * Math.cos(end), cy + outer * Math.sin(end));
  ctx.stroke();
  ctx.restore();
}

/** The big background ring: a faint track and a slightly stronger arc, no tick, so text over it stays clear. */
function drawRing(ctx: Ctx, cx: number, cy: number, r: number, width: number, fraction: number) {
  ctx.save();
  ctx.lineWidth = width;
  ctx.strokeStyle = BRAND.mint;
  ctx.globalAlpha = 0.07;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, Math.min(1, fraction)));
  ctx.stroke();
  ctx.restore();
}

function drawArrow(ctx: Ctx, x: number, y: number, size: number, dir: "up" | "down" | "flat", color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.16;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (dir === "flat") {
    ctx.moveTo(x, y + size / 2);
    ctx.lineTo(x + size, y + size / 2);
  } else {
    const [y0, y1] = dir === "up" ? [y + size, y] : [y, y + size];
    ctx.moveTo(x, y0);
    ctx.lineTo(x + size, y1);
    ctx.moveTo(x + size * 0.3, y1);
    ctx.lineTo(x + size, y1);
    ctx.lineTo(x + size, dir === "up" ? y1 + size * 0.7 : y1 - size * 0.7);
  }
  ctx.stroke();
  ctx.restore();
}

function drawCheck(ctx: Ctx, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.17;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.55);
  ctx.lineTo(x + size * 0.36, y + size * 0.9);
  ctx.lineTo(x + size, y + size * 0.12);
  ctx.stroke();
  ctx.restore();
}

/** A pill with an icon and words; returns its width. */
function drawChip(
  ctx: Ctx,
  x: number,
  y: number,
  text: string,
  icon: (x: number, y: number, size: number) => void,
  fonts: ImageFonts,
): number {
  const h = 88;
  setFont(ctx, 600, 36, fonts.sans);
  const w = 32 + 34 + 16 + ctx.measureText(text).width + 34;
  ctx.fillStyle = "rgba(243, 246, 244, 0.13)";
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  icon(x + 32, y + (h - 32) / 2, 32);
  ctx.fillStyle = BRAND.paper;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 32 + 34 + 16, y + h / 2 + 2);
  ctx.textBaseline = "alphabetic";
  return w;
}

function drawTile(ctx: Ctx, tile: SummaryTile, x: number, y: number, w: number, h: number, fonts: ImageFonts) {
  const { bg, fg } = TILE_COLORS[tile.id];
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, h, 44);
  ctx.fill();

  const pad = 44;
  const labelBase = y + pad + 28;
  ctx.fillStyle = fg;
  ctx.globalAlpha = 0.72;
  setFont(ctx, 600, 34, fonts.sans, 0.5);
  ctx.fillText(tile.label, x + pad, labelBase);
  ctx.globalAlpha = 1;

  let right = x + w - pad;
  if (tile.grade) {
    // The grade as a stamp on the right.
    const gh = Math.min(150, h - pad * 2);
    setFont(ctx, 600, Math.round(gh * 0.62), fonts.display, -2);
    const gw = Math.max(gh, ctx.measureText(tile.grade).width + 56);
    const gx = x + w - pad - gw;
    const gy = y + (h - gh) / 2;
    ctx.fillStyle = BRAND.ink;
    roundRect(ctx, gx, gy, gw, gh, 32);
    ctx.fill();
    ctx.fillStyle = BRAND.amber;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tile.grade, gx + gw / 2, gy + gh / 2 + 4);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    right = gx - 36;
  }

  ctx.fillStyle = fg;
  const maxW = right - (x + pad);
  const subBase = y + h - pad + 4;
  // The value sits between the label and the sub line, with air on both sides.
  const valueBase = tile.sub ? subBase - 50 : y + h - pad;
  const room = valueBase - (labelBase + 26);
  if (tile.id === "best") {
    // A subject title: up to two lines, as large as fits.
    let size = 72;
    let lines: string[] = [];
    for (; size >= 44; size -= 4) {
      setFont(ctx, 600, size, fonts.display, -1);
      lines = wrapLines(ctx, tile.value, maxW, 2);
      const fits = lines.every((l) => ctx.measureText(l).width <= maxW);
      if (fits && size * 0.74 + (lines.length - 1) * size * 1.04 <= room) break;
    }
    const lineH = size * 1.04;
    lines.forEach((l, i) => ctx.fillText(l, x + pad, valueBase - (lines.length - 1 - i) * lineH));
  } else {
    fitSize(ctx, tile.value, maxW, Math.min(140, Math.floor(room / 0.74)), 64, 600, fonts.display, -4);
    ctx.fillText(tile.value, x + pad, valueBase);
  }
  if (tile.sub) {
    ctx.globalAlpha = 0.72;
    fitSize(ctx, tile.sub, maxW, 32, 24, 500, fonts.sans);
    ctx.fillText(tile.sub, x + pad, subBase);
    ctx.globalAlpha = 1;
  }
}

/** Draws the whole image onto a 1080 x 1920 context. */
export function drawShareImage(
  ctx: Ctx,
  summary: WrappedSummary,
  opts: { fonts: ImageFonts; host: string; semester: number; gpaFraction: number | null },
) {
  const { fonts } = opts;
  const W = IMAGE_WIDTH;
  const H = IMAGE_HEIGHT;
  const PAD = 80;

  ctx.fillStyle = BRAND.pine;
  ctx.fillRect(0, 0, W, H);

  // A quiet ring behind the headline, filled to the GPA out of 10 (or as the logo is).
  drawRing(ctx, 930, 560, 300, 84, opts.gpaFraction ?? 0.75);

  // Header: the mark and the title.
  drawMark(ctx, PAD + 40, 196, 30, 13, 0.75, BRAND.paper, 0.22);
  ctx.fillStyle = BRAND.paper;
  setFont(ctx, 600, 46, fonts.display, -0.5);
  ctx.textBaseline = "middle";
  // With the GPA hidden the headline already says "Semester N wrapped", so the header carries the name.
  ctx.fillText(summary.gpa ? summary.title : "SISTmate", PAD + 108, 198);
  ctx.textBaseline = "alphabetic";

  let chipsY: number;
  if (summary.gpa) {
    ctx.fillStyle = BRAND.mint;
    setFont(ctx, 600, 40, fonts.sans, 5);
    ctx.fillText(summary.gpa.label.toUpperCase() + (summary.note ? "  ·  ESTIMATED" : ""), PAD, 390);
    ctx.fillStyle = BRAND.paper;
    fitSize(ctx, summary.gpa.value, W - PAD * 2, 340, 200, 600, fonts.display, -14);
    ctx.fillText(summary.gpa.value, PAD - 10, 680);
    chipsY = 734;
  } else {
    ctx.fillStyle = BRAND.paper;
    const size = fitSize(ctx, `Semester ${opts.semester}`, W - PAD * 2, 176, 120, 600, fonts.display, -6);
    ctx.fillText(`Semester ${opts.semester}`, PAD - 6, 300 + size * 0.95);
    ctx.fillStyle = BRAND.mint;
    ctx.fillText("wrapped.", PAD - 6, 300 + size * 1.95);
    chipsY = 300 + size * 1.95 + 64;
  }

  let chipX = PAD;
  if (summary.gpa) {
    const change = summary.gpa.change;
    const dir = /^Up/.test(change) ? "up" : /^Down/.test(change) ? "down" : /^Same/.test(change) ? "flat" : null;
    // A first GPA has no change to point at: the small mark stands in for the arrow.
    const icon = (x: number, y: number, s: number) =>
      dir ? drawArrow(ctx, x, y, s, dir, BRAND.mint) : drawMark(ctx, x + s / 2, y + s / 2, s / 2 - 4, 6, 0.75, BRAND.mint, 0.3);
    chipX += drawChip(ctx, chipX, chipsY, change, icon, fonts) + 20;
  }
  if (summary.arrears) {
    drawChip(ctx, chipX, chipsY, summary.arrears, (x, y, s) => drawCheck(ctx, x, y, s, BRAND.mint), fonts);
  }

  // Tiles, two to a row or one wide.
  const rows = tileRows(summary.tiles);
  const top = chipsY + 88 + 56;
  const bottom = 1700;
  const gap = 24;
  const rowH = rows.length ? Math.min(310, (bottom - top - gap * (rows.length - 1)) / rows.length) : 0;
  rows.forEach((row, r) => {
    const y = top + r * (rowH + gap);
    if (row.length === 1) {
      drawTile(ctx, row[0]!, PAD, y, W - PAD * 2, rowH, fonts);
    } else {
      const w = (W - PAD * 2 - gap) / 2;
      row.forEach((t, i) => drawTile(ctx, t, PAD + i * (w + gap), y, w, rowH, fonts));
    }
  });

  // Footer: the plain "estimated" note and the brand line.
  ctx.textAlign = "center";
  if (summary.note) {
    ctx.fillStyle = BRAND.mint;
    setFont(ctx, 500, 32, fonts.sans);
    ctx.fillText(summary.note, W / 2, 1772);
  }
  ctx.fillStyle = BRAND.paper;
  ctx.globalAlpha = 0.85;
  setFont(ctx, 600, 36, fonts.sans, 1);
  ctx.fillText(opts.host, W / 2, 1846);
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

/** Renders the image to a PNG blob. */
export async function renderShareImage(
  summary: WrappedSummary,
  opts: { host: string; semester: number; gpaFraction: number | null },
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = IMAGE_WIDTH;
  canvas.height = IMAGE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  const fonts = await resolveFonts();
  drawShareImage(ctx, summary, { ...opts, fonts });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the image."))), "image/png"),
  );
}
