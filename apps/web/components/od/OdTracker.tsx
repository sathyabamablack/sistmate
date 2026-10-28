"use client";

import * as React from "react";
import { ClipboardList, Copy, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import type { HourlyDay, TimetableSlot } from "@usp/core";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { Section } from "@/components/ui/Section";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDay } from "@/lib/attendance-days";
import type { DateRange } from "@/lib/attendance-range";
import type { TimeFormat } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import {
  OD_KIND_LABEL,
  advisorText,
  checkEntry,
  draftFromEntry,
  emptyDraft,
  entryDateLabel,
  erpHours,
  justUpdated,
  nextLastSeen,
  odFetchRange,
  odProjection,
  plural,
  recentAbsences,
  useOdEntries,
  type AbsenceSuggestion,
  type OdCheck,
  type OdDraft,
  type OdEntry,
  type OdEntryFields,
  type OdLastSeen,
  type OdStatus,
  type OdSubject,
} from "@/lib/od";
import { OdEntryItem } from "./OdEntryItem";
import { OdForm, type OdFormRequest } from "./OdForm";
import { OdProjection } from "./OdProjection";
import { useOlderHours } from "./useOlderHours";

interface Item {
  entry: OdEntry;
  check: OdCheck;
}

/** Waiting entries: still absent first (oldest first), then the rest. */
const RANK: Record<OdStatus, number> = {
  pending: 0,
  "not-entered": 1,
  unchecked: 2,
  "no-classes": 3,
  upcoming: 4,
  updated: 5,
};

const UNDO_MS = 10_000;
const NOTICE_MS = 6_000;

