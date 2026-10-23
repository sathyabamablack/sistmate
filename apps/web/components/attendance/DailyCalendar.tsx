import { CalendarOff, ChevronDown, Info } from "lucide-react";
import { monthEnd, summarizeDays, type DailyAttendance } from "@usp/core";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Stat } from "@/components/ui/Stat";
import { formatPct } from "@/lib/attendance";
import {
  DAILY_RULE,
  formatDay,
  formatLongDay,
  formatMonth,
  monthGrid,
  notableDays,
  type CalendarCell,
} from "@/lib/attendance-days";
import {
  BEFORE_SEMESTER_NOTE,
  SEMESTER_UNKNOWN_NOTE,
  daysInMonth,
  formatRange,
  monthsInRange,
  periodLabel,
  type DailyPeriodView,
} from "@/lib/attendance-range";
import { DAY_NAMES, DAY_NAMES_SHORT, cn } from "@/lib/utils";
import { dayStatus } from "./status";

const cellTint: Partial<Record<CalendarCell["status"], string>> = {
  present: "bg-success/8",
  absent: "bg-danger/10",
  holiday: "bg-muted",
};

const LEGEND = ["present", "absent", "holiday", "pending", "none"] as const;

function Day({ cell }: { cell: CalendarCell }) {
  const { Icon, className, text } = dayStatus[cell.status];
  const spoken = cell.status === "holiday" && cell.label ? `${text}: ${cell.label}` : text;
  return (
    <div
      className={cn(
        "flex h-14 flex-col items-center justify-center gap-0.5 rounded-md sm:h-16 sm:items-start sm:justify-between sm:p-2",
        cellTint[cell.status],
        cell.isToday && "ring-2 ring-primary ring-inset",
      )}
      title={cell.label}
    >
      <span
        className={cn(
          "text-small font-semibold tabular-nums",
          cell.status === "none" || cell.status === "later" ? "text-muted-foreground" : "text-foreground",
        )}
      >
        <time dateTime={cell.date}>{cell.day}</time>
        {cell.isToday ? <span className="sr-only"> (today)</span> : null}
      </span>
      <span className="flex items-center gap-1">
        {Icon ? <Icon className={cn("h-4 w-4 shrink-0", className)} aria-hidden /> : null}
        <span
          className={cn(
            "sr-only text-micro text-muted-foreground",
            cell.status !== "later" && "sm:not-sr-only",
          )}
        >
          {spoken}
        </span>
      </span>
    </div>
  );
}

/** "18 present, 1 absent, 3 holidays" */
function monthCounts(days: DailyAttendance["days"]): string {
  const { present, absent, holidays } = summarizeDays(days);
  return `${present} present, ${absent} absent, ${holidays} ${holidays === 1 ? "holiday" : "holidays"}`;
}

