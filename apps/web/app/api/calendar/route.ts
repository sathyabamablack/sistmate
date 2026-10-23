import { NextResponse } from "next/server";
import { getDashboardData, NotSignedInError } from "@/lib/data";
import { buildCalendar } from "@/lib/ics";

// Portal round-trips can be slow; stay within the free plan's limits.
export const maxDuration = 30;

/**
 * Downloads the timetable (weekly recurring classes) and upcoming deadlines as
 * an .ics file for Google Calendar / Apple Calendar / Outlook import.
 */
export async function GET() {
  let data;
  try {
    data = await getDashboardData();
  } catch (err) {
    if (err instanceof NotSignedInError) {
      return NextResponse.json(
        { error: err.expired ? "Session expired. Sign in again." : "Unauthorized" },
        { status: 401 },
      );
    }
    throw err;
  }

  const ics = buildCalendar(data, { now: new Date() });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="timetable-and-deadlines.ics"',
      // Personal data: never cache in shared caches or the browser.
      "Cache-Control": "private, no-store",
    },
  });
}