export function OdTracker({
  today,
  timetable,
  hourly,
  windowFrom,
  subjects,
  threshold,
  timeFormat,
  student,
}: {
  today: string;
  timetable: TimetableSlot[];
  /** the dashboard's hour-wise days (the last 14) */
  hourly: HourlyDay[];
  /** first day of those 14; null when the section did not load */
  windowFrom: string | null;
  subjects: OdSubject[];
  threshold: number;
  timeFormat: TimeFormat;
  student: { name?: string; registerNumber?: string };
}) {
  const od = useOdEntries();
  const { entries, ready, remember } = od;

  // Older dates than the dashboard's 14 days: one request per visit for the entries that need them.
  const needed = React.useMemo(
    () => (ready ? odFetchRange(entries, windowFrom, today) : null),
    [ready, entries, windowFrom, today],
  );
  const older = useOlderHours(needed?.from ?? null, needed?.to ?? null);

  const erp = React.useMemo(() => {
    const ranges: DateRange[] = [];
    if (windowFrom) ranges.push({ from: windowFrom, to: today });
    if (older.range) ranges.push(older.range);
    // The dashboard's copy is the fresher one where both have a date.
    return erpHours([...older.days, ...hourly], ranges);
  }, [windowFrom, today, older.range, older.days, hourly]);

  const items: Item[] = React.useMemo(
    () => entries.map((entry) => ({ entry, check: checkEntry(entry, erp, timetable, today) })),
    [entries, erp, timetable, today],
  );
  const loading = older.status === "loading";
  const isChecking = (check: OdCheck) => loading && check.hours.some((h) => h.status === "unchecked");

  // Remember what the ERP showed, so later visits can tell when it catches up.
  React.useEffect(() => {
    if (!ready || loading) return;
    const seen = new Map<string, OdLastSeen>();
    for (const { entry, check } of items) {
      const next = nextLastSeen(entry, check, today);
      if (next && next !== entry.last) seen.set(entry.id, next);
    }
    remember(seen);
  }, [ready, loading, items, today, remember]);

  const waiting = items
    .filter((i) => i.check.status !== "updated")
    .sort((a, b) => RANK[a.check.status] - RANK[b.check.status] || a.entry.from.localeCompare(b.entry.from));
  const done = items
    .filter((i) => i.check.status === "updated")
    .sort((a, b) => b.entry.from.localeCompare(a.entry.from));
  const pending = items.filter((i) => i.check.status === "pending");
  const oldest = pending.reduce<number | null>((max, i) => Math.max(max ?? 0, i.check.pendingDays ?? 0), null);
  const absentHours = new Set(
    pending.flatMap((i) => i.check.hours.filter((h) => h.status === "pending").map((h) => `${h.date}#${h.hour}`)),
  ).size;
  const celebrated = items.filter((i) => justUpdated(i.entry, today));
  const projection = React.useMemo(() => odProjection(items, subjects, threshold), [items, subjects, threshold]);
  const hasProjection = projection.rows.length > 0 || projection.uncounted > 0;
  const suggestions = React.useMemo(() => recentAbsences(hourly, entries, today, 2), [hourly, entries, today]);

  /* ------------------------------ form ------------------------------ */
  const [formOpen, setFormOpen] = React.useState(false);
  const [request, setRequest] = React.useState<OdFormRequest | null>(null);
  const seq = React.useRef(0);
  const openForm = (draft: OdDraft, mode: OdFormRequest["mode"], id?: string) => {
    seq.current += 1;
    setRequest({ seq: seq.current, mode, id, draft });
    setFormOpen(true);
  };
  const logNew = () => openForm(emptyDraft(today), "add");
  const logSuggestion = (s: AbsenceSuggestion) =>
    openForm(
      { ...emptyDraft(today), from: s.date, wholeDay: s.wholeDay || s.hours.length === 0, hours: s.wholeDay ? [] : s.hours },
      "add",
    );

  /* ------------------------ notices and undo ------------------------ */
  const [notice, setNotice] = React.useState("");
  const [undo, setUndo] = React.useState<{ entry: OdEntry; index: number; label: string } | null>(null);
  const [holdUndo, setHoldUndo] = React.useState(false);
  const [manualCopy, setManualCopy] = React.useState<string | null>(null);
  const undoRef = React.useRef<HTMLButtonElement>(null);
  const focusAfterRestore = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(""), NOTICE_MS);
    return () => window.clearTimeout(t);
  }, [notice]);

  React.useEffect(() => {
    if (!undo || holdUndo) return;
    const t = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(t);
  }, [undo, holdUndo]);

  // The deleted row's buttons are gone: keep the keyboard on Undo, and after Undo on the row again.
  React.useEffect(() => {
    if (undo) undoRef.current?.focus();
  }, [undo]);
  React.useEffect(() => {
    const id = focusAfterRestore.current;
    if (!id) return;
    const edit = document.querySelector<HTMLButtonElement>(`[data-od-id="${CSS.escape(id)}"] [data-od-edit]`);
    if (edit) {
      focusAfterRestore.current = null;
      edit.focus();
    }
  }, [items]);

  const save = (fields: OdEntryFields, req: OdFormRequest) => {
    if (req.mode === "edit" && req.id) {
      od.update(req.id, fields);
      setNotice("Changes saved.");
    } else {
      od.add(fields);
      setNotice(`Saved: ${OD_KIND_LABEL[fields.kind]}, ${entryDateLabel(fields)}.`);
    }
    setFormOpen(false);
  };

  const remove = (entry: OdEntry) => {
    const removed = od.remove(entry.id);
    if (!removed) return;
    setHoldUndo(false);
    setUndo({ ...removed, label: `${OD_KIND_LABEL[entry.kind]}, ${entryDateLabel(entry)}` });
  };

  const restore = () => {
    if (!undo) return;
    od.restore(undo.entry, undo.index);
    focusAfterRestore.current = undo.entry.id;
    setUndo(null);
    setNotice("Entry restored.");
  };

  const copyForAdvisor = async () => {
    const text = advisorText(items, student);
    if (!text) return;
    // Phones get the share sheet (WhatsApp, mail); computers copy to the clipboard.
    const touch = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    if (touch && typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        setNotice("Shared.");
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copied. Paste it into WhatsApp or an email to your class advisor.");
    } catch {
      setManualCopy(text);
    }
  };

  /* ------------------------------ render ------------------------------ */
  if (!ready) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading your entries">
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const renderList = (list: Item[]) => (
    <ul className="divide-y divide-border border-y border-border">
      {list.map(({ entry, check }) => (
        <OdEntryItem
          key={entry.id}
          entry={entry}
          check={check}
          checking={isChecking(check)}
          celebrate={justUpdated(entry, today)}
          onEdit={() => openForm(draftFromEntry(entry), "edit", entry.id)}
          onDelete={() => remove(entry)}
        />
      ))}
    </ul>
  );

  return (
    <div className="space-y-8">
      {entries.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No OD or leave logged"
          description="Log the hours you missed on duty or on leave, and see your real attendance while the ERP catches up."
        >
          <div className="space-y-4">
            <Button type="button" onClick={logNew}>
              <Plus className="h-4 w-4" aria-hidden />
              Log an OD or leave
            </Button>
            <Suggestions suggestions={suggestions} onLog={logSuggestion} />
          </div>
        </EmptyState>
      ) : (
        <Panel className="enter space-y-4">
          {celebrated.length > 0 ? (
            <p className="flex items-start gap-2 text-body font-medium text-success">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <span>
                The ERP caught up on {celebrated.map((i) => entryDateLabel(i.entry)).join(", ")}.
              </span>
            </p>
          ) : null}
          <div className="space-y-1">
            <p className="font-display text-heading font-semibold text-foreground" data-testid="od-headline">
              {loading && pending.length === 0
                ? "Checking the ERP…"
                : pending.length > 0
                  ? `${plural(pending.length, "entry", "entries")} not updated in the ERP yet`
                  : waiting.length === 0
                    ? "All updated in the ERP"
                    : "Nothing marked absent right now"}
            </p>
            <p className="text-body text-muted-foreground">
              {pending.length > 0
                ? `${plural(absentHours, "hour")} still ${absentHours === 1 ? "shows" : "show"} as absent. ${
                    oldest ? `The oldest has waited ${plural(oldest, "day")}.` : "Marked absent today."
                  }`
                : waiting.length === 0
                  ? "Every hour you logged now shows as present."
                  : `${plural(waiting.length, "entry", "entries")} upcoming or not entered by faculty yet.`}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="button" onClick={logNew}>
              <Plus className="h-4 w-4" aria-hidden />
              Log an OD or leave
            </Button>
            {pending.length > 0 ? (
              <Button type="button" variant="outline" onClick={copyForAdvisor}>
                <Copy className="h-4 w-4" aria-hidden />
                Copy for your class advisor
              </Button>
            ) : null}
          </div>
        </Panel>
      )}

      <FetchNote
        windowFrom={windowFrom}
        status={older.status}
        staleNotice={older.staleNotice}
        onRetry={older.retry}
        hasEntries={entries.length > 0}
      />

      {entries.length > 0 && suggestions.length > 0 ? <Suggestions suggestions={suggestions} onLog={logSuggestion} /> : null}

      {/* Phones: waiting, the projection, then updated. From lg the projection sits beside the lists and stays in view. */}
      <div
        className={cn(
          "flex flex-col gap-8",
          hasProjection && "lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr] lg:gap-x-10",
        )}
      >
        {waiting.length > 0 ? (
          <Section id="od-waiting" title="Waiting for the ERP" className="lg:col-start-1 lg:row-start-1">
            {renderList(waiting)}
          </Section>
        ) : null}

        {hasProjection ? (
          <Section
            id="od-projection"
            title="Attendance after your ODs"
            className="lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start"
          >
            <OdProjection projection={projection} threshold={threshold} />
          </Section>
        ) : null}

        {done.length > 0 ? (
          <Section id="od-updated" title="Updated in the ERP" className="lg:col-start-1 lg:row-start-2">
            {renderList(done)}
          </Section>
        ) : null}
      </div>

      {entries.length > 0 ? <p className="text-small text-muted-foreground">Saved on this device only.</p> : null}

      <p role="status" aria-live="polite" className="sr-only">
        {undo ? `Deleted ${undo.label}.` : notice}
      </p>

      {notice && !undo ? (
        <div className="pointer-events-none fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md lg:bottom-6" aria-hidden>
          <p data-testid="od-toast" className="enter rounded-xl bg-foreground px-4 py-3 text-small text-background shadow-pop">
            {notice}
          </p>
        </div>
      ) : null}

      {undo ? (
        <div
          data-testid="od-undo"
          className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center gap-1 rounded-xl bg-foreground py-1 pl-4 pr-1 text-background shadow-pop lg:bottom-6"
          onFocus={() => setHoldUndo(true)}
          onBlur={() => setHoldUndo(false)}
          onMouseEnter={() => setHoldUndo(true)}
          onMouseLeave={() => setHoldUndo(false)}
        >
          <p className="min-w-0 flex-1 truncate text-small">Deleted {undo.label}</p>
          <button
            ref={undoRef}
            type="button"
            onClick={restore}
            className="focusable min-h-11 rounded-lg px-3 text-small font-semibold text-background underline-offset-4 hover:underline lg:min-h-9"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => setUndo(null)}
            aria-label="Dismiss"
            className="focusable grid h-11 w-11 place-items-center rounded-lg text-background/80 hover:text-background lg:h-9 lg:w-9"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}

      <OdForm
        open={formOpen}
        request={request}
        onOpenChange={setFormOpen}
        onSave={save}
        timetable={timetable}
        hourly={hourly}
        entries={entries}
        today={today}
        timeFormat={timeFormat}
      />

      <Dialog open={manualCopy !== null} onOpenChange={(o: boolean) => !o && setManualCopy(null)}>
        <DialogContent className="space-y-3 p-5">
          <DialogTitle className="font-display text-heading font-semibold text-foreground">Copy for your class advisor</DialogTitle>
          <DialogDescription className="text-small text-muted-foreground">
            This browser would not copy it. Select the text and copy it yourself.
          </DialogDescription>
          <textarea
            readOnly
            value={manualCopy ?? ""}
            rows={10}
            aria-label="Text for your class advisor"
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-lg border border-input bg-surface p-3 font-mono text-small text-foreground"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Recent days the ERP marked absent that no entry covers yet. */
function Suggestions({ suggestions, onLog }: { suggestions: AbsenceSuggestion[]; onLog: (s: AbsenceSuggestion) => void }) {
  if (suggestions.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label="Marked absent recently">
      {suggestions.map((s) => (
        <li
          key={s.date}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-border bg-surface px-4 py-2"
        >
          <p className="min-w-0 py-1 text-body text-foreground">
            Absent on <span className="font-semibold">{formatDay(s.date)}</span>{" "}
            <span className="tabular-nums text-muted-foreground">({plural(s.absent, "hour")})</span>. Was it an OD or leave?
          </p>
          <Button type="button" variant="ghost" size="sm" className="-mr-2 text-primary" onClick={() => onLog(s)}>
            Log it
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Why some entries could not be checked against the ERP. */
function FetchNote({
  windowFrom,
  status,
  staleNotice,
  onRetry,
  hasEntries,
}: {
  windowFrom: string | null;
  status: ReturnType<typeof useOlderHours>["status"];
  staleNotice: string | null;
  onRetry: () => void;
  hasEntries: boolean;
}) {
  if (!hasEntries) return null;
  if (!windowFrom) {
    return (
      <p className="text-small text-muted-foreground">
        The ERP&apos;s hour-wise attendance did not load just now, so recent entries could not be checked.
      </p>
    );
  }
  if (status === "failed") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-small text-muted-foreground">
          The ERP did not answer for dates before {formatDay(windowFrom)}. Older entries show what your last visit saw.
        </p>
        <Button type="button" variant="ghost" size="sm" className="-ml-3 text-primary sm:ml-0" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          Check again
        </Button>
      </div>
    );
  }
  if (status === "done" && staleNotice) {
    return <p className="text-small text-muted-foreground">Older dates: {staleNotice.toLowerCase()}, the ERP did not answer just now.</p>;
  }
  return null;
}
