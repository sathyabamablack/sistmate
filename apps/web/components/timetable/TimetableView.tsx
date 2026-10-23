"use client";

import * as React from "react";
import type { TimetableSlot } from "@usp/core";
import type { TimeFormat } from "@/lib/prefs";
import { Section } from "@/components/ui/Section";
import { cn, campusClock, dayName, DAY_NAMES_SHORT, formatTime, timeToMinutes } from "@/lib/utils";
import {
  buildWeek,
  catClasses,
  clockTime,
  findNowNext,
  formatDuration,
  slotState,
  type Subject,
  type Week,
} from "@/lib/week";

type Clock = ReturnType<typeof campusClock>;


function useCampusNow(initialIso: string): Date {
  const [now, setNow] = React.useState(() => new Date(initialIso));
  React.useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** Room and teacher as a plain comma-separated line. */
function where(slot: TimetableSlot): string {
  return [slot.room, slot.faculty].filter(Boolean).join(", ");
}

function NowStrip({ week, clock, tf }: { week: Week; clock: Clock; tf: TimeFormat }) {
  const { now, next, following } = findNowNext(week, clock);
  const left = now ? timeToMinutes(now.endTime) - clock.minutes : 0;
  const until = next ? timeToMinutes(next.startTime) - clock.minutes : 0;

  return (
    <dl
      aria-live="polite"
      className="mb-6 grid divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-rest sm:grid-cols-2 sm:divide-x sm:divide-y-0"
    >
      <div className={cn("min-w-0 px-4 py-3.5 sm:px-5", now && "bg-accent")}>
        <dt className="flex items-center gap-2 text-small font-semibold text-muted-foreground">
          {now ? (
            <span aria-hidden className="h-2 w-2 animate-pulse-dot rounded-full bg-primary" />
          ) : null}
          <span className={now ? "text-accent-foreground" : undefined}>Now</span>
        </dt>
        <dd className="mt-1 min-w-0">
          {now ? (
            <>
              <p className="font-display text-subheading font-semibold text-foreground">
                {now.courseTitle}
              </p>
              <p className="text-small tabular-nums text-muted-foreground">
                Until {formatTime(now.endTime, tf)}, {formatDuration(Math.max(left, 1))} left
                {where(now) ? `. ${where(now)}` : ""}
              </p>
            </>
          ) : (
            <p className="text-body text-muted-foreground">No class in session</p>
          )}
        </dd>
      </div>
      <div className="min-w-0 px-4 py-3.5 sm:px-5">
        <dt className="text-small font-semibold text-muted-foreground">Next</dt>
        <dd className="mt-1 min-w-0">
          {next ? (
            <>
              <p className="font-display text-subheading font-semibold text-foreground">
                {next.courseTitle}
              </p>
              <p className="text-small tabular-nums text-muted-foreground">
                {formatTime(next.startTime, tf)}, in {formatDuration(Math.max(until, 1))}
                {where(next) ? `. ${where(next)}` : ""}
              </p>
            </>
          ) : following ? (
            <>
              <p className="font-display text-subheading font-semibold text-foreground">
                {following.courseTitle}
              </p>
              <p className="text-small tabular-nums text-muted-foreground">
                {dayName(following.day)} at {formatTime(following.startTime, tf)}. No more classes today.
              </p>
            </>
          ) : (
            <p className="text-body text-muted-foreground">Nothing scheduled</p>
          )}
        </dd>
      </div>
    </dl>
  );
}

function WeekTable({
  week,
  clock,
  next,
  cat,
  tf,
}: {
  week: Week;
  clock: Clock;
  tf: TimeFormat;
  next?: TimetableSlot;
  cat: (code: string) => ReturnType<typeof catClasses>;
}) {
  const cols = week.days.length;
  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-rest">
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">Weekly class timetable, periods by day</caption>
        <thead>
          <tr className="border-b border-border">
            <th
              scope="col"
              className="w-24 px-3 py-3 text-left text-small font-medium text-muted-foreground"
            >
              Period
            </th>
            {week.days.map((d) => {
              const today = d === clock.dayIndex;
              return (
                <th
                  key={d}
                  scope="col"
                  aria-current={today ? "date" : undefined}
                  className={cn(
                    "border-l border-border px-3 py-3 text-left font-display text-subheading font-semibold",
                    today ? "bg-accent text-accent-foreground" : "text-foreground",
                  )}
                >
                  {DAY_NAMES_SHORT[d]}
                  {today ? <span className="ml-2 text-small font-medium">Today</span> : null}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {week.rows.map((row) => {
            if (row.type === "break") {
              return (
                <tr key={`b-${row.start}`} className="border-b border-border last:border-b-0">
                  <th
                    scope="row"
                    className="bg-surface-2 px-3 py-2 text-left text-small font-normal tabular-nums text-muted-foreground"
                  >
                    {clockTime(row.start, tf)}
                  </th>
                  <td
                    colSpan={cols}
                    className="bg-surface-2 px-3 py-2 text-center text-small text-muted-foreground"
                  >
                    Break, {clockTime(row.start, tf)}–{clockTime(row.end, tf)} ({formatDuration(row.minutes)})
                  </td>
                </tr>
              );
            }
            return (
              <tr key={`p-${row.start}`} className="border-b border-border last:border-b-0">
                <th
                  scope="row"
                  className="px-3 py-2.5 text-left align-top text-small font-normal tabular-nums text-muted-foreground"
                >
                  <span className="block font-display font-semibold text-foreground">
                    {clockTime(row.start, tf)}
                  </span>
                  {clockTime(row.end, tf)}
                </th>
                {week.days.map((d) => {
                  const today = d === clock.dayIndex;
                  const cell = row.cells.get(d) ?? [];
                  return (
                    <td
                      key={d}
                      className={cn("border-l border-border p-1.5 align-top", today && "bg-accent/40")}
                    >
                      {cell.map((s) => {
                        const state = slotState(s, clock);
                        const isNext = s === next;
                        return (
                          <div
                            key={s.courseCode}
                            title={[s.courseTitle, s.courseCode, s.room, s.faculty]
                              .filter(Boolean)
                              .join(", ")}
                            className={cn(
                              "rounded-md border-l-4 bg-surface-2 py-2 pl-2.5 pr-2",
                              cat(s.courseCode).border,
                              state === "now" && "bg-accent ring-1 ring-primary/60",
                            )}
                          >
                            {state === "now" || isNext ? (
                              <p
                                className={cn(
                                  "mb-0.5 flex items-center gap-1.5 text-micro font-semibold",
                                  state === "now" ? "text-accent-foreground" : "text-primary",
                                )}
                              >
                                {state === "now" ? (
                                  <span
                                    aria-hidden
                                    className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-primary"
                                  />
                                ) : null}
                                {state === "now" ? "Now" : "Next"}
                              </p>
                            ) : null}
                            <p
                              className={cn(
                                "line-clamp-2 text-small font-medium leading-snug",
                                state === "done" ? "text-muted-foreground" : "text-foreground",
                              )}
                            >
                              {s.courseTitle}
                            </p>
                            <span className="mt-0.5 block truncate text-micro font-medium tabular-nums text-muted-foreground">
                              {s.courseCode}
                            </span>
                            {s.room ? (
                              <span className="block truncate text-micro text-muted-foreground">
                                {s.room}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DayList({
  week,
  day,
  clock,
  next,
  cat,
  tf,
}: {
  week: Week;
  day: number;
  clock: Clock;
  tf: TimeFormat;
  next?: TimetableSlot;
  cat: (code: string) => ReturnType<typeof catClasses>;
}) {
  const slots = week.slotsByDay.get(day) ?? [];
  if (slots.length === 0) {
    return (
      <p className="rounded-xl bg-surface-2 px-4 py-8 text-center text-body text-muted-foreground">
        No classes on {dayName(day)}.
      </p>
    );
  }
  return (
    <ol className="overflow-hidden rounded-xl bg-surface shadow-rest">
      {slots.map((s, i) => {
        const prev = slots[i - 1];
        const gap = prev ? timeToMinutes(s.startTime) - timeToMinutes(prev.endTime) : 0;
        const state = slotState(s, clock);
        const isNext = s === next;
        return (
          <React.Fragment key={`${s.startTime}-${s.courseCode}`}>
            {gap > 0 ? (
              <li className="border-b border-border bg-surface-2 px-4 py-2 text-center text-small text-muted-foreground">
                Break, {clockTime(prev!.endTime, tf)}–{clockTime(s.startTime, tf)} ({formatDuration(gap)})
              </li>
            ) : null}
            <li
              aria-current={state === "now" ? "time" : undefined}
              className={cn(
                "flex gap-3 border-b border-border px-4 py-3.5 last:border-b-0",
                state === "now" && "bg-accent",
              )}
            >
              <div className="w-[4.5rem] shrink-0 tabular-nums">
                <p className="font-display text-subheading font-semibold text-foreground">
                  {formatTime(s.startTime, tf)}
                </p>
                <p className="text-small text-muted-foreground">{formatTime(s.endTime, tf)}</p>
              </div>
              <div className={cn("min-w-0 flex-1 border-l-4 pl-3", cat(s.courseCode).border)}>
                <p
                  className={cn(
                    "text-body font-medium leading-snug",
                    state === "done" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {s.courseTitle}
                </p>
                <p className="mt-0.5 break-words text-small text-muted-foreground">
                  <span className="font-medium tabular-nums">{s.courseCode}</span>
                  {where(s) ? `, ${where(s)}` : ""}
                </p>
              </div>
              {state === "now" ? (
                <span className="flex shrink-0 items-center gap-1.5 self-start text-small font-semibold text-accent-foreground">
                  <span aria-hidden className="h-2 w-2 animate-pulse-dot rounded-full bg-primary" />
                  Now
                </span>
              ) : isNext ? (
                <span className="shrink-0 self-start text-small font-semibold text-primary">Next</span>
              ) : state === "done" ? (
                <span className="shrink-0 self-start text-small text-muted-foreground">Done</span>
              ) : null}
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );
}

function SubjectKey({ subjects }: { subjects: Subject[] }) {
  return (
    <Section title="Subjects this week" id="tt-subjects" className="mt-10">
      <ul className="divide-y divide-border border-y border-border">
        {subjects.map((s) => (
          <li
            key={s.code}
            className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 py-3"
          >
            <span
              className={cn("h-3 w-3 shrink-0 self-center rounded-sm", catClasses(s.cat).bg)}
              aria-hidden
            />
            <span className="min-w-0 flex-1 basis-48 text-body font-medium text-foreground">
              {s.title}
            </span>
            <span className="text-small font-medium tabular-nums text-foreground">{s.code}</span>
            <span className="text-small tabular-nums text-muted-foreground">
              {s.periods} {s.periods === 1 ? "period" : "periods"} a week
            </span>
            {s.faculty ? <span className="text-small text-muted-foreground">{s.faculty}</span> : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function TimetableView({
  slots,
  nowIso,
  timeFormat = "12h",
}: {
  slots: TimetableSlot[];
  nowIso: string;
  /** From the student's settings. */
  timeFormat?: TimeFormat;
}) {
  const now = useCampusNow(nowIso);
  const clock = campusClock(now);
  const week = React.useMemo(() => buildWeek(slots), [slots]);
  const { next, following } = findNowNext(week, clock);
  const cat = React.useCallback(
    (code: string) => catClasses(week.subjects.get(code)?.cat ?? 0),
    [week],
  );

  const fallbackDay = following?.day ?? week.days[0]!;
  const defaultDay = week.days.includes(clock.dayIndex) ? clock.dayIndex : fallbackDay;
  const [picked, setPicked] = React.useState<number | null>(null);
  const day = picked ?? defaultDay;

  return (
    <div>
      <NowStrip week={week} clock={clock} tf={timeFormat} />

      <div className="md:hidden">
        <div
          role="group"
          aria-label="Choose a day"
          className="mb-3 flex gap-1 rounded-xl bg-muted p-1"
        >
          {week.days.map((d) => {
            const isToday = d === clock.dayIndex;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={d === day}
                onClick={() => setPicked(d)}
                className={cn(
                  "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-lg text-small font-semibold transition-colors focusable",
                  d === day
                    ? "bg-surface text-foreground shadow-rest"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {DAY_NAMES_SHORT[d]}
                <span
                  className={cn(
                    "mt-0.5 h-1 w-1 rounded-full",
                    isToday ? "bg-primary" : "bg-transparent",
                  )}
                  aria-hidden
                />
                {isToday ? <span className="sr-only">(today)</span> : null}
              </button>
            );
          })}
        </div>
        <h2 className="sr-only">
          {dayName(day)}
          {day === clock.dayIndex ? " (today)" : ""}
        </h2>
        <DayList week={week} day={day} clock={clock} next={next} cat={cat} tf={timeFormat} />
      </div>

      <div className="hidden md:block">
        <WeekTable week={week} clock={clock} next={next} cat={cat} tf={timeFormat} />
      </div>

      <SubjectKey subjects={[...week.subjects.values()]} />
    </div>
  );
}
