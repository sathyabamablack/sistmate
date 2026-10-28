import type { Metadata } from "next";
import { addDays } from "@usp/core";
import { HOURLY_DAYS, requireDashboardData } from "@/lib/data";
import { getPrefs } from "@/lib/prefs-server";
import { campusToday } from "@/lib/attendance-range";
import { isStaleIssue } from "@/lib/issues";
import { PageHeader } from "@/components/ui/PageHeader";
import { OdTracker } from "@/components/od/OdTracker";

export const metadata: Metadata = { title: "OD and medical leave" };
export const dynamic = "force-dynamic";

/**
 * OD and medical leave tracker. Entries are saved in the browser; the page brings the
 * ERP's last 14 days of hour-wise attendance (the dashboard's section), and the tracker
 * asks /api/attendance/hourly for older dates when an entry needs them.
 */
export default async function OdPage() {
  const [data, prefs] = await Promise.all([requireDashboardData(), getPrefs()]);
  const today = campusToday();
  const hourlyFailed = data.issues.some((i) => i.section === "hourly-attendance" && !isStaleIssue(i));

  return (
    <div>
      <PageHeader
        title="OD and leave"
        description="Log the hours you missed on duty or on leave. Each visit checks whether the ERP has marked them present yet."
      />
      <OdTracker
        today={today}
        timetable={data.timetable}
        hourly={data.hourlyAttendance}
        windowFrom={hourlyFailed ? null : addDays(today, -(HOURLY_DAYS - 1))}
        subjects={data.attendance.map(({ code, title, attended, totalClasses }) => ({
          code,
          title,
          attended,
          totalClasses,
        }))}
        threshold={prefs.attendanceThreshold}
        timeFormat={prefs.timeFormat}
        student={{ name: data.profile.name, registerNumber: data.profile.registerNumber }}
      />
    </div>
  );
}
