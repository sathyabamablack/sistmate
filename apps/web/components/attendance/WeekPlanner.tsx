"use client";

import * as React from "react";
import { Check, Clock, Sparkles, X } from "lucide-react";
import { projectAttendance, suggestSkips, type PlanSubject, type Projection } from "@usp/core";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { catClasses } from "@/lib/week";
import { upcomingHours, type PlanSlot } from "@/lib/week-plan";
import type { TimeFormat } from "@/lib/prefs";
import { DAY_NAMES_SHORT, cn, dayName, formatTime } from "@/lib/utils";
import { OutcomeRow } from "./Outcome";

const hoursText = (n: number) => `${n} ${n === 1 ? "hour" : "hours"}`;
const classesText = (n: number) => `${n} ${n === 1 ? "class" : "classes"}`;

export interface WeekPlannerProps {
  subjects: (PlanSubject & { title: string })[];
  slots: PlanSlot[];
  days: number[];
  /** the campus weekday of today, or null when the plan shows next week */
  todayIndex: number | null;
  threshold: number;
  timeFormat?: TimeFormat;
}

function WeekBadge({ now, after, threshold }: { now: Projection; after: Projection; threshold: number }) {
  if (after.total === 0) {
    return (
      <Badge variant="muted">
        <Clock className="h-3 w-3 shrink-0" aria-hidden />
        No hours yet
      </Badge>
    );
  }
  if (!after.safe) return <Badge variant="danger">{now.safe ? `Drops below ${threshold}%` : `Below ${threshold}%`}</Badge>;
  if (after.margin === 0) return <Badge variant="warning">At the limit</Badge>;
  return <Badge variant="success">On track</Badge>;
}

/**
 * Pick the classes you might miss this week and see where each subject would end
 * up. One day's classes at a time, so a phone never shows the whole week as cards.
 * Model: every class this week adds one hour to the total, and you attend all the
 * ones you do not mark. State is kept in the component only.
 */
