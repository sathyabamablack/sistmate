import { LmsCourseSchema, type LmsCourse } from "@usp/core";
import { cleanText, parseWith } from "../shared";
import { absUrl, firstAttr, firstMatch, firstText, idFromHref, loadPage } from "./dom";
import { MY_COURSES } from "./selectors";

export interface HtmlCoursesOptions {
  /** Site root (e.g. "https://lms.example.edu") used to absolutise URLs. */
  baseUrl?: string;
}

const COURSE_PATH = "course/view.php";

function parsePercent(text: string | undefined, requirePercentSign = false): number | null {
  if (text === undefined) return null;
  const re = requirePercentSign ? /(\d{1,3}(?:\.\d+)?)\s*%/ : /(\d{1,3}(?:\.\d+)?)/;
  const m = re.exec(text);
  if (!m || m[1] === undefined) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Parse a course list page into canonical courses. Strategies, first that
 * yields anything wins:
 *   1. course cards  (my/courses.php, dashboard — saved after JS ran)
 *   2. coursebox list (course/index.php, front page)
 *   3. any course/view.php?id= link inside the main region
 * Duplicates (same id) are dropped. Returns [] when nothing is found.
 */
export function parseMyCourses(html: string, opts: HtmlCoursesOptions = {}): LmsCourse[] {
  const $ = loadPage(html, { stripHidden: true });
  const byId = new Map<number, LmsCourse>();
  const courseUrl = (id: number, href?: string): string | undefined =>
    absUrl(href, opts.baseUrl) ?? (opts.baseUrl ? absUrl(`course/view.php?id=${id}`, opts.baseUrl) : undefined);

  const add = (course: LmsCourse): void => {
    if (byId.has(course.id)) return;
    byId.set(course.id, parseWith(LmsCourseSchema, course, "html.parseMyCourses(canonical)"));
  };

  // 1. Cards
  const cards = firstMatch(MY_COURSES.card, (s) => $(s));
  cards?.each((_, el) => {
    const card = $(el);
    const link = card.find(`a[href*='${COURSE_PATH}']`).first().attr("href");
    const idText = firstAttr(MY_COURSES.cardIdAttr, (a) => card.attr(a));
    const id = idText && /^\d+$/.test(idText) ? Number(idText) : idFromHref(link, COURSE_PATH);
    if (id === undefined) return;

    const fullName = firstText(MY_COURSES.cardFullName, (s) => card.find(s).first().text());
    if (!fullName) return;
    const shortName = firstText(MY_COURSES.cardShortName, (s) => card.find(s).first().text());
    const category = firstText(MY_COURSES.cardCategory, (s) => card.find(s).first().text());

    let progress = parsePercent(
      card.find(MY_COURSES.cardProgressAttr.selector).first().attr(MY_COURSES.cardProgressAttr.attr),
    );
    if (progress === null) {
      const progressText = firstText(MY_COURSES.cardProgressText, (s) => card.find(s).first().text());
      progress = progressText ? parsePercent(progressText, true) : null;
    }

    add({
      id,
      shortName: shortName || fullName,
      fullName,
      progress,
      category: category || undefined,
      url: courseUrl(id, link),
    });
  });
  if (byId.size > 0) return [...byId.values()];

  // 2. Coursebox list
  const boxes = firstMatch(MY_COURSES.coursebox, (s) => $(s));
  boxes?.each((_, el) => {
    const box = $(el);
    const nameLink = firstMatch(MY_COURSES.courseboxName, (s) => box.find(s))?.first();
    const href = nameLink?.attr("href");
    const idText = firstAttr(MY_COURSES.courseboxIdAttr, (a) => box.attr(a));
    const id = idText && /^\d+$/.test(idText) ? Number(idText) : idFromHref(href, COURSE_PATH);
    const fullName = cleanText(nameLink?.text());
    if (id === undefined || !fullName) return;
    const category = firstText(MY_COURSES.courseboxCategory, (s) => box.find(s).first().text());
    add({
      id,
      shortName: fullName,
      fullName,
      progress: null,
      category: category || undefined,
      url: courseUrl(id, href),
    });
  });
  if (byId.size > 0) return [...byId.values()];

  // 3. Generic links
  const links = firstMatch(MY_COURSES.genericCourseLinks, (s) => $(s));
  links?.each((_, el) => {
    const a = $(el);
    const href = a.attr("href");
    const id = idFromHref(href, COURSE_PATH);
    const fullName = cleanText(a.text());
    if (id === undefined || !fullName) return;
    add({ id, shortName: fullName, fullName, progress: null, url: courseUrl(id, href) });
  });
  return [...byId.values()];
}
