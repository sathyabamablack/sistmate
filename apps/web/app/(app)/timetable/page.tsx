import type { Metadata } from "next";
import { CalendarDays, CalendarPlus } from "lucide-react";
import { requireDashboardData } from "@/lib/data";
import { getPrefs } from "@/lib/prefs-server";
import { buttonClass } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { TimetableView } from "@/components/timetable/TimetableView";

export const metadata: Metadata = { title: "Timetable" };
export const dynamic = "force-dynamic";

export default async function TimetablePage() {
  const [data, prefs] = await Promise.all([requireDashboardData(), getPrefs()]);
  const slots = data.timetable;
  const failed = data.issues.some((i) => i.section === "timetable");

  return (
    <div>
      <PageHeader
        title="Timetable"
        description="Your section's week."
        actions={
          <a
            href="/api/calendar"
            download
            title="Download an .ics file with your weekly classes and upcoming deadlines. Import it into Google Calendar, Apple Calendar or Outlook."
            className={buttonClass("outline", "md")}
          >
            <CalendarPlus className="h-4 w-4 text-primary" aria-hidden />
            Add to calendar
          </a>
        }
      />

      {slots.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={failed ? "Timetable couldn't be loaded" : "No timetable published yet"}
          description={
            failed
              ? "Couldn't load the timetable. Try again in a minute."
              : "Not published for your section yet."
          }
        />
      ) : (
        <TimetableView slots={slots} nowIso={new Date().toISOString()} timeFormat={prefs.timeFormat} />
      )}
    </div>
  );
}
