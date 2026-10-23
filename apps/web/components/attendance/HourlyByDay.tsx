import { ChevronDown, Clock } from "lucide-react";
import type { HourlyDay, TimetableSlot } from "@usp/core";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatPct } from "@/lib/attendance";
import { formatDay, formatMonth, hourChips, newestFirst } from "@/lib/attendance-days";
import {
  GROUP_BY_MONTH_AFTER_DAYS,
  HOURLY_CHUNK_DAYS,
  HOURLY_MAX_CHUNKS,
  SEMESTER_UNKNOWN_NOTE,
  formatRange,
  groupByMonth,
  hourTotals,
  periodLabel,
  periodPhrase,
  rangeDays,
  type HourlyPeriodView,
} from "@/lib/attendance-range";
import { PeriodNotes } from "./DailyCalendar";
import { HourChips } from "./HourChips";

function DayRow({ day, today }: { day: HourlyDay; today: string }) {
  const hours = day.totalHours === 1 ? "hour" : "hours";
  return (
    <>
      <div className="min-w-0">
        <p className="text-body font-medium text-foreground">
          <time dateTime={day.date}>{formatDay(day.date)}</time>
          {day.date === today ? <span className="text-muted-foreground"> (today)</span> : null}
        </p>
        <p className="text-small text-muted-foreground">
          <span className="tabular-nums">
            {day.present} of {day.totalHours}
          </span>{" "}
          {hours} present
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {day.absent > 0 ? <Badge variant="danger">{day.absent} absent</Badge> : null}
        {day.notGiven > 0 ? (
          <Badge variant="muted">
            <Clock className="h-3 w-3 shrink-0" aria-hidden />
            {day.notGiven} not entered yet
          </Badge>
        ) : null}
        {day.absent === 0 && day.notGiven === 0 ? <Badge variant="success">All present</Badge> : null}
      </div>
    </>
  );
}

/**
 * Hour-wise attendance for each recent date, newest first. A date opens to show
 * each hour when the ERP names the hours (a native <details>, no script needed).
 */
export function HourlyByDay({
  days,
  timetable,
  today,
}: {
  /** newest first */
  days: HourlyDay[];
  timetable: TimetableSlot[];
  today: string;
}) {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {days.map((day) => {
        const chips = hourChips(day, timetable);
        const rowClass = "flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-3";
        return (
          <li key={day.date}>
            {chips.length > 0 ? (
              <details className="group">
                <summary
                  className={`${rowClass} focusable cursor-pointer list-none rounded-md [&::-webkit-details-marker]:hidden`}
                >
                  <DayRow day={day} today={today} />
                  <ChevronDown
                    className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <HourChips chips={chips} className="pb-3 sm:grid-cols-3 lg:grid-cols-4" />
              </details>
            ) : (
              <div className={rowClass}>
                <DayRow day={day} today={today} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** "Present 182 of 196 hours (92.8%)": hours present out of hours entered, for a list of days. */
export function hourTotalsText(days: readonly HourlyDay[]): string {
  const t = hourTotals(days);
  const entered = t.present + t.absent;
  if (t.percentage === null) return "No hours entered yet";
  return `Present ${t.present} of ${entered} ${entered === 1 ? "hour" : "hours"} (${formatPct(t.percentage)})`;
}

/**
 * Hour-wise attendance for the chosen period: the period's totals, then each date
 * newest first. Periods longer than two weeks are grouped by month, with older
 * months folded.
 */
export function HourlyPeriod({
  view,
  timetable,
  today,
}: {
  view: HourlyPeriodView;
  timetable: TimetableSlot[];
  today: string;
}) {
  const notes: string[] = [];
  if (view.staleNotice) notes.push(`${view.staleNotice}: the ERP did not answer just now.`);
  if (view.semesterUnknown) notes.push(SEMESTER_UNKNOWN_NOTE);
  if (view.trimmedFrom) {
    notes.push(
      `The app reads at most ${HOURLY_CHUNK_DAYS * HOURLY_MAX_CHUNKS} days of hour-wise attendance at a time, so this shows ${formatRange(view.range)}.`,
    );
  }

  if (view.days.length === 0) {
    const failed = view.error !== null;
    return (
      <div className="space-y-3">
        <PeriodNotes notes={notes} />
        <EmptyState
          title={failed ? "Hour-wise attendance did not load" : "No hour-wise attendance yet"}
          description={
            failed
              ? "The ERP did not answer for your hour-wise attendance. Try Check again or Refresh data in a minute."
              : `The ERP has no hour-wise attendance for ${periodPhrase(view.period)}.`
          }
        />
      </div>
    );
  }

  const { notGiven } = hourTotals(view.days);
  const grouped = rangeDays(view.range) > GROUP_BY_MONTH_AFTER_DAYS;
  const groups = grouped ? groupByMonth(view.days) : [];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div>
          <p className="font-display text-subheading font-semibold tabular-nums text-foreground">
            {hourTotalsText(view.days)}
          </p>
          <p className="text-small text-muted-foreground">
            {periodLabel(view.period)}: {formatRange(view.range)}.
            {notGiven > 0 ? ` ${notGiven} ${notGiven === 1 ? "hour" : "hours"} not entered yet.` : ""}
          </p>
        </div>
        <PeriodNotes notes={notes} />
      </div>

      {grouped ? (
        <div className="space-y-3">
          {groups.map((g, i) =>
            i === 0 ? (
              <div key={g.month}>
                <h3 className="text-subheading font-semibold text-foreground">{formatMonth(g.month)}</h3>
                <p className="pb-1 text-small text-muted-foreground">{hourTotalsText(g.days)}</p>
                <HourlyByDay days={g.days} timetable={timetable} today={today} />
              </div>
            ) : (
              <details key={g.month} className="group">
                <summary className="focusable flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md py-2 [&::-webkit-details-marker]:hidden">
                  <span>
                    <h3 className="text-subheading font-semibold text-foreground">{formatMonth(g.month)}</h3>
                    <span className="block text-small text-muted-foreground">{hourTotalsText(g.days)}</span>
                  </span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <HourlyByDay days={g.days} timetable={timetable} today={today} />
              </details>
            ),
          )}
        </div>
      ) : (
        <HourlyByDay days={newestFirst(view.days)} timetable={timetable} today={today} />
      )}
    </div>
  );
}
