import type { Metadata } from "next";
import { AlertCircle, ArrowRight } from "lucide-react";
import { overallAttendance } from "@usp/core";
import { requireDashboardData } from "@/lib/data";
import { getPrefs } from "@/lib/prefs-server";
import { campusClock } from "@/lib/utils";
import { formatLongDay, todayVerdicts } from "@/lib/attendance-days";
import { getAttendancePeriod } from "@/lib/attendance-period";
import {
  DAILY_PARAM,
  DAILY_PERIOD_OPTIONS,
  DEFAULT_DAILY_PERIOD,
  DEFAULT_HOURLY_PERIOD,
  HOURLY_PARAM,
  HOURLY_PERIOD_OPTIONS,
  dailyViewFromDashboard,
  hourlyViewFromDashboard,
  parseDailyPeriod,
  parseHourlyPeriod,
} from "@/lib/attendance-range";
import { buildWeekPlan } from "@/lib/week-plan";
import { attendanceAdvice, formatPct } from "@/lib/attendance";
import { AttendanceTable } from "@/components/dashboard/AttendanceTable";
import { DailyCalendar } from "@/components/attendance/DailyCalendar";
import { HourlyPeriod } from "@/components/attendance/HourlyByDay";
import { LeavePlanner } from "@/components/attendance/LeavePlanner";
import { PeriodBody, PeriodScope, PeriodSelect } from "@/components/attendance/PeriodPicker";
import { Tabs } from "@/components/attendance/Tabs";
import { TodayAttendance } from "@/components/attendance/TodayAttendance";
import { WeekPlanner } from "@/components/attendance/WeekPlanner";
import Link from "@/components/ui/IntentLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Section } from "@/components/ui/Section";

export const metadata: Metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";

