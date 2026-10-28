"use client";

import * as React from "react";
import { Check, XCircle } from "lucide-react";
import { addDays, isDateKey, type HourlyDay, type TimetableSlot } from "@usp/core";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { fieldClass, labelClass } from "@/components/ui/field";
import { formatDay } from "@/lib/attendance-days";
import { rangeDays } from "@/lib/attendance-range";
import type { TimeFormat } from "@/lib/prefs";
import { cn, formatTime } from "@/lib/utils";
import {
  OD_KINDS,
  OD_KIND_LABEL,
  OD_MAX_AHEAD_DAYS,
  OD_MAX_BACK_DAYS,
  OD_MAX_NOTE,
  OD_MAX_RANGE_DAYS,
  defaultCounted,
  entryHours,
  erpHours,
  hourOptions,
  plural,
  recentAbsences,
  shortTitle,
  subjectCounts,
  validateDraft,
  type AbsenceSuggestion,
  type OdDraft,
  type OdDraftErrors,
  type OdEntry,
  type OdEntryFields,
  type OdKind,
} from "@/lib/od";

export interface OdFormRequest {
  /** a new number per opening, so the fields start fresh */
  seq: number;
  mode: "add" | "edit";
  id?: string;
  draft: OdDraft;
}

/** Bottom sheet on phones (thumb reach), a centred dialog from lg up. */
const SHEET =
  "flex max-h-[92dvh] flex-col p-0 lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-[6vh] lg:max-h-[88vh] lg:w-[calc(100%-2rem)] lg:max-w-lg lg:-translate-x-1/2 lg:rounded-2xl";

/** Choice chips: a real radio or checkbox, drawn as a pill. */
const CHIP =
  "flex min-h-11 items-center justify-center rounded-full border border-input bg-surface px-4 text-small font-medium text-foreground transition-colors hover:bg-muted peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface lg:min-h-9";

/** A two-way switch drawn on a muted track. */
const SEGMENT =
  "flex min-h-11 items-center justify-center rounded-md px-3 text-small font-medium text-muted-foreground transition-colors peer-checked:bg-surface peer-checked:text-foreground peer-checked:shadow-rest peer-focus-visible:ring-2 peer-focus-visible:ring-ring lg:min-h-9";

const errorClass = "mt-1.5 text-small font-medium text-danger";

