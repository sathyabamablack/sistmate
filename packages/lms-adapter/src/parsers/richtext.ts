import type { Inline, RichBlock } from "@usp/core";
import { decodeEntities } from "./shared";

/**
 * Moodle HTML → a closed set of plain-data nodes (paragraphs, headings,
 * lists, quotes, code) with inline bold/italic/code/links. Nothing is ever
 * passed through as markup: unknown tags are dropped but their text is kept,
 * scripts/styles/frames and everything inside them are removed, images are
 * omitted, and only http(s)/mailto links survive.
 */

export interface RichTextOptions {
  /** Site root; resolves relative links and recognises links back into Moodle. */
  siteUrl?: string;
  /** Lets links to this course's activities point at the in-app pages. */
  courseId?: number;
}

const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|svg|template|noscript|head|video|audio|canvas|math)\b[\s\S]*?<\/\1\s*>/gi;
const TOKEN = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|<!--[\s\S]*?-->|([^<]+)|</g;
const BLOCK_TAGS = new Set([
  "p", "div", "section", "article", "header", "footer", "aside", "main", "nav", "figure",
  "figcaption", "address", "details", "summary", "dl", "dt", "dd", "table", "thead", "tbody",
  "tfoot", "tr", "caption", "fieldset", "form",
]);
const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(attrs);
  const value = m?.[1] ?? m?.[2] ?? m?.[3];
  return value === undefined ? undefined : decodeEntities(value).trim();
}

