import { z } from "zod";
import { NotificationSchema, type Notification } from "@usp/core";
import { parseWith, stripHtml, unixToIso } from "../shared";
import { parseWsError } from "./wsError";

/** One element of `message_popup_get_popup_notifications().notifications`. */
export const RawPopupNotificationSchema = z
  .object({
    id: z.coerce.number().int(),
    useridfrom: z.coerce.number().optional(),
    useridto: z.coerce.number().optional(),
    subject: z.string(),
    shortenedsubject: z.string().optional(),
    text: z.string().nullish(),
    fullmessage: z.string().nullish(),
    fullmessageformat: z.coerce.number().optional(),
    fullmessagehtml: z.string().nullish(),
    smallmessage: z.string().nullish(),
    contexturl: z.string().nullish(),
    contexturlname: z.string().nullish(),
    /** UNIX seconds. */
    timecreated: z.coerce.number(),
    timecreatedpretty: z.string().optional(),
    timeread: z.coerce.number().nullish(),
    read: z.boolean().optional(),
    deleted: z.boolean().optional(),
    iconurl: z.string().optional(),
    component: z.string().nullish(),
    eventtype: z.string().nullish(),
    customdata: z.string().nullish(),
  })
  .passthrough();
export type RawPopupNotification = z.infer<typeof RawPopupNotificationSchema>;

export const RawPopupNotificationsResponseSchema = z
  .object({
    notifications: z.array(RawPopupNotificationSchema),
    unreadcount: z.coerce.number().optional(),
  })
  .passthrough();

/** `message_popup_get_popup_notifications` → canonical `Notification[]` (HTML stripped). */
export function mapNotifications(json: unknown): Notification[] {
  parseWsError(json);
  const raw = parseWith(RawPopupNotificationsResponseSchema, json, "ws.mapNotifications");

  return raw.notifications.map((n) => {
    // Prefer the short form; fall back through the longer variants.
    const bodySource = [n.smallmessage, n.fullmessage, n.text, n.fullmessagehtml].find(
      (s): s is string => typeof s === "string" && stripHtml(s) !== "",
    );
    const body = bodySource !== undefined ? stripHtml(bodySource) : undefined;

    const notification: Notification = {
      id: `lms-notif-${n.id}`,
      title: stripHtml(n.subject),
      body,
      date: unixToIso(n.timecreated) ?? new Date(0).toISOString(),
      source: "lms",
      url: n.contexturl || undefined,
      read: n.read ?? (typeof n.timeread === "number" && n.timeread > 0),
    };
    return parseWith(NotificationSchema, notification, "ws.mapNotifications(canonical)");
  });
}
