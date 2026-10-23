"use client";

import * as React from "react";
import { AlertCircle, Minus, Plus } from "lucide-react";
import { attendanceStats } from "@usp/core";
import { cn } from "@/lib/utils";
import "./landing.css";

const THRESHOLD = 80;
const MAX = 9999;

function parse(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= MAX ? n : null;
}

/** 87.5 → "87.5", 100 → "100". One decimal, never a trailing ".0". */
function formatPct(p: number): string {
  const s = p.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

const stepButton =
  "grid h-14 w-12 shrink-0 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focusable disabled:pointer-events-none disabled:opacity-40 sm:w-14";

/** One big number field with − and + either side. The input stays a native number input. */
function Stepper({
  id,
  label,
  value,
  onChange,
  less,
  more,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Accessible names for the buttons; they must not repeat the field label. */
  less: string;
  more: string;
  invalid?: boolean;
}) {
  const n = parse(value) ?? 0;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-small font-medium text-muted-foreground">
        {label}
      </label>
      <div
        className={cn(
          "flex h-14 items-stretch overflow-hidden rounded-lg border bg-surface",
          invalid ? "border-danger" : "border-input",
        )}
      >
        <button type="button" className={stepButton} aria-label={less} onClick={() => onChange(String(Math.max(0, n - 1)))} disabled={n <= 0}>
          <Minus className="h-5 w-5" aria-hidden />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX}
          step={1}
          autoComplete="off"
          value={value}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
          className="welcome-number w-0 min-w-0 flex-1 border-x border-border bg-transparent text-center font-display text-[1.75rem] font-semibold tabular-nums text-foreground outline-hidden focus-visible:bg-accent/40"
        />
        <button type="button" className={stepButton} aria-label={more} onClick={() => onChange(String(Math.min(MAX, n + 1)))} disabled={n >= MAX}>
          <Plus className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * The welcome page hero: two numbers in, one giant percentage out, drawn as a
 * bar against the 80% line, with the answer as a sentence.
 */
export function SkipCalculator({ footer }: { footer?: React.ReactNode }) {
  const [attended, setAttended] = React.useState("42");
  const [total, setTotal] = React.useState("48");

  const a = parse(attended);
  const t = parse(total);
  const valid = a !== null && t !== null && t > 0 && a <= t;
  const stats = valid ? attendanceStats(a, t, THRESHOLD) : null;

  let error: string | null = null;
  if (a === null || t === null) error = "Enter whole numbers for both fields.";
  else if (t === 0) error = "No hours are marked yet, so there is nothing to calculate.";
  else if (a > t) error = "You can't have attended more hours than were marked.";

  const below = stats ? !stats.safe : false;
  const onLine = stats ? stats.safe && stats.canSkip === 0 : false;
  const fill = !stats ? "bg-muted-foreground/30" : below ? "bg-danger" : onLine ? "bg-warning" : "bg-primary";
  const pct = stats ? formatPct(stats.percentage) : null;

  const answer = !stats
    ? null
    : stats.safe
      ? stats.canSkip === 0
        ? `You're exactly at ${THRESHOLD}%. Skip one and you drop below.`
        : `${stats.canSkip} ${stats.canSkip === 1 ? "class" : "classes"} you can still skip and stay at ${THRESHOLD}% or above.`
      : `${stats.needed} ${stats.needed === 1 ? "class" : "classes"} in a row to attend to get back to ${THRESHOLD}%.`;

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      aria-label="Skip calculator"
      className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_22rem]"
    >
      {/* Inputs first in the DOM (they drive everything); on wide screens they sit right of the figure. */}
      <div className="enter grid grid-cols-2 gap-3 [--i:2] sm:max-w-md lg:col-start-2 lg:row-start-1 lg:max-w-none lg:grid-cols-1 lg:content-end lg:gap-4">
        <Stepper
          id="attended"
          label="Hours attended"
          value={attended}
          onChange={setAttended}
          less="One hour fewer attended"
          more="One more hour attended"
          invalid={a !== null && t !== null && a > t}
        />
        <Stepper
          id="total"
          label="Hours marked so far"
          value={total}
          onChange={setTotal}
          less="One hour fewer marked"
          more="One more hour marked"
        />
      </div>

      <p
        aria-hidden
        className={cn(
          "enter self-end font-display text-[5.5rem] font-semibold leading-[0.85] tracking-[-0.05em] tabular-nums [--i:3] sm:text-[8rem] lg:col-start-1 lg:row-start-1 lg:text-[10.5rem]",
          below ? "text-danger" : stats ? "text-foreground" : "text-muted-foreground/50",
        )}
      >
        {pct ?? "–"}
        <span className="ml-1 align-top text-[0.42em] tracking-normal">%</span>
      </p>

      {/* The bar: the one bold drawing on the page. The amber line echoes the tick in the logo. */}
      <div className="enter relative pb-8 pt-4 [--i:3] lg:col-span-2" aria-hidden>
        <div className="relative h-5 overflow-hidden rounded-full bg-muted sm:h-6">
          <div
            className={cn("welcome-fill h-full rounded-full transition-[width,background-color] duration-500 ease-out-quint", fill)}
            style={{ width: `${stats ? Math.min(100, stats.percentage) : 0}%` }}
          />
        </div>
        <span
          className="welcome-line absolute bottom-6 top-1 w-1 -translate-x-1/2 rounded-full bg-[#e09f1f] ring-2 ring-background"
          style={{ left: `${THRESHOLD}%` }}
        />
        <span
          className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap text-small font-semibold text-foreground"
          style={{ left: `${THRESHOLD}%` }}
        >
          {THRESHOLD}% line
        </span>
      </div>

      <div className="enter min-h-[4.5rem] [--i:4] lg:col-start-1" aria-live="polite">
        {stats ? (
          <p className="max-w-[26ch] font-display text-[1.5rem] font-medium leading-[1.15] tracking-[-0.02em] text-foreground sm:text-[2.25rem]">
            <span className="sr-only">{pct}% attended. </span>
            {answer}
          </p>
        ) : (
          <p role="alert" className="flex max-w-[34ch] items-start gap-2.5 font-display text-[1.25rem] font-medium leading-snug text-foreground sm:text-[1.5rem]">
            <AlertCircle className="mt-1.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
            <span>{error}</span>
          </p>
        )}
      </div>

      {/* Calls to action: under the answer on phones, beside it on wide screens. */}
      {footer ? <div className="enter [--i:5] lg:col-start-2 lg:self-end">{footer}</div> : null}
    </form>
  );
}