export function WeekPlanner({
  subjects,
  slots,
  days,
  todayIndex,
  threshold,
  timeFormat = "12h",
}: WeekPlannerProps) {
  const [skipped, setSkipped] = React.useState<ReadonlySet<string>>(() => new Set());

  const upcoming = React.useMemo(() => slots.filter((s) => s.upcoming), [slots]);
  // Only days with a class still to come can be planned.
  const openDays = React.useMemo(() => days.filter((d) => upcoming.some((s) => s.day === d)), [days, upcoming]);
  // The first class you can mark: the day it is on opens first, and the walkthrough points at it and its subject's row.
  const firstOpen = React.useMemo(
    () => openDays.map((d) => upcoming.find((s) => s.day === d)).find((s) => s !== undefined),
    [openDays, upcoming],
  );
  const [picked, setPicked] = React.useState<number | null>(null);
  const listId = React.useId();
  const day = picked ?? firstOpen?.day ?? openDays[0];

  const held = React.useMemo(() => upcomingHours(slots), [slots]);
  const suggestion = React.useMemo(
    () => suggestSkips(subjects, upcoming, threshold),
    [subjects, upcoming, threshold],
  );

  const rows = React.useMemo(() => {
    const skips = new Map<string, number>();
    for (const s of upcoming) if (skipped.has(s.id)) skips.set(s.code, (skips.get(s.code) ?? 0) + 1);
    return subjects.map((s) => {
      const hours = held.get(s.code) ?? 0;
      const skip = skips.get(s.code) ?? 0;
      return {
        subject: s,
        skip,
        now: projectAttendance(s, 0, 0, threshold),
        after: projectAttendance(s, skip, hours - skip, threshold),
      };
    });
  }, [subjects, upcoming, held, skipped, threshold]);

  const toggle = (id: string) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (slots.length === 0) {
    return <p className="text-body text-muted-foreground">No classes to plan.</p>;
  }

  const skipsOn = (d: number) => upcoming.filter((s) => s.day === d && skipped.has(s.id)).length;
  const nSkipped = rows.reduce((n, r) => n + r.skip, 0);
  const dropping = rows.filter((r) => r.after.total > 0 && !r.after.safe && r.skip > 0);
  const suggestionKey = suggestion
    .map((s) => s.id)
    .sort()
    .join("|");
  const skippedKey = [...skipped].sort().join("|");

  const suggestionByTitle = new Map<string, number>();
  for (const c of suggestion) {
    const title = slots.find((s) => s.id === c.id)?.title ?? c.code;
    suggestionByTitle.set(title, (suggestionByTitle.get(title) ?? 0) + 1);
  }

  function applySuggestion() {
    const ids = new Set(suggestion.map((s) => s.id));
    setSkipped(ids);
    // Show a day the suggestion marked, unless the open one already has some.
    if (!upcoming.some((s) => s.day === day && ids.has(s.id))) {
      const first = upcoming.find((s) => ids.has(s.id));
      if (first) setPicked(first.day);
    }
  }

  const summaryText =
    nSkipped === 0
      ? "No classes marked to skip."
      : dropping.length === 0
        ? `Skipping ${classesText(nSkipped)}. Every subject stays at or above ${threshold}%.`
        : `Skipping ${classesText(nSkipped)}. ${dropping.length} ${dropping.length === 1 ? "subject drops" : "subjects drop"} below ${threshold}%.`;

  const dayLabel = (d: number) => (d === todayIndex ? "Today" : DAY_NAMES_SHORT[d]);

  return (
    <div className="space-y-6">
      <p className="max-w-prose text-body text-muted-foreground">
        Pick a day, then tap the classes you might miss. The rest count as attended.
        {todayIndex === null ? " This week is over, so this is next week." : ""}
      </p>

      <div className="flex flex-col gap-3 rounded-xl bg-accent/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <p className="min-w-0 text-small text-muted-foreground">
            <span className="block text-body font-semibold text-foreground">
              {suggestion.length > 0 ? `Safe to skip: ${classesText(suggestion.length)}` : "Safe to skip: none"}
            </span>
            {suggestion.length > 0
              ? `Keeps every subject at or above ${threshold}%: ${[...suggestionByTitle]
                  .map(([title, n]) => `${n} ${title}`)
                  .join(", ")}.`
              : `Missing any class in this plan would take a subject below ${threshold}%.`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={suggestion.length === 0 || suggestionKey === skippedKey}
            onClick={applySuggestion}
          >
            Apply suggestion
          </Button>
          {nSkipped > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setSkipped(new Set())}>
              Clear skips
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div role="radiogroup" aria-label="Day" className="flex flex-wrap gap-1.5">
            {openDays.map((d) => {
              const on = d === day;
              const n = skipsOn(d);
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${dayName(d)}${d === todayIndex ? ", today" : ""}${n > 0 ? `, ${n} to skip` : ""}`}
                  onClick={() => setPicked(d)}
                  className={cn(
                    "focusable inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-small font-semibold transition-colors lg:min-h-9",
                    on
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface text-foreground ring-1 ring-border hover:bg-muted",
                  )}
                >
                  {dayLabel(d)}
                  {n > 0 ? (
                    <span
                      className={cn(
                        "min-w-5 rounded-full px-1.5 text-center text-micro tabular-nums",
                        on ? "bg-primary-foreground/20" : "bg-warning/15 text-warning",
                      )}
                      aria-hidden
                    >
                      {n}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <h3 id={listId} className="sr-only">
            Classes on {dayName(day ?? 0)}
          </h3>
          <ul aria-labelledby={listId} className="mt-4 divide-y divide-border border-y border-border">
            {slots
              .filter((s) => s.day === day)
              .map((s) => {
                const time = formatTime(s.start, timeFormat);
                const body = (status: React.ReactNode) => (
                  <>
                    <span className={cn("h-9 w-1 shrink-0 rounded-full", catClasses(s.cat).bg)} aria-hidden />
                    <span className="w-16 shrink-0 whitespace-nowrap text-small font-semibold tabular-nums text-foreground">
                      {time}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-small font-medium leading-snug text-foreground">{s.title}</span>
                      <span className="block text-micro tabular-nums text-muted-foreground">{s.code}</span>
                    </span>
                    {status}
                  </>
                );
                if (!s.upcoming) {
                  return (
                    <li key={s.id} className="flex min-h-14 items-center gap-3 px-2 py-2 opacity-70">
                      {body(
                        <span className="flex shrink-0 items-center gap-1 text-micro font-semibold text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" aria-hidden />
                          Started
                        </span>,
                      )}
                    </li>
                  );
                }
                const on = skipped.has(s.id);
                return (
                  <li key={s.id} className="py-1">
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={`Skip ${s.title}, ${dayName(s.day)} ${time}`}
                      data-tour={s.id === firstOpen?.id ? "plan-first-class" : undefined}
                      onClick={() => toggle(s.id)}
                      className={cn(
                        "focusable flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors",
                        on ? "bg-warning/10" : "hover:bg-muted",
                      )}
                    >
                      {body(
                        <span
                          className={cn(
                            "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-micro font-semibold",
                            on ? "bg-warning/15 text-warning" : "text-muted-foreground",
                          )}
                          aria-hidden
                        >
                          {on ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                          {on ? "Skip" : "Going"}
                        </span>,
                      )}
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>

        <div className="min-w-0">
          <h3 className="text-subheading font-semibold text-foreground">After the plan</h3>
          <p role="status" aria-live="polite" className="mt-0.5 text-small text-muted-foreground">
            {summaryText}
          </p>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {rows.map(({ subject: s, skip, now, after }) => (
              <OutcomeRow
                key={s.code}
                title={s.title}
                detail={
                  <>
                    {s.code}
                    {skip > 0 ? `, skipping ${skip}` : ""}
                    {after.total > 0 ? (
                      <span className="block">
                        {after.margin >= 0 ? `${hoursText(after.margin)} to spare` : `Short by ${hoursText(-after.margin)}`}
                      </span>
                    ) : null}
                  </>
                }
                now={now}
                after={after}
                badge={<WeekBadge now={now} after={after} threshold={threshold} />}
                testId={`projected-${s.code}`}
                tour={s.code === firstOpen?.code ? "plan-result" : undefined}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