export function OdForm({
  open,
  request,
  onOpenChange,
  onSave,
  timetable,
  hourly,
  entries,
  today,
  timeFormat,
}: {
  open: boolean;
  request: OdFormRequest | null;
  onOpenChange: (open: boolean) => void;
  onSave: (fields: OdEntryFields, request: OdFormRequest) => void;
  timetable: TimetableSlot[];
  hourly: HourlyDay[];
  entries: OdEntry[];
  today: string;
  timeFormat: TimeFormat;
}) {
  const title = request?.mode === "edit" ? "Edit entry" : "Log an OD or leave";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent placement="bottom" className={SHEET} aria-describedby="od-form-note">
        <div className="border-b border-border px-5 pb-3 pt-5 pr-14">
          <DialogTitle className="font-display text-heading font-semibold text-foreground">{title}</DialogTitle>
        </div>
        {request ? (
          <FormBody
            key={request.seq}
            request={request}
            onSave={onSave}
            onCancel={() => onOpenChange(false)}
            timetable={timetable}
            hourly={hourly}
            entries={entries}
            today={today}
            timeFormat={timeFormat}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function FormBody({
  request,
  onSave,
  onCancel,
  timetable,
  hourly,
  entries,
  today,
  timeFormat,
}: {
  request: OdFormRequest;
  onSave: (fields: OdEntryFields, request: OdFormRequest) => void;
  onCancel: () => void;
  timetable: TimetableSlot[];
  hourly: HourlyDay[];
  entries: OdEntry[];
  today: string;
  timeFormat: TimeFormat;
}) {
  const [draft, setDraft] = React.useState<OdDraft>(request.draft);
  const [errors, setErrors] = React.useState<OdDraftErrors>({});
  // Until the student flips "Counts as attended" themselves, it follows the type.
  const [countedTouched, setCountedTouched] = React.useState(request.mode === "edit");
  const formRef = React.useRef<HTMLFormElement>(null);
  const uid = React.useId();
  const id = (name: string) => `${uid}-${name}`;

  const patch = (next: Partial<OdDraft>) => {
    setDraft((d) => ({ ...d, ...next }));
    setErrors((e) => {
      const cleared = { ...e };
      if ("from" in next || "multi" in next) delete cleared.from;
      if ("to" in next || "multi" in next) delete cleared.to;
      if ("hours" in next || "wholeDay" in next) delete cleared.hours;
      return cleared;
    });
  };

  const setKind = (kind: OdKind) =>
    setDraft((d) => ({ ...d, kind, counted: countedTouched ? d.counted : defaultCounted(kind) }));

  const lastDay = draft.multi && isDateKey(draft.to) && draft.to >= draft.from ? draft.to : draft.from;
  const datesOk = isDateKey(draft.from) && rangeDays({ from: draft.from, to: lastDay }) <= OD_MAX_RANGE_DAYS;
  const options = React.useMemo(
    () => (datesOk ? hourOptions(timetable, draft.from, lastDay) : []),
    [datesOk, timetable, draft.from, lastDay],
  );
  const optionHours = React.useMemo(() => new Set(options.map((o) => o.hour)), [options]);
  const singleDay = draft.from === lastDay;
  // On one past day, the hours the ERP marked absent are flagged so they are easy to pick.
  const absentThatDay = React.useMemo(() => {
    if (!singleDay) return new Set<number>();
    return new Set(hourly.find((d) => d.date === draft.from)?.absentHours ?? []);
  }, [singleDay, hourly, draft.from]);

  // Whole day (or the picked hours): which classes that is, from the timetable and the ERP.
  const covered = React.useMemo(() => {
    if (!datesOk) return null;
    const hours = draft.wholeDay ? null : draft.hours.filter((h) => optionHours.has(h));
    if (hours && hours.length === 0) return null;
    return entryHours({ from: draft.from, to: lastDay, hours }, erpHours(hourly), timetable, today);
  }, [datesOk, draft.wholeDay, draft.hours, draft.from, lastDay, optionHours, hourly, timetable, today]);

  const suggestions = React.useMemo(
    () => (request.mode === "add" ? recentAbsences(hourly, entries, today) : []),
    [request.mode, hourly, entries, today],
  );

  const pickSuggestion = (s: AbsenceSuggestion) =>
    patch({ from: s.date, to: "", multi: false, wholeDay: s.wholeDay || s.hours.length === 0, hours: s.wholeDay ? [] : s.hours });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const hours = optionHours.size > 0 ? draft.hours.filter((h) => optionHours.has(h)) : draft.hours;
    const result = validateDraft({ ...draft, hours }, today);
    if (!result.ok) {
      setErrors(result.errors);
      const first = (["from", "to", "hours"] as const).find((k) => result.errors[k]);
      const target = first === "hours" ? formRef.current?.querySelector<HTMLInputElement>(`[name="${id("hour")}"]`) : document.getElementById(id(first ?? "from"));
      target?.focus();
      return;
    }
    onSave(result.value, request);
  };

  const minDate = addDays(today, -OD_MAX_BACK_DAYS);
  const maxDate = addDays(today, OD_MAX_AHEAD_DAYS);
  const countedHint =
    draft.kind === "od"
      ? "Approved ODs count as attended. Only changes the projection."
      : "Turn on if your department counts it as attended. Only changes the projection.";

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <fieldset>
          <legend className={labelClass}>Type</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {OD_KINDS.map((kind) => (
              <label key={kind} className="relative">
                <input
                  type="radio"
                  name={id("kind")}
                  value={kind}
                  checked={draft.kind === kind}
                  onChange={() => setKind(kind)}
                  className="peer sr-only"
                />
                <span className={CHIP}>{OD_KIND_LABEL[kind]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {suggestions.length > 0 ? (
          <div>
            <p id={id("recent")} className={labelClass}>
              Marked absent recently
            </p>
            <ul aria-labelledby={id("recent")} className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((s) => {
                const active = !draft.multi && draft.from === s.date;
                return (
                  <li key={s.date}>
                    <button
                      type="button"
                      onClick={() => pickSuggestion(s)}
                      aria-pressed={active}
                      className={cn(
                        "focusable inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-small transition-colors lg:min-h-9",
                        active
                          ? "border-primary bg-accent text-accent-foreground"
                          : "border-input bg-surface text-foreground hover:bg-muted",
                      )}
                    >
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-danger" aria-hidden />
                      <span className="font-medium">{formatDay(s.date)}</span>
                      <span className="text-muted-foreground">{plural(s.absent, "hour")}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={id("from")} className={labelClass}>
                {draft.multi ? "First day" : "Date"}
              </label>
              <input
                id={id("from")}
                type="date"
                required
                value={draft.from}
                min={minDate}
                max={maxDate}
                onChange={(e) => patch({ from: e.target.value })}
                aria-invalid={errors.from ? true : undefined}
                aria-describedby={errors.from ? id("from-error") : undefined}
                className={cn(fieldClass, "mt-1.5")}
              />
              {errors.from ? (
                <p id={id("from-error")} className={errorClass}>
                  {errors.from}
                </p>
              ) : null}
            </div>
            {draft.multi ? (
              <div>
                <label htmlFor={id("to")} className={labelClass}>
                  Last day
                </label>
                <input
                  id={id("to")}
                  type="date"
                  required
                  value={draft.to}
                  min={isDateKey(draft.from) ? addDays(draft.from, 1) : minDate}
                  max={maxDate}
                  onChange={(e) => patch({ to: e.target.value })}
                  aria-invalid={errors.to ? true : undefined}
                  aria-describedby={errors.to ? id("to-error") : undefined}
                  className={cn(fieldClass, "mt-1.5")}
                />
                {errors.to ? (
                  <p id={id("to-error")} className={errorClass}>
                    {errors.to}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          <label className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-lg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring lg:min-h-9">
            <input
              type="checkbox"
              checked={draft.multi}
              onChange={(e) => patch({ multi: e.target.checked, to: e.target.checked ? draft.to : "" })}
              className="h-5 w-5 shrink-0 cursor-pointer accent-primary"
            />
            <span className="text-body text-foreground">Several days</span>
          </label>
        </div>

        <fieldset>
          <legend className={labelClass}>Hours</legend>
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {[
              { whole: true, label: "Whole day" },
              { whole: false, label: "Some hours" },
            ].map((o) => (
              <label key={o.label} className="relative">
                <input
                  type="radio"
                  name={id("span")}
                  checked={draft.wholeDay === o.whole}
                  onChange={() => patch({ wholeDay: o.whole })}
                  className="peer sr-only"
                />
                <span className={SEGMENT}>{o.label}</span>
              </label>
            ))}
          </div>

          {!draft.wholeDay ? (
            options.length > 0 ? (
              <div
                role="group"
                aria-label={singleDay ? `Hours on ${datesOk ? formatDay(draft.from) : "that day"}` : "Hours on each day"}
                aria-describedby={errors.hours ? id("hours-error") : undefined}
                className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"
              >
                {options.map((o) => {
                  const checked = draft.hours.includes(o.hour);
                  const absent = absentThatDay.has(o.hour);
                  const detail = o.subject ? shortTitle(o.subject.title) : formatTime(o.start, timeFormat);
                  return (
                    <label key={o.hour} className="group relative" title={o.subject?.title}>
                      <input
                        type="checkbox"
                        name={id("hour")}
                        checked={checked}
                        onChange={(e) =>
                          patch({
                            hours: e.target.checked
                              ? [...draft.hours, o.hour].sort((a, b) => a - b)
                              : draft.hours.filter((h) => h !== o.hour),
                          })
                        }
                        aria-label={`Hour ${o.hour}, ${o.subject?.title ?? formatTime(o.start, timeFormat)}${absent ? ", marked absent" : ""}`}
                        className="peer sr-only"
                      />
                      <span className="flex min-h-14 cursor-pointer items-center gap-2 rounded-lg border border-input bg-surface px-3 py-2 transition-colors hover:bg-muted peer-checked:border-primary peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface">
                        <span className="min-w-0 flex-1">
                          <span className="block text-small font-semibold tabular-nums text-foreground">Hour {o.hour}</span>
                          <span className="block truncate text-micro text-muted-foreground">
                            {detail}
                            {absent ? <span className="text-danger"> · absent</span> : null}
                          </span>
                        </span>
                        <Check
                          className="h-4 w-4 shrink-0 text-primary opacity-0 transition-opacity group-has-checked:opacity-100"
                          aria-hidden
                        />
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-small text-muted-foreground">
                {datesOk ? "No classes on your timetable that day." : "Pick a date to see its hours."}
              </p>
            )
          ) : null}
          {errors.hours ? (
            <p id={id("hours-error")} className={errorClass}>
              {errors.hours}
            </p>
          ) : null}
          <CoverageLine hours={covered} />
        </fieldset>

        <div>
          <label htmlFor={id("note")} className={labelClass}>
            Note <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id={id("note")}
            type="text"
            value={draft.note}
            maxLength={OD_MAX_NOTE}
            placeholder="e.g. Hackathon at IIT Madras"
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => patch({ note: e.target.value })}
            className={cn(fieldClass, "mt-1.5")}
          />
        </div>

        <label
          htmlFor={id("counted")}
          className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg py-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
        >
          <input
            id={id("counted")}
            type="checkbox"
            checked={draft.counted}
            onChange={(e) => {
              setCountedTouched(true);
              patch({ counted: e.target.checked });
            }}
            aria-describedby={id("counted-hint")}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-primary"
          />
          <span className="min-w-0">
            <span className="block text-body font-medium text-foreground">Counts as attended</span>
            <span id={id("counted-hint")} className="block text-small text-muted-foreground">
              {countedHint}
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:items-center sm:justify-end">
        <p id="od-form-note" className="text-micro text-muted-foreground sm:mr-auto">
          Saved on this device only.
        </p>
        <Button type="button" variant="ghost" onClick={onCancel} className="hidden sm:inline-flex">
          Cancel
        </Button>
        <Button type="submit" className="w-full sm:w-auto">
          {request.mode === "edit" ? "Save changes" : "Save"}
        </Button>
      </div>
    </form>
  );
}

/** "Covers 7 hours: WTL ×2 · CN · OS" */
function CoverageLine({ hours }: { hours: ReturnType<typeof entryHours> | null }) {
  if (!hours) return null;
  if (hours.length === 0) {
    return <p className="mt-3 text-small text-muted-foreground">No classes on your timetable for these dates.</p>;
  }
  const subjects = subjectCounts(hours);
  return (
    <p className="mt-3 text-small text-muted-foreground">
      <span className="font-medium text-foreground">Covers {plural(hours.length, "hour")}</span>
      {subjects.some((s) => !s.title.startsWith("Hour ")) ? (
        <>
          :{" "}
          {subjects
            .map((s) => `${s.title.startsWith("Hour ") ? s.title : shortTitle(s.title)}${s.count > 1 ? ` ×${s.count}` : ""}`)
            .join(" · ")}
        </>
      ) : null}
    </p>
  );
}
