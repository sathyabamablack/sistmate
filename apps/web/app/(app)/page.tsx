import Link from "@/components/ui/IntentLink";
import { overallAttendance, hasGrades, computeCgpa } from "@usp/core";
import type { CalendarEvent, DashboardData } from "@usp/core";
import { requireDashboardData } from "@/lib/data";
import { dataSource, getSession } from "@/lib/session";
import { erpSubjects, visibleCourses } from "@/lib/course-names";
import { getPrefs } from "@/lib/prefs-server";
import type { DashboardSection } from "@/lib/prefs";
import { ConnectMoodleCard } from "@/components/dashboard/ConnectMoodleCard";
import { AttendanceTable } from "@/components/dashboard/AttendanceTable";
import { ClassCountdown } from "@/components/dashboard/ClassCountdown";
import { TourCard } from "@/components/dashboard/TourCard";
import { BlackStrip } from "@/components/black/BlackStrip";
import { CountdownChips, RiskBanner } from "@/components/dashboard/RiskBanner";
import { TodayAttendanceChip } from "@/components/dashboard/TodayAttendanceChip";
import { attendanceAdvice, attendanceTone, formatPct } from "@/lib/attendance";
import { arrearsLabel, computeArrears, type Arrear } from "@/lib/arrears";
import { attendanceRisks, nextCountdowns } from "@/lib/risk";
import {
  CAMPUS_TZ,
  cn,
  formatCurrency,
  formatDate,
  formatLongDate,
  formatTimeLower,
  relativeTime,
  campusClock,
  timeToMinutes,
  daysUntil,
  dayName,
  titleCase,
} from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { Section, sectionLinkClass } from "@/components/ui/Section";
import { Stat } from "@/components/ui/Stat";

export const dynamic = "force-dynamic";

/** On desktop these sit in the wide column; the rest sit in the narrow one. */
const MAIN_COLUMN: ReadonlySet<DashboardSection> = new Set(["today", "attendance", "courses"]);

