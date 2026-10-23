"use client";

import * as React from "react";
import { Check, Clock, Sparkles, X } from "lucide-react";
import { projectAttendance, suggestSkips, type PlanSubject } from "@usp/core";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPct } from "@/lib/attendance";
import { catClasses } from "@/lib/week";
import { upcomingHours, type PlanSlot } from "@/lib/week-plan";
import type { TimeFormat } from "@/lib/prefs";
import { cn, dayName, formatTime } from "@/lib/utils";

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

/**
 * Pick the classes you might miss and see where each subject would end up.
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
  // The first class you can mark, in the order the days are shown: the walkthrough points at it and its subject's row.
  const firstOpen = React.useMemo(
    () => days.map((d) => upcoming.find((s) => s.day === d)).find((s) => s !== undefined),
    [days, upcoming],
  );
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
    return (
      <p className="text-body text-muted-foreground">
        No classes to plan.
      </p>
    );
  }

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

  const summaryText =
    nSkipped === 0
      ? "No classes marked to skip."
      : dropping.length === 0
        ? `Skipping ${classesText(nSkipped)}. Every subject stays at or above ${threshold}%.`
        : `Skipping ${classesText(nSkipped)}. ${dropping.length} ${dropping.length === 1 ? "subject drops" : "subjects drop"} below ${threshold}%.`;

  return (
    <div className="space-y-6">
      <p className="max-w-prose text-body text-muted-foreground">
        Tap a class to skip it; the figures assume you attend the rest.
        {todayIndex === null ? " This week is over, so this is next week." : ""}
      </p>

      <div className="rounded-xl bg-accent/60 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex min-w-0 items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <p className="text-body font-semibold text-foreground">Safe to skip</p>
              {suggestion.length > 0 ? (
                <p className="text-body text-muted-foreground">
                  You could miss {classesText(suggestion.length)} and keep every subject at or above{" "}
                  {threshold}%: {[...suggestionByTitle].map(([title, n]) => `${n} ${title}`).join(", ")}.
                </p>
              ) : (
                <p className="text-body text-muted-foreground">
                  Missing any class in this plan would take a subject below {threshold}%.
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={suggestion.length === 0 || suggestionKey === skippedKey}
              onClick={() => setSkipped(new Set(suggestion.map((s) => s.id)))}
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
      </div>

      <div className="grid gap-x-3 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {days.map((day) => (
          <div key={day} className="min-w-0">
            <h3 className="mb-2 text-small font-semibold text-foreground">
              {dayName(day)}
              {day === todayIndex ? <span className="font-normal text-muted-foreground">, today</span> : null}
            </h3>
            <ul className="space-y-2">
              {slots
                .filter((s) => s.day === day)
                .map((s) => {
                  const time = formatTime(s.start, timeFormat);
                  // Stacked so a narrow day column never squeezes the time or cuts the subject name.
                  const body = (status: React.ReactNode) => (
                    <>
                      <span
                        className={cn("absolute inset-y-2 left-0 w-1 rounded-full", catClasses(s.cat).bg)}
                        aria-hidden
                      />
                      <span className="flex items-center justify-between gap-2">
                        <span className="whitespace-nowrap text-small font-semibold tabular-nums text-foreground">
                          {time}
                        </span>
                        {status}
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-small font-medium leading-snug text-foreground">
                        {s.title}
                      </span>
                      <span className="mt-0.5 block truncate text-micro tabular-nums text-muted-foreground">{s.code}</span>
                    </>
                  );
                  if (!s.upcoming) {
                    return (
                      <li key={s.id}>
                        <div className="relative rounded-lg border border-border py-2 pl-4 pr-3 opacity-70">
                          {body(
                            <span className="flex shrink-0 items-center gap-1 text-micro font-semibold text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" aria-hidden />
                              Started
                            </span>,
                          )}
                        </div>
                      </li>
                    );
                  }
                  const on = skipped.has(s.id);
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`Skip ${s.title}, ${dayName(s.day)} ${time}`}
                        data-tour={s.id === firstOpen?.id ? "plan-first-class" : undefined}
                        onClick={() => toggle(s.id)}
                        className={cn(
                          "focusable relative block w-full rounded-lg border py-2 pl-4 pr-3 text-left transition-colors",
                          on ? "border-warning/50 bg-warning/10" : "border-border bg-surface hover:bg-muted",
                        )}
                      >
                        {body(
                          <span
                            className={cn(
                              "flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-micro font-semibold",
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
        ))}
      </div>

      <div>
        <h3 className="mb-1 text-subheading font-semibold text-foreground">After the plan</h3>
        <p role="status" aria-live="polite" className="mb-3 text-small text-muted-foreground">
          {summaryText}
        </p>

        <div
          className="hidden gap-x-4 border-b border-border pb-2 text-small font-medium text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1.6fr)_4.5rem_6rem_9rem_9.5rem]"
          aria-hidden
        >
          <span>Subject</span>
          <span>Now</span>
          <span>After the plan</span>
          <span>Buffer</span>
          <span>Status</span>
        </div>
        <ul className="divide-y divide-border border-b border-border sm:border-b-0">
          {rows.map(({ subject: s, skip, now, after }) => {
            const hasHours = after.total > 0;
            const badge = !hasHours ? (
              <Badge variant="muted">
                <Clock className="h-3 w-3 shrink-0" aria-hidden />
                No hours yet
              </Badge>
            ) : !after.safe ? (
              <Badge variant="danger">{now.safe ? `Drops below ${threshold}%` : `Below ${threshold}%`}</Badge>
            ) : after.margin === 0 ? (
              <Badge variant="warning">At the limit</Badge>
            ) : (
              <Badge variant="success">On track</Badge>
            );
            return (
              <li
                key={s.code}
                data-tour={s.code === firstOpen?.code ? "plan-result" : undefined}
                className="grid grid-cols-2 items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,1.6fr)_4.5rem_6rem_9rem_9.5rem]"
              >
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <p className="text-body font-medium text-foreground">{s.title}</p>
                  <p className="text-small tabular-nums text-muted-foreground">
                    {s.code}
                    {skip > 0 ? `, skipping ${skip}` : ""}
                  </p>
                </div>
                <p className="text-small text-muted-foreground">
                  <span className="mr-1 sm:sr-only">Now</span>
                  <span className="font-display font-semibold tabular-nums text-foreground">
                    {s.total > 0 ? formatPct(now.percentage) : "—"}
                  </span>
                </p>
                <p className="text-small text-muted-foreground">
                  <span className="mr-1 sm:sr-only">After the plan</span>
                  <span
                    data-testid={`projected-${s.code}`}
                    className="font-display font-semibold tabular-nums text-foreground"
                  >
                    {hasHours ? formatPct(after.percentage) : "—"}
                  </span>
                </p>
                <p className="text-small tabular-nums text-muted-foreground">
                  <span className="mr-1 sm:sr-only">Buffer</span>
                  {!hasHours
                    ? "—"
                    : after.margin >= 0
                      ? `${hoursText(after.margin)} to spare`
                      : `Short by ${hoursText(-after.margin)}`}
                </p>
                <div>{badge}</div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
