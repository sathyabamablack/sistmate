"use client";

import * as React from "react";
import { isDateKey, type HourlyDay } from "@usp/core";
import type { DateRange } from "@/lib/attendance-range";

/**
 * The ERP's hour-wise attendance for dates before the dashboard's 14 days, read from
 * /api/attendance/hourly once per visit (again only when a new entry reaches outside
 * what was read). A failure keeps whatever was read before; `retry` asks again.
 */

export type OlderHoursStatus = "idle" | "loading" | "done" | "failed";

export interface OlderHours {
  status: OlderHoursStatus;
  /** the last successful read; kept while a wider one loads or fails */
  days: HourlyDay[];
  range: DateRange | null;
  staleNotice: string | null;
  retry: () => void;
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isHourList = (v: unknown): v is number[] | undefined =>
  v === undefined || (Array.isArray(v) && v.every((h) => Number.isInteger(h) && h >= 1));

/** One day from the response, or null when it does not look like one. */
function toDay(v: unknown): HourlyDay | null {
  if (typeof v !== "object" || v === null) return null;
  const d = v as Record<string, unknown>;
  if (!isDateKey(d.date) || !isCount(d.totalHours) || !isCount(d.present) || !isCount(d.absent) || !isCount(d.notGiven)) {
    return null;
  }
  if (!isHourList(d.presentHours) || !isHourList(d.absentHours) || !isHourList(d.notGivenHours)) return null;
  return {
    date: d.date,
    totalHours: d.totalHours,
    present: d.present,
    absent: d.absent,
    notGiven: d.notGiven,
    ...(d.presentHours ? { presentHours: d.presentHours } : {}),
    ...(d.absentHours ? { absentHours: d.absentHours } : {}),
    ...(d.notGivenHours ? { notGivenHours: d.notGivenHours } : {}),
  };
}

const covers = (outer: DateRange | null, from: string, to: string) => !!outer && outer.from <= from && outer.to >= to;

export function useOlderHours(from: string | null, to: string | null): OlderHours {
  const [ok, setOk] = React.useState<{ range: DateRange; days: HourlyDay[]; staleNotice: string | null } | null>(null);
  const [failedTag, setFailedTag] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  // Survives StrictMode's second effect run, so a range is asked for once.
  const started = React.useRef<string | null>(null);
  const tag = from && to ? `${from}:${to}#${attempt}` : null;
  const covered = !!from && !!to && covers(ok?.range ?? null, from, to);

  React.useEffect(() => {
    if (!from || !to || !tag || covered || started.current === tag) return;
    started.current = tag;
    const params = new URLSearchParams({ from, to });
    fetch(`/api/attendance/hourly?${params}`, { cache: "no-store", headers: { Accept: "application/json" } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { from?: unknown; to?: unknown; days?: unknown; staleNotice?: unknown };
        if (!isDateKey(body.from) || !isDateKey(body.to) || !Array.isArray(body.days)) throw new Error("Bad reply");
        const days = body.days.map(toDay).filter((d): d is HourlyDay => d !== null);
        // `to` comes back clamped to today; later dates are upcoming anyway, so the asked range counts as read.
        setOk({
          range: { from, to },
          days,
          staleNotice: typeof body.staleNotice === "string" ? body.staleNotice : null,
        });
      })
      .catch(() => setFailedTag(tag));
  }, [from, to, tag, covered]);

  const retry = React.useCallback(() => setAttempt((n) => n + 1), []);
  const status: OlderHoursStatus = !tag ? "idle" : covered ? "done" : failedTag === tag ? "failed" : "loading";
  return { status, days: ok?.days ?? [], range: ok?.range ?? null, staleNotice: ok?.staleNotice ?? null, retry };
}
