import { CAMPUS_TZ, campusClock } from "./utils";

export type NoticeGroupKey = "today" | "yesterday" | "week" | "earlier";

const GROUP_LABELS: Record<NoticeGroupKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This week",
  earlier: "Earlier",
};

export function noticeGroupKey(iso: string, now: Date): NoticeGroupKey {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "earlier";
  const ago = Math.round((campusClock(now).dayStamp - campusClock(d).dayStamp) / 86_400_000);
  if (ago <= 0) return "today"; // portal clock skew must not push a notice into the future
  if (ago === 1) return "yesterday";
  if (ago < 7) return "week";
  return "earlier";
}

/** Groups items (already sorted newest first) by campus day buckets, dropping empty buckets. */
export function groupNotices<T extends { date: string }>(
  items: T[],
  now: Date,
): { key: NoticeGroupKey; label: string; items: T[] }[] {
  const buckets = new Map<NoticeGroupKey, T[]>();
  for (const item of items) {
    const key = noticeGroupKey(item.date, now);
    const list = buckets.get(key);
    if (list) list.push(item);
    else buckets.set(key, [item]);
  }
  return (["today", "yesterday", "week", "earlier"] as const)
    .filter((k) => buckets.has(k))
    .map((k) => ({ key: k, label: GROUP_LABELS[k], items: buckets.get(k)! }));
}

export type TextSegment =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;

/** Trailing punctuation belongs to the sentence, not the URL; so does an unbalanced ")". */
function trimUrl(raw: string): string {
  let url = raw;
  for (;;) {
    const last = url.at(-1);
    if (last && ".,;:!?]}".includes(last)) url = url.slice(0, -1);
    else if (last === ")" && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0))
      url = url.slice(0, -1);
    else return url;
  }
}

/** Splits plain text into text and http(s) link segments. Never produces HTML. */
export function linkify(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  let cursor = 0;
  for (const m of text.matchAll(URL_RE)) {
    const url = trimUrl(m[0]);
    if (/^(?:https?:\/\/|www\.)$/i.test(url)) continue;
    const start = m.index ?? 0;
    if (start > cursor) out.push({ type: "text", value: text.slice(cursor, start) });
    out.push({
      type: "link",
      value: url,
      href: /^www\./i.test(url) ? `https://${url}` : url,
    });
    cursor = start + url.length;
  }
  if (cursor < text.length) out.push({ type: "text", value: text.slice(cursor) });
  return out;
}

const FILE_EXT = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|csv|txt|png|jpe?g)$/i;

export interface LinkInfo {
  isFile: boolean;
  host: string;
  /** decoded file name for attachments */
  fileName?: string;
}

export function describeLink(url: string): LinkInfo {
  try {
    const u = new URL(url);
    const isFile = FILE_EXT.test(u.pathname) || /\/DocumentStorage/i.test(u.pathname);
    let last = u.pathname.split("/").filter(Boolean).at(-1) ?? "";
    try {
      last = decodeURIComponent(last);
    } catch {
      // keep the raw segment
    }
    return {
      isFile,
      host: u.hostname.replace(/^www\./, ""),
      fileName: isFile && last ? last : undefined,
    };
  } catch {
    return { isFile: false, host: url };
  }
}

const TIME_FMT = new Intl.DateTimeFormat("en-IN", {
  timeZone: CAMPUS_TZ,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const DAY_MONTH_FMT = new Intl.DateTimeFormat("en-IN", {
  timeZone: CAMPUS_TZ,
  day: "numeric",
  month: "short",
});
const WEEKDAY_FMT = new Intl.DateTimeFormat("en-IN", { timeZone: CAMPUS_TZ, weekday: "short" });
const YEAR_FMT = new Intl.DateTimeFormat("en-IN", { timeZone: CAMPUS_TZ, year: "numeric" });

const time12 = (d: Date) => TIME_FMT.format(d).replace(/\s?([AP]M)/i, (_, m: string) => ` ${m.toLowerCase()}`);

/** "Posted 9 Oct, 11:21 am" (adds the year when it is not the current one). */
export function formatPosted(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const year = YEAR_FMT.format(d) !== YEAR_FMT.format(now) ? ` ${YEAR_FMT.format(d)}` : "";
  return `Posted ${DAY_MONTH_FMT.format(d)}${year}, ${time12(d)}`;
}

/** Compact timestamp for a feed row, shaped by the group it sits in. */
export function formatStamp(iso: string, key: NoticeGroupKey): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (key === "today" || key === "yesterday") return time12(d);
  if (key === "week") return `${WEEKDAY_FMT.format(d)}, ${time12(d)}`;
  return `${DAY_MONTH_FMT.format(d)}, ${time12(d)}`;
}
