/**
 * Which files the share form keeps when someone picks, drops or photographs more. The rule is the
 * form's own: one PDF, or photos only (one page each), never both.
 */

/** Most pages one upload may have. The server checks the final PDF size too. */
export const MAX_PAGES = 40;

export interface Pickable {
  name: string;
  type: string;
}

export const isPdf = (f: Pickable) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
export const isImage = (f: Pickable) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);

export interface MergeResult {
  files: File[];
  /** A short, plain sentence about anything dropped or replaced, or null. */
  note: string | null;
}

const identity = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;

/** Adds `incoming` to `existing` under the one-PDF-or-photos rule. */
export function mergeFiles(existing: File[], incoming: File[]): MergeResult {
  const usable = incoming.filter((f) => isPdf(f) || isImage(f));
  const skipped = incoming.length - usable.length;
  const notes: string[] = [];
  let files = existing;

  const pdfs = usable.filter(isPdf);
  const photos = usable.filter((f) => !isPdf(f));
  if (pdfs.length > 0) {
    // A PDF stands alone: it replaces whatever was there.
    files = [pdfs[0]!];
    if (usable.length > 1) notes.push(`Only one PDF can be shared at a time, so I kept ${pdfs[0]!.name}.`);
    else if (existing.some((f) => !isPdf(f))) notes.push("The PDF replaced the photos you picked before.");
  } else if (photos.length > 0) {
    if (existing.some(isPdf)) notes.push("These photos replaced the PDF you picked before.");
    const kept = existing.filter((f) => !isPdf(f));
    const seen = new Set(kept.map(identity));
    const fresh = photos.filter((f) => {
      const key = identity(f);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    files = [...kept, ...fresh];
    if (files.length > MAX_PAGES) {
      files = files.slice(0, MAX_PAGES);
      notes.push(`One upload holds up to ${MAX_PAGES} pages, so I kept the first ${MAX_PAGES}.`);
    }
  }
  if (skipped > 0) notes.push(`${skipped} ${skipped === 1 ? "file was" : "files were"} skipped: only PDFs and photos work.`);
  return { files, note: notes.length > 0 ? notes.join(" ") : null };
}

/** A copy of `files` with the one at `from` moved to `to` (page order matters for photos). */
export function moveFile<T>(files: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= files.length || to >= files.length) return files;
  const next = [...files];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
