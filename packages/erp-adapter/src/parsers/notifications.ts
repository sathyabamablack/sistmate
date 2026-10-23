import * as cheerio from "cheerio";
import { NotificationSchema, type Notification } from "@usp/core";
import { ParseError, validate } from "./errors";
import { DEFAULT_SELECTORS, type ErpSelectors } from "./selectors";
import { cellLines, cleanText, findTables, optText, readRows, resolveUrl, stableHash, toIsoDateTime } from "./table";

export interface NotificationsParseOptions {
  selectors?: ErpSelectors;
  /** Resolve relative notice links against this (e.g. "https://erp.example.edu/"). */
  baseUrl?: string;
}

/** Stable id from title + date, so the same notice keeps its id across fetches. */
export function notificationId(title: string, isoDate: string): string {
  return `erp-${stableHash(`${cleanText(title)}|${isoDate}`)}`;
}

/**
 * Notice board -> Notification[] (source "erp").
 *
 * Item layout: each `notifications.item` inside `notifications.container`
 * gives title / date / body / link via the configured sub-selectors. If no
 * items are found, a notices TABLE (title + date columns) is tried. An
 * existing but empty board returns []; a missing board throws ParseError.
 * `read` is false when the item carries the "new"/unread marker.
 */
export function parseNotifications(html: string, opts: NotificationsParseOptions = {}): Notification[] {
  const sel = opts.selectors ?? DEFAULT_SELECTORS;
  const cfg = sel.notifications;
  const tz = sel.timezoneOffset;
  const $ = cheerio.load(html);
  const board = $(cfg.container);

  const make = (title: string, dateText: string, body: string | undefined, href: string | undefined, read: boolean): Notification => {
    const date = toIsoDateTime(dateText, tz);
    if (!date) throw new ParseError("notifications", `notice "${title}": could not read a date from "${dateText}"`);
    const n: Record<string, unknown> = { id: notificationId(title, date), title, date, source: "erp", read };
    if (body) n.body = body;
    const url = resolveUrl(href, opts.baseUrl);
    if (url) n.url = url;
    return validate("notifications", NotificationSchema, n);
  };

  // 1) item layout
  const items = board.find(cfg.item).toArray();
  if (items.length > 0) {
    const out: Notification[] = [];
    for (const el of items) {
      const item = $(el);
      const titleEl = item.find(cfg.title).first();
      const title = cleanText(titleEl.text());
      if (!title) continue;
      const dateEl = item.find(cfg.date).first();
      const dateText = cleanText(dateEl.attr("datetime") ?? dateEl.text()) || cleanText(item.text());
      const bodyEl = item.find(cfg.body).first();
      const body = bodyEl.length > 0 ? optText(cellLines(bodyEl).join(" ")) : undefined;
      const href = (titleEl.is("a") ? titleEl : item.find(cfg.link).first()).attr("href");
      const unread = item.is(cfg.unreadSelector) || item.find(cfg.unreadSelector).length > 0;
      out.push(make(title, dateText, body, href, !unread));
    }
    return out;
  }

  // 2) table layout
  const tables = findTables($, cfg.table);
  const first = tables[0];
  if (first) {
    return readRows(first, cfg.table, { minFilled: 2 })
      .filter((row) => cleanText(row.title) !== "")
      .map((row) => make(cleanText(row.title), row.date, optText(row.body), undefined, false));
  }

  // 3) board exists but is empty -> no notices; no board at all -> page changed.
  if (board.length > 0) return [];
  throw new ParseError("notifications", `notice board not found (container "${cfg.container}")`);
}