export default async function DashboardPage() {
  const [data, prefs] = await Promise.all([requireDashboardData(), getPrefs()]);
  const threshold = prefs.attendanceThreshold;
  const lmsConfigured = dataSource() === "live" && !!process.env.LMS_BASE_URL;
  const showConnectMoodle = lmsConfigured && !(await getSession()).lmsToken;
  const now = new Date();
  const clock = campusClock(now);
  const todayIdx = clock.dayIndex;
  const nowMinutes = clock.minutes;

  // Agenda: the rest of today, or, once today is over, the next day with classes.
  const classesOn = (day: number) =>
    data.timetable
      .filter((s) => s.day === day)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const todaysClasses = classesOn(todayIdx);
  const nextToday = todaysClasses.find((s) => timeToMinutes(s.endTime) > nowMinutes);
  let agendaOffset = 0;
  let agenda = todaysClasses;
  if (!nextToday) {
    for (let i = 1; i <= 7; i++) {
      const upcoming = classesOn((todayIdx + i) % 7);
      if (upcoming.length > 0) {
        agendaOffset = i;
        agenda = upcoming;
        break;
      }
    }
  }
  const agendaDay = (todayIdx + agendaOffset) % 7;
  const agendaLabel =
    agendaOffset === 0 ? "Today" : agendaOffset === 1 ? "Tomorrow" : dayName(agendaDay);
  const nextClass = nextToday ?? (agendaOffset > 0 ? agenda[0] : undefined);
  const nextClassAttendance = nextClass
    ? data.attendance.find((a) => a.code === nextClass.courseCode)
    : undefined;
  const laterClasses = nextClass
    ? agenda.filter((s) => timeToMinutes(s.startTime) > timeToMinutes(nextClass.startTime))
    : [];

  const upcoming = data.events
    .filter((e) => {
      const d = daysUntil(e.date, now);
      return d !== null && d >= 0 && d <= 14;
    })
    .slice(0, 6);

  const notices = data.notifications.slice(0, 5);
  const anyUnread = data.notifications.some((n) => !n.read);
  const courses = visibleCourses(
    data.courses,
    prefs,
    erpSubjects(data.attendance, data.timetable),
  ).sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0));

  const risks = attendanceRisks(data.attendance, threshold);
  const countdowns = nextCountdowns(data.events, now);
  const arrears = computeArrears(data.results);

  const firstName = titleCase(data.profile.name).split(/\s+/)[0] ?? data.profile.name;
  const programLine = [
    titleCase(data.profile.program),
    data.profile.semester != null && `Semester ${data.profile.semester}`,
    data.profile.section && `Section ${data.profile.section}`,
  ]
    .filter(Boolean)
    .join(", ");
  const updated = `Updated ${relativeTime(data.fetchedAt, now, { pastOnly: true })}`;

  const live =
    nextClass && agendaOffset === 0
      ? {
          startsAt: now.getTime() + (timeToMinutes(nextClass.startTime) - nowMinutes) * 60_000,
          endsAt: now.getTime() + (timeToMinutes(nextClass.endTime) - nowMinutes) * 60_000,
        }
      : null;
  const dayWord = agendaLabel === "Tomorrow" ? "tomorrow" : agendaLabel;

  /*
   * Which blocks show, and in what order, comes from the student's preferences.
   * A block with nothing to show (no courses) is skipped. If that leaves the page
   * empty, the Today hero is shown anyway.
   */
  const available: Record<DashboardSection, boolean> = {
    today: true,
    glance: true,
    attendance: true,
    due: true,
    notices: true,
    courses: courses.length > 0,
  };
  const hidden = new Set(prefs.dashboard.hidden);
  let visible = prefs.dashboard.order.filter((id) => available[id] && !hidden.has(id));
  if (visible.length === 0) visible = ["today"];
  const mainIds = visible.filter((id) => MAIN_COLUMN.has(id));
  const asideIds = visible.filter((id) => !MAIN_COLUMN.has(id));
  const twoColumns = mainIds.length > 0 && asideIds.length > 0;

  const blocks: Record<DashboardSection, React.ReactNode> = {
    today: (
      <Section
        id="next-class"
        title={agendaOffset === 0 ? "Today" : agendaLabel}
        action={
          <Link href="/timetable" className={sectionLinkClass}>
            Full timetable
          </Link>
        }
      >
        {nextClass ? (
          <Panel tone="accent" className="space-y-4 sm:p-6" data-tour="next-class">
            {live ? (
              <ClassCountdown
                startsAt={live.startsAt}
                endsAt={live.endsAt}
                renderedAt={now.getTime()}
              />
            ) : (
              <p className="text-small font-semibold">Next class, {dayWord}</p>
            )}

            <div>
              <p className="font-display text-display font-semibold tabular-nums">
                {formatTimeLower(nextClass.startTime, prefs.timeFormat)}
              </p>
              <p className="mt-1 font-display text-title font-semibold">{nextClass.courseTitle}</p>
              <p className="mt-2 text-body tabular-nums text-accent-foreground/80">
                {[`Until ${formatTimeLower(nextClass.endTime, prefs.timeFormat)}`, nextClass.room, nextClass.faculty]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>

            {nextClassAttendance ? (
              <NextClassAdvice subject={nextClassAttendance} threshold={threshold} />
            ) : null}

            {laterClasses.length > 0 ? (
              <div>
                <p className="text-small font-semibold">
                  {agendaOffset === 0
                    ? "Later today"
                    : `Later ${agendaOffset === 1 ? dayWord : `on ${dayWord}`}`}
                </p>
                <ol className="mt-1 divide-y divide-accent-foreground/15">
                  {laterClasses.map((s, i) => (
                    <li
                      key={`${s.courseCode}-${s.startTime}-${i}`}
                      className="flex items-baseline gap-4 py-2 text-small"
                    >
                      <span className="w-[4.5rem] shrink-0 tabular-nums text-accent-foreground/80">
                        {formatTimeLower(s.startTime, prefs.timeFormat)}
                      </span>
                      <span className="min-w-0 flex-1">{s.courseTitle}</span>
                      {s.room ? (
                        <span className="shrink-0 text-accent-foreground/80">{s.room}</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {todaysClasses.length > 0 ? (
              <TodayAttendanceChip data={data} />
            ) : null}
          </Panel>
        ) : (
          <EmptyState title="No timetable yet" description="Not published for your section." />
        )}
      </Section>
    ),

    attendance: (
      <Section
        id="attendance"
        title="Attendance"
        action={
          <Link href="/attendance" className={sectionLinkClass}>
            Details
          </Link>
        }
      >
        {data.attendance.length > 0 ? (
          <div className="space-y-5">
            <OverallAttendance subjects={data.attendance} threshold={threshold} />
            <AttendanceTable
              variant="compact"
              subjects={[...data.attendance].sort(byRisk)}
              threshold={threshold}
            />
          </div>
        ) : (
          <EmptyState title="No attendance yet" />
        )}
      </Section>
    ),

    courses: (
      <Section
        id="courses"
        title="Courses"
        action={
          <Link href="/courses" className={sectionLinkClass}>
            All courses
          </Link>
        }
      >
        <ul className="divide-y divide-border">
          {courses.slice(0, 6).map((c) => (
            <li key={c.id} className="flex items-center gap-4 py-3 first:pt-0">
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-foreground sm:truncate">{c.displayName ?? c.fullName}</p>
                <p className="truncate text-small text-muted-foreground">{c.displayCode ?? c.shortName}</p>
              </div>
              <div className="w-24 shrink-0 sm:w-36">
                <ProgressBar value={c.progress ?? 0} aria-label={`${c.displayName ?? c.fullName} progress`} />
              </div>
              <span className="w-10 shrink-0 text-right text-small font-semibold tabular-nums text-foreground">
                {c.progress ?? 0}%
              </span>
            </li>
          ))}
        </ul>
      </Section>
    ),

    glance: (
      <Section id="glance" title="At a glance">
        <dl
          className={cn(
            "grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4",
            twoColumns ? "lg:grid-cols-2" : "lg:grid-cols-4",
          )}
        >
          {glanceItems(data, arrears).map((it) => (
            <Stat key={it.label} label={it.label} value={it.value} hint={it.hint} />
          ))}
        </dl>
      </Section>
    ),

    due: (
      <Section id="due-soon" title="Due soon">
        {upcoming.length > 0 ? (
          <ol>
            {upcoming.map((e) => (
              <DueRow key={e.id} event={e} now={now} />
            ))}
          </ol>
        ) : (
          <EmptyState
            title="Nothing due in the next two weeks"
            description={showConnectMoodle ? "Connect your LMS to see deadlines." : undefined}
          />
        )}
      </Section>
    ),

    notices: (
      <Section
        id="notices"
        title="Notifications"
        action={
          <Link href="/notifications" className={sectionLinkClass}>
            All notices
          </Link>
        }
      >
        {notices.length > 0 ? (
          <ul className="divide-y divide-border">
            {notices.map((n) => (
              <li key={n.id} className="flex gap-3 py-3 first:pt-0">
                {anyUnread ? (
                  <span
                    className={cn(
                      "mt-2 h-2 w-2 shrink-0 rounded-full",
                      n.read ? "bg-transparent" : "bg-primary",
                    )}
                    role={n.read ? undefined : "img"}
                    aria-label={n.read ? undefined : "Unread"}
                  />
                ) : null}
                <div className="min-w-0">
                  <p
                    className={cn(
                      "line-clamp-2 text-body text-foreground",
                      !n.read && "font-medium",
                    )}
                  >
                    {n.title}
                  </p>
                  <p className="mt-0.5 text-small text-muted-foreground">
                    {n.source === "lms" ? "LMS" : "ERP"},{" "}
                    {relativeTime(n.date, now, { pastOnly: true })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No notifications" />
        )}
      </Section>
    ),
  };

  /*
   * Phones follow the saved order exactly: the column wrappers use `display:
   * contents`, so every block is a direct flex item and `order` (its position in
   * the saved order) applies. From lg up the wrappers become real columns and
   * `order` has no effect; blocks keep their saved order inside each column.
   */
  const place = (id: DashboardSection) => {
    const position = visible.indexOf(id);
    return (
      <div
        key={id}
        className="enter"
        style={{ "--i": position + 2, order: position } as React.CSSProperties}
      >
        {blocks[id]}
      </div>
    );
  };

  const hasAlerts = risks.length > 0 || countdowns.exam != null;

  return (
    <div className="space-y-6">
      <header className="enter flex items-start gap-4 pb-1" style={{ "--i": 0 } as React.CSSProperties}>
        <Avatar
          name={titleCase(data.profile.name)}
          src={data.profile.photoUrl}
          className="h-14 w-14 rounded-full text-heading"
        />
        <div className="min-w-0">
          <p className="text-small text-muted-foreground">{formatLongDate(now)}</p>
          <h1 className="text-title font-semibold text-foreground">
            {greeting(now)}, {firstName}
          </h1>
          {programLine ? (
            <p className="mt-0.5 text-small text-muted-foreground">{programLine}</p>
          ) : null}
          <p className="mt-0.5 text-small text-muted-foreground sm:hidden">{updated}</p>
        </div>
        <p className="ml-auto hidden shrink-0 pt-1 text-small text-muted-foreground sm:block">
          {updated}
        </p>
      </header>

      <BlackStrip />

      <TourCard />

      {showConnectMoodle ? <ConnectMoodleCard /> : null}

      {hasAlerts ? (
        <div className="enter space-y-3" style={{ "--i": 1 } as React.CSSProperties}>
          <RiskBanner risks={risks} threshold={threshold} />
          <CountdownChips exam={countdowns.exam} />
        </div>
      ) : null}

      <div
        className={cn(
          "flex flex-col gap-8",
          twoColumns
            ? "lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-10"
            : "lg:block lg:space-y-8",
        )}
      >
        {mainIds.length > 0 ? (
          <div className="contents lg:block lg:space-y-8">{mainIds.map(place)}</div>
        ) : null}
        {asideIds.length > 0 ? (
          <div className="contents lg:block lg:space-y-8">{asideIds.map(place)}</div>
        ) : null}
      </div>
    </div>
  );
}

/** Lowest attendance first, subjects with no hours recorded last. */
function byRisk(
  a: { totalClasses: number; percentage: number },
  b: { totalClasses: number; percentage: number },
) {
  if ((a.totalClasses === 0) !== (b.totalClasses === 0)) return a.totalClasses === 0 ? 1 : -1;
  return a.percentage - b.percentage;
}

function glanceItems(data: DashboardData, arrears: Arrear[]) {
  // Attendance is deliberately absent: the Attendance section's ring already
  // carries the percentage and the hours, two blocks away on the same screen.
  const items: { label: string; value: React.ReactNode; hint?: React.ReactNode }[] = [];

  const papers = data.results.flatMap((s) => s.results).filter((r) => r.passed !== undefined);
  if (hasGrades(data.results)) {
    const counted = data.results.filter((s) => (s.estimated ? s.gpa != null : true));
    const semesterCount = `${counted.length} ${counted.length === 1 ? "semester" : "semesters"}`;
    items.push({
      label: "CGPA",
      value: computeCgpa(data.results).toFixed(2),
      hint: data.results.some((s) => s.estimated) ? `Estimated, ${semesterCount}` : semesterCount,
    });
  } else if (papers.length > 0) {
    const cleared = papers.filter((r) => r.passed).length;
    items.push({
      label: "Papers cleared",
      value: `${cleared} of ${papers.length}`,
      hint: "Results published so far",
    });
  }

  const toClear =
    arrears.length > 0 ? (
      <Link href="/results#arrears" className="focusable inline-block rounded-sm py-0.5 underline underline-offset-4">
        {arrearsLabel(arrears.length)}
      </Link>
    ) : null;
  if (data.profile.arrears != null) {
    items.push({
      label: "Arrears",
      value: data.profile.arrears,
      hint: toClear ?? (data.profile.arrears === 0 ? "None to clear" : "Papers still to clear"),
    });
  } else if (toClear) {
    items.push({ label: "Arrears", value: arrears.length, hint: toClear });
  }

  const due = data.fees.filter((f) => (f.status ? f.status === "due" : !f.paid));
  const dueTotal = due.reduce((s, f) => s + f.amount, 0);
  const nextDue = due
    .filter((f) => f.dueDate)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())[0];
  if (data.fees.length > 0) {
    items.push({
      label: "Fees",
      value: due.length === 0 ? "Nothing due" : dueTotal > 0 ? formatCurrency(dueTotal) : `${due.length} due`,
      hint: nextDue?.dueDate ? `Due ${formatDate(nextDue.dueDate)}` : undefined,
    });
  }
  return items;
}

/** The overall ring with the threshold tick, plus one plain sentence about where you stand. */
function OverallAttendance({
  subjects,
  threshold,
}: {
  subjects: DashboardData["attendance"];
  threshold: number;
}) {
  const attended = subjects.reduce((s, x) => s + x.attended, 0);
  const total = subjects.reduce((s, x) => s + x.totalClasses, 0);
  if (total === 0) return null;
  const overall = overallAttendance(subjects);
  const advice = attendanceAdvice(attended, total, threshold);
  return (
    <div className="flex items-center gap-4" data-tour="attendance-overall">
      <ProgressRing
        value={overall.percentage}
        size={96}
        stroke={9}
        markAt={threshold}
        tone={attendanceTone(overall.percentage, threshold)}
        label={`Overall attendance ${formatPct(overall.percentage)}, the tick marks ${threshold}%`}
      >
        <span className="font-display text-heading font-semibold tabular-nums text-foreground">
          {formatPct(overall.percentage)}
        </span>
      </ProgressRing>
      <div className="min-w-0">
        <p className="text-body font-medium text-foreground">{advice.long}</p>
        <p className="mt-1 text-body tabular-nums text-muted-foreground">
          {attended} of {total} hours
        </p>
      </div>
    </div>
  );
}

const DUE_DATE_PARTS = new Intl.DateTimeFormat("en-IN", {
  timeZone: CAMPUS_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const DUE_TIME_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: CAMPUS_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "Thu 14 Oct", plus " at 10:00 am" when the deadline carries a time of day. */
function dueStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(DUE_DATE_PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  const date = `${p.weekday} ${p.day} ${p.month}`;
  const hhmm = DUE_TIME_PARTS.format(d);
  return hhmm === "00:00" ? date : `${date} at ${formatTimeLower(hhmm)}`;
}

/** One entry on the due-soon timeline. The dot is decoration; the words carry the urgency. */
function DueRow({ event, now }: { event: CalendarEvent; now: Date }) {
  const d = daysUntil(event.date, now);
  const when = d === 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d} days`;
  const soon = d !== null && d <= 2;
  return (
    <li className="relative pb-5 pl-7 last:pb-0 before:absolute before:bottom-0 before:left-[5px] before:top-3 before:w-px before:bg-border last:before:hidden">
      <span
        className={cn(
          "absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full ring-4 ring-background",
          event.type === "exam" ? "bg-danger" : soon ? "bg-warning" : "bg-muted-foreground/50",
        )}
        aria-hidden
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-body font-medium text-foreground">{event.title}</p>
        {event.type === "exam" ? <Badge variant="danger">Exam</Badge> : null}
      </div>
      {event.courseName ? (
        <p className="text-small text-muted-foreground">{event.courseName}</p>
      ) : null}
      <p className="mt-0.5 text-small tabular-nums text-muted-foreground">
        <span className={cn(soon && "font-semibold text-foreground")}>{when}</span>
        {", "}
        <time dateTime={event.date}>{dueStamp(event.date)}</time>
      </p>
    </li>
  );
}

/** What the next class means for attendance, in plain words. Sits on a surface so it reads on the accent panel. */
function NextClassAdvice({
  subject,
  threshold,
}: {
  subject: { attended: number; totalClasses: number };
  threshold: number;
}) {
  const advice = attendanceAdvice(subject.attended, subject.totalClasses, threshold);
  return (
    <div className="rounded-lg bg-surface px-3 py-2.5 text-foreground">
      {advice.tone === "none" ? (
        <p className="text-small text-muted-foreground">
          No attendance recorded for this subject yet.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Badge variant={advice.tone}>{advice.short}</Badge>
          <span className="text-small tabular-nums text-muted-foreground">
            {subject.attended} of {subject.totalClasses} hours attended
          </span>
        </div>
      )}
    </div>
  );
}

function greeting(now: Date): string {
  const h = campusClock(now).hour;
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  return "Good evening";
}
