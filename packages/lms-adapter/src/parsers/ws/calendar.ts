import { z } from "zod";
import { CalendarEventSchema, type CalendarEvent } from "@usp/core";
import { moduleToEventType, parseWith, stripHtml, unixToIso } from "../shared";
import { parseWsError } from "./wsError";

/**
 * Event object shared by
 *   - core_calendar_get_action_events_by_timesort   (deadlines needing action)
 *   - core_calendar_get_calendar_upcoming_view       (everything upcoming)
 */
export const RawCalendarEventSchema = z
  .object({
    id: z.coerce.number().int(),
    name: z.string(),
    description: z.string().nullish(),
    /** UNIX seconds. */
    timestart: z.coerce.number(),
    timeduration: z.coerce.number().optional(),
    timesort: z.coerce.number().optional(),
    /** "assign", "quiz", ... absent for course/site/user events. */
    modulename: z.string().nullish(),
    /** Frankenstyle, e.g. "mod_assign" (newer Moodle). */
    component: z.string().nullish(),
    /** "due", "close", "open", "course", "site", "user", "group", ... */
    eventtype: z.string(),
    instance: z.coerce.number().nullish(),
    course: z
      .object({
        id: z.coerce.number().optional(),
        fullname: z.string().optional(),
        shortname: z.string().optional(),
      })
      .passthrough()
      .nullish(),
    /** Activity URL (action events) */
    url: z.string().nullish(),
    /** Calendar day-view URL */
    viewurl: z.string().nullish(),
    action: z
      .object({
        name: z.string().optional(),
        url: z.string().optional(),
        actionable: z.boolean().optional(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();
export type RawCalendarEvent = z.infer<typeof RawCalendarEventSchema>;

export const RawCalendarEventsResponseSchema = z
  .object({
    events: z.array(RawCalendarEventSchema),
    firstid: z.coerce.number().optional(),
    lastid: z.coerce.number().optional(),
  })
  .passthrough();

/** Canonical id used by both WS and HTML calendar parsers (enables de-duplication). */
export function lmsEventId(moodleEventId: number | string): string {
  return `lms-event-${moodleEventId}`;
}

/**
 * Action-events / upcoming-view response → canonical `CalendarEvent[]`.
 * Events are de-duplicated by Moodle event id; events without a start time are dropped.
 */
export function mapCalendarEvents(json: unknown): CalendarEvent[] {
  parseWsError(json);
  const raw = parseWith(RawCalendarEventsResponseSchema, json, "ws.mapCalendarEvents");

  const seen = new Set<number>();
  const out: CalendarEvent[] = [];
  for (const e of raw.events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);

    const date = unixToIso(e.timestart);
    if (!date) continue;

    const courseName = e.course?.fullname ? stripHtml(e.course.fullname) : undefined;
    const url = e.url || e.action?.url || e.viewurl || undefined;

    const event: CalendarEvent = {
      id: lmsEventId(e.id),
      title: stripHtml(e.name),
      date,
      source: "lms",
      courseName,
      type: moduleToEventType(e.modulename ?? e.component),
      url,
    };
    out.push(parseWith(CalendarEventSchema, event, "ws.mapCalendarEvents(canonical)"));
  }
  return out;
}
