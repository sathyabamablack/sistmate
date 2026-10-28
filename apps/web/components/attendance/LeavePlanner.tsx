"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { addDays, type PlanSubject } from "@usp/core";
import { Badge } from "@/components/ui/Badge";
import { fieldClass, labelClass } from "@/components/ui/field";
import { attendanceAdvice, formatPct } from "@/lib/attendance";
import { formatDay } from "@/lib/attendance-days";
import {
  MAX_LEAVE_DAYS,
  classesBetween,
  defaultLeave,
  leaveDays,
  planLeave,
  type LeaveRangeError,
} from "@/lib/leave-plan";
import type { PlanSlot } from "@/lib/week-plan";
import { cn } from "@/lib/utils";
import { OutcomeRow } from "./Outcome";

/** The last day of classes the student typed, remembered in this browser (the ERP's own dates aren't the semester's). */
const END_KEY = "usp-leave-end-v1";
// A module-level copy keeps it working when storage is blocked.
let endMemory: string | null = null;
const endListeners = new Set<() => void>();
const readEnd = () => {
  if (endMemory !== null) return endMemory;
  try {
    return localStorage.getItem(END_KEY) ?? "";
  } catch {
    return "";
  }
};
const subscribeEnd = (listener: () => void) => {
  endListeners.add(listener);
  return () => {
    endListeners.delete(listener);
  };
};
function saveEnd(next: string) {
  endMemory = next;
  try {
    if (next) localStorage.setItem(END_KEY, next);
    else localStorage.removeItem(END_KEY);
  } catch {
    /* kept in memory for this visit */
  }
  endListeners.forEach((l) => l());
}

const classesText = (n: number) => `${n} ${n === 1 ? "class" : "classes"}`;
const daysText = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

const RANGE_ERROR: Record<LeaveRangeError, string> = {
  invalid: "Pick the first and last day you'll be away.",
  reversed: "The last day is before the first.",
  past: "These days have passed. The ERP already has them.",
  "too-long": `Pick up to ${MAX_LEAVE_DAYS} days.`,
};

/**
 * Going home for a festival or on a trip: pick the dates, untick the days that
 * turn out to be holidays, and see where each subject stands after, and how many
 * classes of each to attend once back. Counts classes from the weekly timetable
 * (lib/leave-plan.ts). State is kept in the component only.
 */
