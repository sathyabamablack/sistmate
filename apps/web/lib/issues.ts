/**
 * Helpers for telling the two kinds of `DashboardData.issues` apart.
 *
 * The core schema only has `{ section, source, message }`, so a "stale" notice
 * (the section failed to refresh, so older saved data is shown) is a normal
 * issue whose message starts with {@link STALE_ISSUE_PREFIX}. A failed section
 * has any other message and an empty fallback. Pure module: safe in server and
 * client components.
 */

export const STALE_ISSUE_PREFIX = "Showing data saved at ";

const CAMPUS_TZ = "Asia/Kolkata";

interface IssueLike {
  section: string;
  source: "erp" | "lms";
  message: string;
}

/** "Showing data saved at 9:12 pm" (campus time, lowercase am/pm). */
export function staleIssueMessage(savedAt: Date | number): string {
  const time = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: CAMPUS_TZ,
  })
    .format(savedAt)
    .replace(/\s?([ap])m$/i, (_, letter: string) => ` ${letter.toLowerCase()}m`);
  return `${STALE_ISSUE_PREFIX}${time}`;
}

/** The section loaded from an older saved copy because the refresh failed. Nothing is missing. */
export function isStaleIssue(issue: Pick<IssueLike, "message">): boolean {
  return issue.message.startsWith(STALE_ISSUE_PREFIX);
}

/** Splits issues into sections that show older saved data and sections that are empty because loading failed. */
export function splitIssues<T extends Pick<IssueLike, "message">>(issues: readonly T[]): { stale: T[]; failed: T[] } {
  const stale: T[] = [];
  const failed: T[] = [];
  for (const issue of issues) (isStaleIssue(issue) ? stale : failed).push(issue);
  return { stale, failed };
}
