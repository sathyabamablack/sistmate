"use client";

import * as React from "react";
import Link from "@/components/ui/IntentLink";
import {
  BookOpenCheck,
  CalendarCheck,
  ChevronRight,
  ClipboardCheck,
  FileClock,
  FileUp,
  X,
  type LucideIcon,
} from "lucide-react";
import type { HourlyDay, TimetableSlot } from "@usp/core";
import { buttonClass } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import {
  briefCookieString,
  odLine,
  readBriefCookie,
  selectLines,
  serializeBriefMemory,
  type BriefKind,
  type BriefLine,
  type BriefMemory,
  type BriefTone,
  type OdCount,
} from "@/lib/brief";
import { odSummary, useOdEntries } from "@/lib/od";
import { cn } from "@/lib/utils";

const ICONS: Record<BriefKind, LucideIcon> = {
  attendance: CalendarCheck,
  assignment: FileUp,
  marks: ClipboardCheck,
  od: FileClock,
  exam: BookOpenCheck,
};

const TONES: Record<BriefTone, string> = {
  danger: "text-danger",
  warning: "text-warning",
  primary: "text-primary",
};

/** Merge into the brief's cookie; untouched when nothing changes. */
function remember(patch: BriefMemory) {
  const current = readBriefCookie(document.cookie);
  const next = { ...current, ...patch };
  if (serializeBriefMemory(next) === serializeBriefMemory(current)) return;
  document.cookie = briefCookieString(next, window.location.protocol === "https:");
}

const subscribeNever = () => () => {};

/**
 * "To do today": the brief's lines (lib/brief.ts), drawn on the server, plus the OD line
 * from this browser's OD tracker. Until the tracker has been read, the OD line comes from
 * the count saved on the last visit, so the card keeps its height through hydration.
 * Dismissing hides it until the next campus day and brings back `fallback`, the exam chip
 * the brief stood in for.
 */
export function MorningBrief({
  lines,
  today,
  memory,
  hourly,
  timetable,
  fallback,
}: {
  lines: BriefLine[];
  today: string;
  /** What to remember for the next visit (from `buildBrief`). */
  memory: BriefMemory;
  hourly: HourlyDay[];
  timetable: TimetableSlot[];
  fallback?: React.ReactNode;
}) {
  const { entries, ready } = useOdEntries();
  const live = React.useMemo<OdCount | null>(() => {
    if (!ready) return null;
    const s = odSummary(entries, hourly, timetable, { today });
    return { pending: s.pending, oldestDays: s.oldestPendingDays };
  }, [ready, entries, hourly, timetable, today]);
  const od = odLine(live ?? memory.od);
  const shown = selectLines(od ? [...lines, od] : lines);

  // A page restored from history can predate a dismissal made since.
  const dismissedEarlier = React.useSyncExternalStore(
    subscribeNever,
    () => readBriefCookie(document.cookie).dismissed === today,
    () => false,
  );
  const [dismissed, setDismissed] = React.useState(false);
  // Keyboard and screen reader users land on the note that replaces the card, not on <body>.
  const focusOnMount = React.useCallback((el: HTMLParagraphElement | null) => el?.focus(), []);

  // The marks seen and the OD count, for the next visit's server render.
  React.useEffect(() => {
    remember({ user: memory.user, seen: memory.seen, fresh: memory.fresh, ...(live ? { od: live } : {}) });
  }, [memory, live]);

  if (dismissed || dismissedEarlier) {
    return (
      <>
        {dismissed ? (
          <p
            ref={focusOnMount}
            tabIndex={-1}
            role="status"
            className="rounded-md text-small text-muted-foreground outline-hidden"
          >
            Hidden until tomorrow.
          </p>
        ) : null}
        {fallback}
      </>
    );
  }
  if (shown.length === 0) return null;

  return (
    <section aria-labelledby="brief-heading">
      <Panel padded={false} className="px-4 pb-1 pt-3 sm:px-5">
        {/* The button's negative margins keep its 44px target without making the row that tall. */}
        <div className="flex items-center justify-between gap-3">
          <h2 id="brief-heading" className="text-small font-semibold text-muted-foreground">
            To do today
          </h2>
          <button
            type="button"
            aria-label="Dismiss for today"
            onClick={() => {
              remember({ dismissed: today });
              setDismissed(true);
            }}
            className={buttonClass("ghost", "icon", "relative -my-3 -mr-3 shrink-0 lg:h-8 lg:w-8 lg:-my-1.5 lg:-mr-2")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <ul className="divide-y divide-border">
          {shown.map((line) => {
            const Icon = ICONS[line.kind];
            return (
              <li key={line.id}>
                <Link
                  href={line.href}
                  className="group focusable flex min-h-11 items-start gap-3 rounded-md py-2"
                >
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TONES[line.tone])} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body text-foreground group-hover:underline group-hover:underline-offset-4">
                      {line.text}
                    </span>
                    {line.detail ? (
                      <span className="block text-small text-muted-foreground">{line.detail}</span>
                    ) : null}
                  </span>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </Panel>
    </section>
  );
}
