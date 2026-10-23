import type { Assignment, CalendarEvent } from "@usp/core";
import { daysUntil } from "./utils";

/** "Due: Lab 4 — Dynamic Programming" -> "lab 4 dynamic programming" */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^\s*(due|deadline)\s*[:\-–—]\s*/, "")
    .replace(/\s+(is\s+)?due\s*$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Moodle repeats assignment deadlines in its calendar under a different title
 * ("Due: Lab 4 — …"). Same link, or same name on the same day = duplicate.
 */
export function isDuplicateDeadline(ev: CalendarEvent, assignments: Assignment[]): boolean {
  if (ev.type !== "assignment") return false;
  const x = normalizeTitle(ev.title);
  return assignments.some((a) => {
    if (ev.url && a.url && ev.url === a.url) return true;
    if (!a.dueDate || daysUntil(ev.date, new Date(a.dueDate)) !== 0) return false;
    const y = normalizeTitle(a.name);
    return x.length > 0 && y.length > 0 && (x.startsWith(y) || y.startsWith(x));
  });
}