/** Returns a safe href, an in-app path, or null when the link must be dropped. */
export function safeHref(raw: string | undefined, opts: RichTextOptions = {}): string | null {
  if (!raw) return null;
  // Control characters and whitespace are how "java\tscript:" tricks get through.
  const cleaned = raw.replace(/[\u0000-\u001f\u007f\s]+/g, "");
  if (!cleaned || cleaned.startsWith("#") || cleaned.includes("@@PLUGINFILE@@")) return null;

  let url: URL;
  try {
    url = new URL(cleaned, opts.siteUrl ? `${opts.siteUrl.replace(/\/+$/, "")}/` : undefined);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "mailto:") return null;
  if (url.protocol === "mailto:") return url.href;

  if (opts.siteUrl) {
    let site: URL | undefined;
    try {
      site = new URL(opts.siteUrl);
    } catch {
      /* unusable siteUrl; treat everything as external */
    }
    if (site && url.host === site.host) {
      if (/\/(webservice\/)?pluginfile\.php\//.test(url.pathname)) return null;
      const id = Number(url.searchParams.get("id"));
      if (Number.isInteger(id) && id > 0) {
        if (/\/course\/view\.php$/.test(url.pathname)) return `/courses/${id}`;
        if (/\/mod\/assign\/view\.php$/.test(url.pathname) && opts.courseId) {
          return `/courses/${opts.courseId}/assignments/${id}`;
        }
      }
    }
  }
  return url.href;
}

interface ListFrame {
  ordered: boolean;
  items: Inline[][];
}

export function htmlToRichText(html: string | null | undefined, opts: RichTextOptions = {}): RichBlock[] {
  if (!html || !html.trim()) return [];
  const source = html.replace(DROP_WITH_CONTENT, " ");

  const blocks: RichBlock[] = [];
  let runs: Inline[] = [];
  let bold = 0;
  let italic = 0;
  let code = 0;
  let pre = 0;
  let quote = 0;
  let heading: 3 | 4 | null = null;
  const links: (string | null)[] = [];
  const lists: ListFrame[] = [];
  let preText = "";

  const pushText = (raw: string) => {
    if (pre) {
      preText += decodeEntities(raw);
      return;
    }
    const text = decodeEntities(raw).replace(/[\s ]+/g, " ");
    if (!text) return;
    const href = links[links.length - 1] ?? null;
    const run: Inline = { text };
    if (bold || heading) run.bold = true;
    if (italic) run.italic = true;
    if (code) run.code = true;
    if (href) run.href = href;
    runs.push(run);
  };

  const tidy = (list: Inline[]): Inline[] => {
    const merged: Inline[] = [];
    for (const r of list) {
      const prev = merged[merged.length - 1];
      if (
        prev &&
        prev.bold === r.bold &&
        prev.italic === r.italic &&
        prev.code === r.code &&
        prev.href === r.href
      ) {
        prev.text += r.text;
      } else {
        merged.push({ ...r });
      }
    }
    // Trim the block's edges and collapse the whitespace that tag boundaries leave behind.
    for (const r of merged) r.text = r.text.replace(/ ?\n ?/g, "\n").replace(/ {2,}/g, " ");
    while (merged.length && !merged[0]!.text.trim()) merged.shift();
    while (merged.length && !merged[merged.length - 1]!.text.trim()) merged.pop();
    if (merged.length) {
      merged[0]!.text = merged[0]!.text.replace(/^\s+/, "");
      const last = merged[merged.length - 1]!;
      last.text = last.text.replace(/\s+$/, "");
    }
    return merged;
  };

  const flush = () => {
    if (pre) return;
    const content = tidy(runs);
    runs = [];
    if (content.length === 0) return;
    const list = lists[lists.length - 1];
    if (list) {
      list.items.push(content);
      return;
    }
    if (heading) {
      blocks.push({ type: "heading", level: heading, content });
    } else if (quote) {
      blocks.push({ type: "quote", content });
    } else {
      blocks.push({ type: "paragraph", content });
    }
  };

  const closeList = () => {
    flush();
    const frame = lists.pop();
    if (frame && frame.items.length) blocks.push({ type: "list", ordered: frame.ordered, items: frame.items });
  };

  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(source)) !== null) {
    const [whole, closing, rawTag, attrs, text] = m;
    if (text !== undefined) {
      pushText(text);
      continue;
    }
    if (!rawTag) {
      if (whole === "<") pushText("<");
      continue;
    }
    const tag = rawTag.toLowerCase();
    const isClose = closing === "/";

    if (tag === "br") {
      if (pre) preText += "\n";
      else runs.push({ text: "\n" });
    } else if (tag === "hr") {
      flush();
    } else if (tag === "b" || tag === "strong") {
      bold = Math.max(0, bold + (isClose ? -1 : 1));
    } else if (tag === "i" || tag === "em") {
      italic = Math.max(0, italic + (isClose ? -1 : 1));
    } else if (tag === "code" || tag === "kbd" || tag === "samp" || tag === "tt") {
      code = Math.max(0, code + (isClose ? -1 : 1));
    } else if (tag === "a") {
      if (isClose) links.pop();
      else links.push(safeHref(attr(attrs ?? "", "href"), opts));
    } else if (tag === "pre") {
      if (isClose) {
        pre = Math.max(0, pre - 1);
        if (!pre) {
          const text = preText.replace(/^\n+|\s+$/g, "");
          preText = "";
          if (text) blocks.push({ type: "code", text });
        }
      } else {
        flush();
        pre += 1;
      }
    } else if (tag === "ul" || tag === "ol") {
      if (isClose) closeList();
      else {
        flush();
        lists.push({ ordered: tag === "ol", items: [] });
      }
    } else if (tag === "li") {
      flush();
    } else if (tag === "td" || tag === "th") {
      if (isClose) runs.push({ text: " · " });
    } else if (HEADINGS.has(tag)) {
      flush();
      heading = isClose ? null : tag <= "h3" ? 3 : 4;
    } else if (tag === "blockquote") {
      flush();
      quote = Math.max(0, quote + (isClose ? -1 : 1));
    } else if (tag === "p" || BLOCK_TAGS.has(tag)) {
      flush();
    }
    // Everything else (span, font, img, u, sub, ...) is ignored; its text still flows.
  }
  while (lists.length) closeList();
  if (pre && preText.trim()) blocks.push({ type: "code", text: preText.trim() });
  flush();

  return blocks.map(dropTrailingSeparators);
}

function dropTrailingSeparators(block: RichBlock): RichBlock {
  if (block.type === "paragraph" || block.type === "quote" || block.type === "heading") {
    const content = [...block.content];
    const last = content[content.length - 1];
    if (last) content[content.length - 1] = { ...last, text: last.text.replace(/\s*·\s*$/, "") };
    return { ...block, content };
  }
  return block;
}

/** Flatten rich text to one plain line (for previews, aria-labels, search). */
export function richTextToPlain(blocks: readonly RichBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "code") parts.push(b.text);
    else if (b.type === "list") for (const item of b.items) parts.push(item.map((r) => r.text).join(""));
    else parts.push(b.content.map((r) => r.text).join(""));
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
