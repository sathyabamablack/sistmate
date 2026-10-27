"use client";

/**
 * Turns photos of a question paper into one small PDF, in the browser.
 *
 * Each photo is redrawn on a canvas and saved as JPEG: that drops EXIF data (GPS location, phone
 * model) and shrinks a 4 MB phone photo to a few hundred KB. The JPEGs are then wrapped in a
 * minimal PDF, one page per photo, without a PDF library (JPEG goes into PDF as-is, DCTDecode).
 */

const MAX_SIDE = 2000;
const QUALITY = 0.82;
const PAGE_WIDTH = 595; // A4 width in points; height follows the photo.

interface Page {
  jpeg: Uint8Array;
  width: number;
  height: number;
}

async function toJpeg(file: File): Promise<Page> {
  // Respects the photo's EXIF rotation, so sideways phone photos come out upright.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't process photos. Try a PDF instead.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error("Couldn't read one of the photos.");
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width, height };
}

export async function imagesToPdf(files: File[]): Promise<Blob> {
  const pages: Page[] = [];
  for (const file of files) pages.push(await toJpeg(file));

  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (n: number, body: string | (string | Uint8Array)[]) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    for (const part of Array.isArray(body) ? body : [body]) push(part);
    push("\nendobj\n");
  };

  // Objects: 1 catalog, 2 page tree, then per page: page, image, content stream.
  const pageIds = pages.map((_, i) => 3 + i * 3);
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  pages.forEach((page, i) => {
    const pageId = pageIds[i]!;
    const w = PAGE_WIDTH;
    const h = Math.round((PAGE_WIDTH * page.height) / page.width);
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${pageId + 1} 0 R >> >> /Contents ${pageId + 2} 0 R >>`);
    object(pageId + 1, [
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
      page.jpeg,
      "\nendstream",
    ]);
    object(pageId + 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  const count = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}
