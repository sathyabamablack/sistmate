import Link from "@/components/ui/IntentLink";
import type { DashboardData } from "@usp/core";
import { todayChipText, todayVerdicts } from "@/lib/attendance-days";
import { toneIcon } from "@/components/attendance/status";

/**
 * One line in the dashboard's Today panel: the ERP's day-wise verdict and the
 * hours entered so far, linking to both in full on the Attendance page.
 */
export function TodayAttendanceChip({
  data,
}: {
  data: Pick<DashboardData, "dailyAttendance" | "hourlyAttendance" | "timetable" | "issues">;
}) {
  const { daily, hourly } = todayVerdicts(data);
  const { text, tone } = todayChipText(daily, hourly);
  const { Icon } = toneIcon[tone];
  return (
    <Link
      href="/attendance#todays-attendance"
      className="focusable inline-flex min-h-11 items-center gap-2 rounded-md text-small font-semibold underline underline-offset-4 lg:min-h-0"
    >
      {/* On the accent panel the icon keeps the text colour; its shape carries the status. */}
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {text}
    </Link>
  );
}