/**
 * Attendance, most-checked first: the overall figure, each subject with what it
 * can spare, the planner (this week, or a leave), then the ERP's own day-by-day
 * records in tabs. `?days=` / `?hours=` pick the records' periods and open their tab.
 */
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[]; hours?: string | string[] }>;
}) {
  const params = await searchParams;
  const dailyPeriod = parseDailyPeriod(params.days);
  const hourlyPeriod = parseHourlyPeriod(params.hours);
  const [data, prefs, period] = await Promise.all([
    requireDashboardData(),
    getPrefs(),
    getAttendancePeriod(dailyPeriod, hourlyPeriod),
  ]);
  const threshold = prefs.attendanceThreshold;
  const now = new Date();
  const clock = campusClock(now);
  const today = todayVerdicts(data, now);
  // A non-default period is read on its own; the defaults reuse the dashboard's sections.
  const dailyView = period.daily ?? dailyViewFromDashboard(data, today.today);
  const hourlyView = period.hourly ?? hourlyViewFromDashboard(data, today.today);
  const plan = buildWeekPlan(data.timetable, clock);
  const attended = data.attendance.reduce((s, x) => s + x.attended, 0);
  const total = data.attendance.reduce((s, x) => s + x.totalClasses, 0);
  const overall = overallAttendance(data.attendance);
  const advice = attendanceAdvice(attended, total, threshold);

  const subjects = [...data.attendance].sort((a, b) => {
    if ((a.totalClasses === 0) !== (b.totalClasses === 0)) return a.totalClasses === 0 ? 1 : -1;
    return a.percentage - b.percentage;
  });
  const below = subjects.filter((s) => s.totalClasses > 0 && s.percentage < threshold);
  const overallText = total > 0 ? formatPct(overall.percentage) : "—";
  const planSubjects = subjects.map((s) => ({
    code: s.code,
    title: s.title,
    attended: s.attended,
    total: s.totalClasses,
  }));

  // A period in the URL opens its tab; otherwise today's comes first.
  const recordsTab =
    params.days !== undefined ? "daily-attendance" : params.hours !== undefined ? "hourly-attendance" : "todays-attendance";

  // The ERP's own per-date records: today's two verdicts, the month by day, recent days by hour.
  const records = (
    <Section id="records" title="Day by day" className="scroll-mt-20">
      <Tabs
        label="Attendance records"
        initial={recordsTab}
        items={[
          {
            id: "todays-attendance",
            label: "Today",
            tour: "todays-attendance",
            content: (
              <TodayAttendance
                daily={today.daily}
                hourly={today.hourly}
                dateLabel={formatLongDay(today.today)}
                checkedAt={now.toISOString()}
                timeFormat={prefs.timeFormat}
              />
            ),
          },
          {
            id: "daily-attendance",
            label: "Daily",
            content: (
              <PeriodScope>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <h3 className="text-subheading font-semibold text-foreground">Daily attendance</h3>
                  <PeriodSelect
                    param={DAILY_PARAM}
                    value={dailyPeriod}
                    defaultValue={DEFAULT_DAILY_PERIOD}
                    options={DAILY_PERIOD_OPTIONS}
                    label="Period for daily attendance"
                  />
                </div>
                <PeriodBody>
                  <DailyCalendar view={dailyView} today={today.today} />
                </PeriodBody>
              </PeriodScope>
            ),
          },
          {
            id: "hourly-attendance",
            label: "Hour-wise",
            content: (
              <PeriodScope>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <h3 className="text-subheading font-semibold text-foreground">Hour-wise by day</h3>
                  <PeriodSelect
                    param={HOURLY_PARAM}
                    value={hourlyPeriod}
                    defaultValue={DEFAULT_HOURLY_PERIOD}
                    options={HOURLY_PERIOD_OPTIONS}
                    label="Period for hour-wise attendance"
                  />
                </div>
                <PeriodBody>
                  <HourlyPeriod view={hourlyView} timetable={data.timetable} today={today.today} />
                </PeriodBody>
              </PeriodScope>
            ),
          },
        ]}
      />
    </Section>
  );

  return (
    <div>
      <PageHeader title="Attendance" />

      {data.attendance.length > 0 ? (
        <div className="space-y-10">
          <Panel className="enter">
            <div className="flex items-center gap-4 sm:gap-6">
              <ProgressRing
                value={total > 0 ? overall.percentage : 0}
                size={104}
                stroke={9}
                tone={advice.tone === "none" ? "primary" : advice.tone}
                markAt={threshold}
                label={
                  total > 0
                    ? `Overall attendance ${overallText}, the tick marks ${threshold}%`
                    : "Overall attendance, no hours recorded"
                }
                className="shrink-0"
              >
                <div className="leading-tight">
                  <p className="font-display text-heading font-semibold tabular-nums text-foreground">{overallText}</p>
                  <p className="text-micro text-muted-foreground">Overall</p>
                </div>
              </ProgressRing>

              <div className="min-w-0 space-y-1">
                <p className="font-display text-subheading font-semibold text-foreground sm:text-heading">
                  {total > 0 ? advice.long : "No hours recorded yet."}
                </p>
                {total > 0 ? (
                  <p className="text-small tabular-nums text-muted-foreground sm:text-body">
                    {attended} of {total} hours
                  </p>
                ) : null}
              </div>
            </div>

            {below.length > 0 ? (
              <p className="mt-4 flex items-start gap-2.5 border-t border-border pt-4 text-body text-foreground">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
                <span>
                  <span className="font-semibold">
                    {below.length} {below.length === 1 ? "subject is" : "subjects are"} below {threshold}%:
                  </span>{" "}
                  {below.map((s) => s.title).join(", ")}.
                </span>
              </p>
            ) : null}
          </Panel>

          <Section id="subjects" title="By subject">
            <AttendanceTable variant="full" subjects={subjects} threshold={threshold} />
            <Link
              href="/attendance/od"
              className="focusable mt-2 inline-flex min-h-11 items-center gap-1 rounded-md text-small text-muted-foreground hover:text-foreground lg:min-h-9"
            >
              OD or medical leave not updated in the ERP?
              <span className="inline-flex items-center gap-0.5 font-semibold text-primary">
                Track it
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </span>
            </Link>
          </Section>

          <Section id="plan" title="Plan ahead" className="scroll-mt-20">
            <Tabs
              label="Plan for"
              items={[
                {
                  id: "plan-week",
                  label: "This week",
                  content: (
                    <WeekPlanner
                      subjects={planSubjects}
                      slots={plan.slots}
                      days={plan.days}
                      todayIndex={plan.nextWeek ? null : clock.dayIndex}
                      threshold={threshold}
                      timeFormat={prefs.timeFormat}
                    />
                  ),
                },
                {
                  id: "plan-leave",
                  label: "A leave",
                  content: (
                    <LeavePlanner
                      subjects={planSubjects}
                      slots={plan.slots}
                      today={today.today}
                      minutes={clock.minutes}
                      threshold={threshold}
                    />
                  ),
                },
              ]}
            />
          </Section>

          {records}
        </div>
      ) : (
        <div className="space-y-10">
          <EmptyState title="No attendance yet" description="Nothing marked for this term." />
          {records}
        </div>
      )}
    </div>
  );
}
