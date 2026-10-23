/**
 * The ERP publishes notices as raw HTML in a single `Notification` field.
 * We reduce them to plain text (never pass HTML through), keeping the first
 * image and first link so the UI can render a poster / "open" action safely.
 */

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decode(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

const httpUrl = (u: string | undefined): string | undefined =>
  u && /^https?:\/\//i.test(u) ? decode(u) : undefined;

export interface ParsedNotice {
  title: string;
  body?: string;
  imageUrl?: string;
  link?: string;
}

export function parseNotice(html: string): ParsedNotice {
  const imageUrl = httpUrl(/<img\b[^>]*?\bsrc=["']([^"']+)["']/i.exec(html)?.[1]);
  const link = httpUrl(/<a\b[^>]*?\bhref=["']([^"']+)["']/i.exec(html)?.[1]);

  const lines = decode(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<\/(p|div|li|h[1-6]|tr)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { title: imageUrl ? "Notice (poster)" : "Notice", imageUrl, link };
  }

  const MAX = 110;
  const first = lines[0]!;
  const title = first.length > MAX ? `${first.slice(0, MAX - 1).trimEnd()}…` : first;
  const rest = first.length > MAX ? lines : lines.slice(1);
  return { title, body: rest.length ? rest.join("\n") : undefined, imageUrl, link };
}

/** "09/10/2026" + "11:36 AM" (dd/mm/yyyy, campus time) -> ISO with +05:30. */
export function noticeDate(date: string, time: string): string | null {
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date.trim());
  if (!d) return null;
  let h = 0;
  let m = 0;
  const t = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(time.trim());
  if (t) {
    h = Number(t[1]) % 12;
    m = Number(t[2]);
    if (t[3]?.toUpperCase() === "PM") h += 12;
    else if (!t[3]) h = Number(t[1]);
  }
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d[3]}-${p(Number(d[2]))}-${p(Number(d[1]))}T${p(h)}:${p(m)}:00+05:30`;
}
