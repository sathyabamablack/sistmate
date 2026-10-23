import { CalendarEventSchema, type CalendarEvent } from "@usp/core";
import { LmsParseError } from "../errors";
import { cleanText, moduleToEventType, parseWith } from "../shared";
import { lmsEventId } from "../ws/calendar";
import { parseMoodleDate, unixParamToIso } from "./dates";
import { absUrl, firstAttr, firstMatch, firstText, idFromHref, loadPage } from "./dom";
import { UPCOMING } from "./selectors";

export interface UpcomingOptions {
  /** Site root used to absolutise URLs. */
  baseUrl?: string;
  /** Timezone of displayed dates, used only when no `time=` link exists. Default "+05:30". */
  tzOffset?: string;
  /** Reference time for "Today"/"Tomorrow"/year-less dates (tests). */
  now?: Date;
}

/** Infer the module from an activity URL, e.g. ".../mod/quiz/view.php?id=7001" → "quiz". */
function moduleFromUrl(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const m = /\/mod\/([a-z0-9_]+)\//i.exec(href);
  return m?.[1];
}

/**
 * Parse `calendar/view.php?view=upcoming` into canonical calendar events.
 * Event ids match the WS mapper (`lms-event-<moodle id>`) so both sources
 * de-duplicate. Returns [] for "There are no upcoming events". Throws
 * `LmsParseError` if an event's date cannot be read (selector drift).
 */
export function parseUpcoming(html: string, opts: UpcomingOptions = {}): CalendarEvent[] {
  const parser = "html.parseUpcoming";
  const $ = loadPage(html, { stripHidden: true });
  const events = firstMatch(UPCOMING.event, (s) => $(s));
  if (!events) return [];

  const seen = new Set<string>();
  const out: CalendarEvent[] = [];
  events.each((index, el) => {
    const ev = $(el);

    const title =
      firstText(UPCOMING.title, (s) => ev.find(s).first().text()) ||
      cleanText(firstAttr(UPCOMING.titleAttr, (a) => ev.attr(a)));
    if (!title) return;

    const moodleId = firstAttr(UPCOMING.idAttr, (a) => ev.attr(a));
    const id = moodleId ? lmsEventId(moodleId) : `lms-event-html-${index}`;
    if (seen.has(id)) return;
    seen.add(id);

    const dayHref = firstMatch(UPCOMING.dayLink, (s) => ev.find(s))?.first().attr("href");
    const date =
      unixParamToIso(dayHref, UPCOMING.dayLinkTimeParam) ??
      parseMoodleDate(
        firstText(UPCOMING.dateText, (s) => ev.find(s).first().text()),
        { tzOffset: opts.tzOffset, now: opts.now },
      );
    if (!date) {
      throw new LmsParseError(parser, `Cannot read date for event "${title}" (check UPCOMING.dayLink / dateText).`);
    }

    const courseIdAttr = firstAttr(UPCOMING.courseIdAttr, (a) => ev.attr(a));
    const courseLink = firstMatch(UPCOMING.courseLink, (s) => ev.find(s))?.first();
    const courseLinkId = idFromHref(courseLink?.attr("href"), "course/view.php");
    const isSiteEvent =
      courseIdAttr === UPCOMING.siteCourseId || String(courseLinkId) === UPCOMING.siteCourseId;
    const courseName = !isSiteEvent && courseLink ? cleanText(courseLink.text()) || undefined : undefined;

    const activityHref = firstMatch(UPCOMING.activityLink, (s) => ev.find(s))?.first().attr("href");
    const component = firstAttr(UPCOMING.componentAttr, (a) => ev.attr(a));

    const event: CalendarEvent = {
      id,
      title,
      date,
      source: "lms",
      courseName,
      type: moduleToEventType(component ?? moduleFromUrl(activityHref)),
      url: absUrl(activityHref ?? courseLink?.attr("href"), opts.baseUrl),
    };
    out.push(parseWith(CalendarEventSchema, event, `${parser}(canonical)`));
  });
  return out;
}