/** One month as a table: a cell per day with an icon and words. */
function MonthTable({
  daily,
  month,
  today,
  note,
  hideCaption = false,
}: {
  daily: DailyAttendance;
  /** "YYYY-MM" */
  month: string;
  today: string;
  note: string;
  /** the caption is already shown as the <summary> above */
  hideCaption?: boolean;
}) {
  const grid = monthGrid(daily, today, month);
  return (
    <table className="w-full table-fixed border-separate border-spacing-0.5">
      <caption
        className={cn("pb-2 text-left text-subheading font-semibold text-foreground", hideCaption && "sr-only")}
      >
        {formatMonth(month)}
        <span className="block text-small font-normal text-muted-foreground">{note}</span>
      </caption>
      <thead>
        <tr>
          {DAY_NAMES_SHORT.map((d, i) => (
            <th
              key={d}
              scope="col"
              abbr={DAY_NAMES[i]}
              className="pb-1 text-center text-micro font-semibold text-muted-foreground sm:text-left sm:pl-2"
            >
              {d}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grid.weeks.map((week, w) => (
          <tr key={w}>
            {week.map((cell, i) => (
              <td key={cell?.date ?? `pad-${w}-${i}`} className="p-0 align-top">
                {cell ? <Day cell={cell} /> : null}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Small print about what the period could and could not show. */
export function PeriodNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="space-y-1">
      {notes.map((n) => (
        <li key={n} className="flex items-start gap-2 text-small text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{n}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Day-wise attendance for the chosen period as the ERP sees it: the period's
 * totals, one calendar per month (newest first, older months folded), and the
 * absences and holidays. Calendar words become screen-reader text on phones,
 * where the legend explains the icons.
 */
export function DailyCalendar({ view, today }: { view: DailyPeriodView; today: string }) {
  const { daily } = view;
  const notes: string[] = [];
  if (view.staleNotice) notes.push(`${view.staleNotice}: the ERP did not answer just now.`);
  if (view.semesterUnknown) notes.push(SEMESTER_UNKNOWN_NOTE);
  if (view.windowStart && daily) {
    notes.push(`${BEFORE_SEMESTER_NOTE} So this starts on ${formatLongDay(view.windowStart)}, the semester's first day.`);
  }

  if (!daily) {
    if (view.error) {
      return (
        <EmptyState
          title="Day-wise attendance did not load"
          description="The ERP did not answer for your day-wise attendance. Try Check again or Refresh data in a minute."
        />
      );
    }
    return (
      <EmptyState
        title="No day-wise records for this period"
        description={
          view.windowStart
            ? `${BEFORE_SEMESTER_NOTE} This semester's records start on ${formatLongDay(view.windowStart)}; choose This semester to see them.`
            : "The ERP has no day-wise records for these dates. Choose This month or This semester."
        }
      />
    );
  }

  const { present, absent, holidays, percentage } = daily.summary;
  const months = monthsInRange(daily.window);
  const single = months.length <= 1;
  const notable = notableDays(daily);
  if (!single) notable.reverse(); // newest first, like the calendars
  // The month still running says how far it goes; finished months give their counts.
  const lastNote = (month: string) => {
    const end = daily.window.to;
    const text =
      month === end.slice(0, 7) && end < monthEnd(end)
        ? `Up to ${formatLongDay(end)}.`
        : `${monthCounts(daysInMonth(daily, month))}.`;
    return single ? `${text} ${DAILY_RULE}` : text;
  };

  return (
    <div className="space-y-6">
      {!single || notes.length > 0 ? (
        <div className="space-y-2">
          {!single ? (
            <p className="text-small text-muted-foreground">
              {periodLabel(view.period)}: {formatRange(daily.window)}. {DAILY_RULE}
            </p>
          ) : null}
          <PeriodNotes notes={notes} />
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Present days" value={present} />
        <Stat label="Absent days" value={absent} />
        <Stat label="Holidays" value={holidays} />
        <Stat
          label="Day-wise attendance"
          value={percentage === null ? "—" : formatPct(percentage)}
          hint="Present days out of present and absent days"
        />
      </dl>

      <div className="space-y-3">
        {months.map((month, i) =>
          i === 0 ? (
            <MonthTable key={month} daily={daily} month={month} today={today} note={lastNote(month)} />
          ) : (
            <details key={month} className="group border-t border-border">
              <summary className="focusable flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md py-2 [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block text-subheading font-semibold text-foreground">{formatMonth(month)}</span>
                  <span className="block text-small text-muted-foreground">{lastNote(month)}</span>
                </span>
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <div className="pb-2">
                <MonthTable daily={daily} month={month} today={today} note={lastNote(month)} hideCaption />
              </div>
            </details>
          ),
        )}

        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-micro text-muted-foreground sm:hidden" aria-label="Key">
          {LEGEND.map((s) => {
            const { Icon, className, text } = dayStatus[s];
            return (
              <li key={s} className="inline-flex items-center gap-1">
                {Icon ? <Icon className={cn("h-3.5 w-3.5 shrink-0", className)} aria-hidden /> : null}
                {text}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h3 className="text-subheading font-semibold text-foreground">Absences and holidays</h3>
        {notable.length > 0 ? (
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {notable.map((d) => (
              <li key={d.date} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                <span className="text-body text-foreground">
                  <time dateTime={d.date}>{formatDay(d.date)}</time>
                  {d.status === "holiday" && d.label ? (
                    <span className="text-muted-foreground">, {d.label}</span>
                  ) : null}
                </span>
                {d.status === "absent" ? (
                  <Badge variant="danger">Absent</Badge>
                ) : (
                  <Badge variant="muted">
                    <CalendarOff className="h-3 w-3 shrink-0" aria-hidden />
                    Holiday
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-small text-muted-foreground">
            {single
              ? `No absent days or holidays in ${formatMonth(months[0] ?? daily.window.to.slice(0, 7))} so far.`
              : "No absent days or holidays in this period."}
          </p>
        )}
      </div>
    </div>
  );
}