export function LeavePlanner({
  subjects,
  slots,
  today,
  minutes,
  threshold,
}: {
  subjects: (PlanSubject & { title: string })[];
  /** every class in the weekly timetable (buildWeekPlan's slots) */
  slots: PlanSlot[];
  /** campus date, "YYYY-MM-DD" */
  today: string;
  /** campus minutes since midnight, so classes that have started today are left out */
  minutes: number;
  threshold: number;
}) {
  const [from, setFrom] = React.useState(() => defaultLeave(today).from);
  const [to, setTo] = React.useState(() => defaultLeave(today).to);
  const [off, setOff] = React.useState<ReadonlySet<string>>(() => new Set());
  const uid = React.useId();
  // The last day of classes, when the student gives it: caps the leave and the catching up.
  const lastDay = React.useSyncExternalStore(subscribeEnd, readEnd, () => "");
  const semesterEnd = lastDay && lastDay >= today ? lastDay : null;

  const range = React.useMemo(
    () => leaveDays(slots, from, to, { date: today, minutes }, semesterEnd),
    [slots, from, to, today, minutes, semesterEnd],
  );
  // Classes left once back, up to the semester's last day: what recovery has to fit into.
  const remaining = React.useMemo(
    () => (semesterEnd && !range.error && to ? classesBetween(slots, addDays(to, 1), semesterEnd) : null),
    [slots, to, semesterEnd, range.error],
  );
  const plan = React.useMemo(
    () => planLeave(subjects, range.days, off, threshold, remaining),
    [subjects, range.days, off, threshold, remaining],
  );
  const titles = React.useMemo(() => new Map(subjects.map((s) => [s.code, s.title])), [subjects]);

  function chooseFrom(next: string) {
    setFrom(next);
    // Moving the start past the end moves the end with it.
    if (next && to && next > to) setTo(next);
  }

  function toggleDay(date: string, counted: boolean) {
    setOff((prev) => {
      const next = new Set(prev);
      if (counted) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  const unaffected = subjects.length - plan.subjects.length;
  const below = plan.subjects.filter((s) => s.attendAfter > 0 && s.recoverable);
  const stuck = plan.subjects.filter((s) => !s.recoverable);
  const leftText = (n: number) => (n === 0 ? "no classes left" : `only ${classesText(n)} left`);
  const summaryText = range.error
    ? RANGE_ERROR[range.error]
    : range.days.length === 0
      ? "No classes on these days."
      : plan.missed === 0
        ? "Every day is ticked off, so nothing is missed."
        : `Missing ${classesText(plan.missed)} over ${daysText(plan.days)}. ${
            plan.below === 0
              ? `Every subject stays at or above ${threshold}%.`
              : `${plan.below} ${plan.below === 1 ? "subject ends" : "subjects end"} below ${threshold}%${
                  plan.stuck > 0 ? `, and ${plan.stuck} can't get back to it before classes end` : ""
                }.`
          }`;

  return (
    <div className="space-y-6">
      <p className="max-w-prose text-body text-muted-foreground">
        Going home or on a trip? Pick the days you&apos;ll be away to see where you&apos;d stand when you&apos;re back.
      </p>

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <div className="min-w-0">
              <label htmlFor={`${uid}-from`} className={cn(labelClass, "block")}>
                First day away
              </label>
              <input
                id={`${uid}-from`}
                type="date"
                value={from}
                min={today}
                onChange={(e) => chooseFrom(e.target.value)}
                className={cn(fieldClass, "mt-1.5")}
              />
            </div>
            <div className="min-w-0">
              <label htmlFor={`${uid}-to`} className={cn(labelClass, "block")}>
                Last day away
              </label>
              <input
                id={`${uid}-to`}
                type="date"
                value={to}
                min={from || today}
                max={from ? addDays(from, MAX_LEAVE_DAYS - 1) : undefined}
                onChange={(e) => setTo(e.target.value)}
                className={cn(fieldClass, "mt-1.5")}
              />
            </div>
          </div>

          <div className="sm:max-w-md">
            <label htmlFor={`${uid}-end`} className={cn(labelClass, "block")}>
              Last day of classes <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              id={`${uid}-end`}
              type="date"
              value={lastDay}
              min={today}
              onChange={(e) => saveEnd(e.target.value)}
              className={cn(fieldClass, "mt-1.5 sm:max-w-[calc(50%-0.375rem)]")}
            />
            <p className="mt-1 text-small text-muted-foreground">
              Add it to check you can still catch up before classes end.
            </p>
          </div>

          {range.days.length > 0 ? (
            <fieldset className="min-w-0">
              <legend className={labelClass}>Days with classes</legend>
              <p className="mt-0.5 text-small text-muted-foreground">
                Untick a day that turns out to be a holiday.
                {range.clamped ? " Days before today are already in the ERP, so they're left out." : ""}
              </p>
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {range.days.map((d) => {
                  const counted = !off.has(d.date);
                  const id = `${uid}-${d.date}`;
                  return (
                    <li key={d.date} className="min-w-0">
                      <label
                        htmlFor={id}
                        className={cn(
                          "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 ring-1 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                          counted ? "bg-surface ring-border" : "bg-muted/60 ring-transparent",
                        )}
                      >
                        <input
                          id={id}
                          type="checkbox"
                          checked={counted}
                          onChange={(e) => toggleDay(d.date, e.target.checked)}
                          className="h-5 w-5 shrink-0 cursor-pointer accent-primary"
                        />
                        <span className="min-w-0">
                          <span
                            className={cn(
                              "block whitespace-nowrap text-small font-semibold",
                              counted ? "text-foreground" : "text-muted-foreground line-through",
                            )}
                          >
                            <time dateTime={d.date}>{formatDay(d.date)}</time>
                          </span>
                          <span className="block text-micro tabular-nums text-muted-foreground">
                            {counted ? classesText(d.classes.length) : "Holiday"}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ) : null}
        </div>

        <div className="min-w-0">
          <h3 className="text-subheading font-semibold text-foreground">After the leave</h3>
          <p role="status" aria-live="polite" className="mt-0.5 text-small text-muted-foreground">
            {summaryText}
          </p>

          {stuck.length > 0 ? (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-danger/8 p-3 ring-1 ring-danger/25">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
              <div className="min-w-0 text-small text-foreground">
                <p className="font-semibold">Can&apos;t get back to {threshold}% before classes end</p>
                <ul className="mt-1 space-y-0.5">
                  {stuck.map((s) => (
                    <li key={s.code}>
                      {titles.get(s.code) ?? s.code}: needs {classesText(s.attendAfter)}, {leftText(s.left ?? 0)}.
                      {s.best !== null ? ` ${formatPct(s.best)} at most.` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {below.length > 0 ? (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-danger/8 p-3 ring-1 ring-danger/25">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
              <div className="min-w-0 text-small text-foreground">
                <p className="font-semibold">To reach {threshold}% again after the leave</p>
                <ul className="mt-1 space-y-0.5">
                  {below.map((s) => {
                    const title = titles.get(s.code) ?? s.code;
                    return (
                      <li key={s.code}>
                        {s.attendAfter === 1
                          ? `Attend the next ${title} class`
                          : `Attend the next ${s.attendAfter} ${title} classes`}
                        {s.left !== null ? ` (${s.left} left before classes end)` : ""}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ) : null}

          {plan.subjects.length > 0 ? (
            <ul className="mt-2 divide-y divide-border border-b border-border">
              {plan.subjects.map((o) => {
                const advice = attendanceAdvice(o.after.attended, o.after.total, threshold);
                const badge = o.recoverable ? (
                  <Badge variant={advice.tone === "none" ? "muted" : advice.tone}>{advice.short}</Badge>
                ) : (
                  <Badge variant="danger">{o.best !== null ? `${formatPct(o.best)} at most` : "Can't recover"}</Badge>
                );
                return (
                  <OutcomeRow
                    key={o.code}
                    title={titles.get(o.code) ?? o.code}
                    detail={`${o.code}, misses ${o.missed}`}
                    now={o.now}
                    after={o.after}
                    badge={badge}
                    testId={`leave-${o.code}`}
                  />
                );
              })}
            </ul>
          ) : null}

          {plan.subjects.length > 0 ? (
            <p className="mt-3 text-small text-muted-foreground">
              {unaffected > 0
                ? `${unaffected} other ${unaffected === 1 ? "subject has" : "subjects have"} no classes on these days. `
                : ""}
              Classes before you leave aren&apos;t counted, so attending them leaves you a little higher.
              {semesterEnd
                ? range.pastEnd
                  ? ` Classes end ${formatDay(semesterEnd)}, so days after it aren't counted.`
                  : ` Classes left are counted up to your last day of classes, ${formatDay(semesterEnd)}.`
                : null}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
