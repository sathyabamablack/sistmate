"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn, formatTime } from "@/lib/utils";
import type { TimeFormat } from "@/lib/prefs";
import { DAILY_RULE, type DailyVerdict, type HourlyVerdict } from "@/lib/attendance-days";
import { HourChips } from "./HourChips";
import { toneIcon } from "./status";

function Verdict({
  id,
  label,
  verdict,
  children,
}: {
  id: string;
  label: string;
  verdict: Pick<DailyVerdict, "tone" | "title" | "detail">;
  children?: React.ReactNode;
}) {
  const { Icon, className } = toneIcon[verdict.tone];
  return (
    <div role="group" aria-labelledby={id} className="min-w-0 space-y-3 rounded-xl border border-border p-4">
      <h3 id={id} className="text-small font-semibold text-muted-foreground">
        {label}
      </h3>
      <div role="status" className="flex items-start gap-2.5">
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", className)} aria-hidden />
        <div className="min-w-0">
          <p className="font-display text-subheading font-semibold text-foreground">{verdict.title}</p>
          {verdict.detail ? <p className="mt-0.5 text-small text-muted-foreground">{verdict.detail}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * Today's two separate verdicts from the ERP: the day-wise one (present unless
 * marked absent, from 3 pm) and the hour-wise one (hours entered by faculty).
 * "Check again" drops the saved copy and reloads both.
 */
export function TodayAttendance({
  daily,
  hourly,
  dateLabel,
  checkedAt,
  timeFormat = "12h",
}: {
  daily: DailyVerdict;
  hourly: HourlyVerdict;
  /** "Monday, 12 October" */
  dateLabel: string;
  /** when the page was rendered, ISO */
  checkedAt: string;
  timeFormat?: TimeFormat;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [refreshing, startTransition] = React.useTransition();

  async function checkAgain() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      startTransition(() => router.refresh());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body font-medium text-foreground">{dateLabel}</p>
        <div className="flex items-center gap-3">
          <p className="text-micro text-muted-foreground">Checked at {formatTime(checkedAt, timeFormat)}</p>
          <Button variant="outline" size="sm" onClick={checkAgain} loading={busy || refreshing}>
            {busy || refreshing ? null : <RefreshCw className="h-4 w-4" aria-hidden />}
            Check again
          </Button>
        </div>
      </div>

      {failed ? (
        <p role="status" className="text-small text-danger">
          Couldn&apos;t reach the portal.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Verdict id="today-daily" label="Daily attendance" verdict={daily}>
          <p className="text-micro text-muted-foreground">{DAILY_RULE}</p>
        </Verdict>
        <Verdict id="today-hourly" label="Hour-wise attendance" verdict={hourly}>
          <HourChips chips={hourly.chips} />
        </Verdict>
      </div>
    </div>
  );
}
