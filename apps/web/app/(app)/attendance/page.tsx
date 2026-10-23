import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { AlertCircle } from "lucide-react";
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
import { PeriodBody, PeriodScope, PeriodSelect } from "@/components/attendance/PeriodPicker";
import { TodayAttendance } from "@/components/attendance/TodayAttendance";
import { WeekPlanner } from "@/components/attendance/WeekPlanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Section } from "@/components/ui/Section";

export const metadata: Metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";

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

  // The ERP's own per-date records: today's two verdicts, the month, the last two weeks by hour.
  const dayByDay = (
    <>
      <Section id="todays-attendance" title="Today's attendance" tour="todays-attendance">
        <TodayAttendance
          daily={today.daily}
          hourly={today.hourly}
          dateLabel={formatLongDay(today.today)}
          checkedAt={now.toISOString()}
          timeFormat={prefs.timeFormat}
        />
      </Section>

      <PeriodScope>
        <Section
          id="daily-attendance"
          title="Daily attendance"
          action={
            <PeriodSelect
              param={DAILY_PARAM}
              value={dailyPeriod}
              defaultValue={DEFAULT_DAILY_PERIOD}
              options={DAILY_PERIOD_OPTIONS}
              label="Period for daily attendance"
            />
          }
        >
          <PeriodBody>
            <DailyCalendar view={dailyView} today={today.today} />
          </PeriodBody>
        </Section>
      </PeriodScope>

      <PeriodScope>
        <Section
          id="hourly-attendance"
          title="Hour-wise by day"
          action={
            <PeriodSelect
              param={HOURLY_PARAM}
              value={hourlyPeriod}
              defaultValue={DEFAULT_HOURLY_PERIOD}
              options={HOURLY_PERIOD_OPTIONS}
              label="Period for hour-wise attendance"
            />
          }
        >
          <PeriodBody>
            <HourlyPeriod view={hourlyView} timetable={data.timetable} today={today.today} />
          </PeriodBody>
        </Section>
      </PeriodScope>
    </>
  );

  return (
    <div>
      <PageHeader title="Attendance" />

      {data.attendance.length > 0 ? (
        <div className="space-y-8">
          <Panel className="enter flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
            <ProgressRing
              value={total > 0 ? overall.percentage : 0}
              size={148}
              stroke={12}
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
                <p className="font-display text-title font-semibold tabular-nums text-foreground">
                  {overallText}
                </p>
                <p className="text-micro text-muted-foreground">Overall</p>
              </div>
            </ProgressRing>

            <div className="min-w-0 space-y-2">
              <p className="font-display text-heading font-semibold text-foreground">
                {total > 0 ? advice.long : "No hours recorded yet."}
              </p>
              {total > 0 ? (
                <p className="text-body tabular-nums text-muted-foreground">
                  {attended} of {total} hours
                </p>
              ) : null}
            </div>
          </Panel>

          {below.length > 0 ? (
            <Panel tone="danger" className="enter flex items-start gap-3" style={{ "--i": 1 } as CSSProperties}>
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
              <p className="text-body text-foreground">
                <span className="font-semibold">
                  {below.length} {below.length === 1 ? "subject is" : "subjects are"} below {threshold}%:
                </span>{" "}
                {below.map((s) => s.title).join(", ")}.
              </p>
            </Panel>
          ) : null}

          {dayByDay}

          <Section id="subjects" title="By subject">
            <AttendanceTable variant="full" subjects={subjects} threshold={threshold} />
          </Section>

          <Section id="plan" title="Plan your week">
            <WeekPlanner
              subjects={subjects.map((s) => ({
                code: s.code,
                title: s.title,
                attended: s.attended,
                total: s.totalClasses,
              }))}
              slots={plan.slots}
              days={plan.days}
              todayIndex={plan.nextWeek ? null : clock.dayIndex}
              threshold={threshold}
              timeFormat={prefs.timeFormat}
            />
          </Section>
        </div>
      ) : (
        <div className="space-y-8">
          <EmptyState title="No attendance yet" description="Nothing marked for this term." />
          {dayByDay}
        </div>
      )}
    </div>
  );
}
