"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock,
  HelpCircle,
  Loader2,
  Minus,
  Pencil,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDay } from "@/lib/attendance-days";
import { cn } from "@/lib/utils";
import {
  OD_KIND_LABEL,
  entryDateLabel,
  entryHoursLabel,
  plural,
  subjectCounts,
  type OdCheck,
  type OdEntry,
  type OdHourStatus,
} from "@/lib/od";

/** Status is always an icon with its own shape plus words, so it reads without colour. */
const HOUR_STATUS: Record<OdHourStatus, { Icon: LucideIcon; className: string; text: string }> = {
  updated: { Icon: CheckCircle2, className: "text-success", text: "Present" },
  pending: { Icon: XCircle, className: "text-danger", text: "Absent" },
  "not-entered": { Icon: Clock, className: "text-muted-foreground", text: "Not entered yet" },
  upcoming: { Icon: CircleDashed, className: "text-muted-foreground", text: "Upcoming" },
  unchecked: { Icon: HelpCircle, className: "text-muted-foreground", text: "Not checked" },
};

/** "Not updated yet, 8 days" and friends. */
export function OdStatusBadge({ check, checking }: { check: OdCheck; checking: boolean }) {
  if (checking) {
    return (
      <Badge variant="muted">
        <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
        Checking the ERP
      </Badge>
    );
  }
  switch (check.status) {
    case "updated":
      return <Badge variant="success">Updated in ERP</Badge>;
    case "pending": {
      const days = check.pendingDays ?? 0;
      return (
        <Badge variant={check.followUp ? "danger" : "warning"}>
          Not updated yet{days > 0 ? `, ${plural(days, "day")}` : ""}
        </Badge>
      );
    }
    case "not-entered":
      return (
        <Badge variant="muted">
          <Clock className="h-3 w-3 shrink-0" aria-hidden />
          Not entered yet
        </Badge>
      );
    case "upcoming":
      return (
        <Badge variant="outline">
          <CircleDashed className="h-3 w-3 shrink-0" aria-hidden />
          Upcoming
        </Badge>
      );
    case "unchecked":
      return (
        <Badge variant="muted">
          <HelpCircle className="h-3 w-3 shrink-0" aria-hidden />
          Not checked
        </Badge>
      );
    case "no-classes":
      return (
        <Badge variant="muted">
          <Minus className="h-3 w-3 shrink-0" aria-hidden />
          No classes
        </Badge>
      );
  }
}

/** One logged OD or leave: what it covers, what the ERP shows, and its actions. */
export function OdEntryItem({
  entry,
  check,
  checking,
  celebrate,
  onEdit,
  onDelete,
}: {
  entry: OdEntry;
  check: OdCheck;
  /** the ERP's hours for these dates are still loading */
  checking: boolean;
  /** the ERP caught up since the last visit */
  celebrate: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const detailsId = React.useId();
  const hours = check.hours;
  const subjects = subjectCounts(hours);
  const updated = hours.filter((h) => h.status === "updated").length;
  const pending = hours.filter((h) => h.status === "pending").length;
  const name = `${OD_KIND_LABEL[entry.kind]}, ${entryDateLabel(entry)}`;
  const dates = [...new Set(hours.map((h) => h.date))];

  return (
    <li
      data-testid="od-entry"
      data-od-id={entry.id}
      className={cn(
        "py-4",
        celebrate && "enter -mx-3 rounded-xl bg-success/8 px-3",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-body font-semibold text-foreground">{entryDateLabel(entry)}</h3>
          <p className="text-small text-muted-foreground">
            {OD_KIND_LABEL[entry.kind]} · {entryHoursLabel(entry)}
            {hours.length > 0 ? <span className="tabular-nums"> · {plural(hours.length, "hour")}</span> : null}
          </p>
        </div>
        <OdStatusBadge check={check} checking={checking} />
      </div>

      {celebrate ? (
        <p className="mt-2 flex items-center gap-1.5 text-small font-medium text-success">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
          Updated since your last visit
        </p>
      ) : null}

      {entry.note ? <p className="mt-1.5 break-words text-body text-foreground">{entry.note}</p> : null}

      {subjects.length > 0 ? (
        <p className="mt-1.5 text-small text-muted-foreground">
          {subjects.map((s, i) => (
            <React.Fragment key={s.title}>
              {i > 0 ? ", " : ""}
              {s.title}
              {s.count > 1 ? <span className="tabular-nums"> ×{s.count}</span> : null}
            </React.Fragment>
          ))}
        </p>
      ) : null}

      {!checking && check.status === "pending" && updated > 0 ? (
        <p className="mt-1.5 text-small tabular-nums text-foreground">
          {updated} of {updated + pending} hours updated so far
        </p>
      ) : null}

      {!checking && check.followUp ? (
        <p className="mt-2 flex items-start gap-2 text-small text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Still absent after {plural(check.pendingDays ?? 0, "day")}. Worth a reminder to your class advisor.</span>
        </p>
      ) : null}

      {!entry.counted && check.status !== "updated" ? (
        <p className="mt-1.5 text-small text-muted-foreground">Not counted as attended in the projection.</p>
      ) : null}

      {!checking && check.fromLastCheck ? (
        <p className="mt-1.5 text-small text-muted-foreground">From your last visit: the ERP did not answer for these dates.</p>
      ) : null}

      <div className="-ml-3 mt-1 flex flex-wrap items-center gap-x-1">
        {hours.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((o) => !o)}
          >
            Hour by hour
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${name}`} data-od-edit>
          <Pencil className="h-4 w-4" aria-hidden />
          Edit
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDelete} aria-label={`Delete ${name}`}>
          <Trash2 className="h-4 w-4" aria-hidden />
          Delete
        </Button>
      </div>

      {open ? (
        <div id={detailsId} className="mt-2 space-y-3">
          {dates.map((date) => (
            <div key={date}>
              {dates.length > 1 ? (
                <p className="mb-1.5 text-small font-semibold text-foreground">{formatDay(date)}</p>
              ) : null}
              <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3">
                {hours
                  .filter((h) => h.date === date)
                  .map((h) => {
                    const s = HOUR_STATUS[checking && h.status === "unchecked" ? "unchecked" : h.status];
                    return (
                      <li key={h.hour} className="min-w-0 rounded-lg border border-border px-3 py-2">
                        <p className="flex flex-wrap items-center gap-x-1.5 text-small">
                          <s.Icon className={cn("h-4 w-4 shrink-0", s.className)} aria-hidden />
                          <span className="font-semibold tabular-nums text-foreground">Hour {h.hour}</span>
                          <span className="text-muted-foreground">{s.text}</span>
                        </p>
                        {h.title ? <p className="truncate text-micro text-muted-foreground">{h.title}</p> : null}
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </li>
  );
}
