"use client";

import * as React from "react";
import { ChevronDown, Minus, Plus, Target } from "lucide-react";
import type { GradeBand } from "@usp/core";
import { endSemTiles } from "@/lib/endsem";
import { cn } from "@/lib/utils";

/** One browser's adjusted internal mark per subject. Only a number, nothing personal. */
const STORE = "usp-endsem-v1:";

export interface EndSemCardProps {
  code: string;
  /** CAE scores shown as small chips, e.g. { label: "CAE 1", value: "42" }. */
  chips: { label: string; value: string }[];
  /** Internal mark to start from (the CAE average), or null when no CAE is scored yet. */
  start: number | null;
  internalMax: number;
  externalMax: number;
  paperMax: number;
  maxTotal: number;
  scale: GradeBand[];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function readSaved(code: string): number | null {
  try {
    const raw = window.localStorage.getItem(STORE + code);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeSaved(code: string, value: number | null) {
  try {
    if (value === null) window.localStorage.removeItem(STORE + code);
    else window.localStorage.setItem(STORE + code, String(value));
  } catch {
    /* blocked storage only means the adjustment is forgotten on reload */
  }
}

/** Grade tiles are tinted by how high the grade is, so the eye finds the ones that matter. */
function tone(points: number): "low" | "mid" | "high" {
  if (points >= 9) return "high";
  if (points >= 7) return "mid";
  return "low";
}

const TONES = {
  low: { box: "border-warning/40 bg-warning/10", grade: "text-warning" },
  mid: { box: "border-primary/30 bg-primary/8", grade: "text-primary" },
  high: { box: "border-success/40 bg-success/10", grade: "text-success" },
} as const;

/**
 * "What do I need in the end-sem?": the exam score each passing grade takes for one subject. The
 * internal mark starts from the CAE average and the student can adjust it to what they expect.
 */
export function EndSemCard(props: EndSemCardProps) {
  const { code, chips, start, internalMax, externalMax, paperMax, maxTotal, scale } = props;
  const base = start ?? 0;
  const [open, setOpen] = React.useState(false);
  // The adjusted mark is only drawn once the card is opened, so reading it while the page hydrates
  // cannot show a different value from the server's render.
  const [internal, setInternal] = React.useState(() => {
    if (typeof window === "undefined") return base;
    const saved = readSaved(code);
    return saved === null ? base : clamp(Math.round(saved), 0, internalMax);
  });
  const [draft, setDraft] = React.useState<string | null>(null);
  const bodyId = React.useId();

  const set = (next: number) => {
    const value = clamp(Math.round(next), 0, internalMax);
    setInternal(value);
    setDraft(null);
    writeSaved(code, value === base ? null : value);
  };

  const tiles = endSemTiles({ internal, externalMax, paperMax, maxTotal, scale });
  // No exam in this course: no card.
  if (tiles.length === 0) return null;

  const commitDraft = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(n)) set(n);
    else setDraft(null);
  };

  const unscored = start === null;
  // 30% of the exam, on the paper's own scale (15 of 50 is 30 of 100).
  const passMinPaper = Math.ceil((Math.ceil(externalMax * 0.3 - 1e-9) * paperMax) / externalMax - 1e-9);

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="focusable flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-2 text-left"
      >
        <Target className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 text-body font-medium text-foreground">What do I need in the end-sem?</span>
        {chips.length > 0 ? (
          <span className="hidden shrink-0 items-center gap-1.5 sm:flex" aria-hidden>
            {chips.map((c) => (
              <span key={c.label} className="rounded-md bg-muted px-2 py-1 text-center text-small leading-tight tabular-nums">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</span>
                <span className="font-semibold text-success">{c.value}</span>
              </span>
            ))}
          </span>
        ) : null}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open ? (
        <div id={bodyId} className="space-y-4 border-t border-dashed border-border px-4 pb-4 pt-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Internal (CAE) mark</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="inline-flex items-center rounded-lg border border-border bg-surface">
                <button
                  type="button"
                  aria-label="Lower the internal mark by one"
                  onClick={() => set(internal - 1)}
                  disabled={internal <= 0}
                  className="focusable inline-flex h-11 w-11 items-center justify-center rounded-l-lg text-muted-foreground enabled:hover:bg-muted disabled:opacity-40"
                >
                  <Minus className="h-4 w-4" aria-hidden />
                </button>
                <label className="flex items-baseline justify-center gap-1 px-2 tabular-nums">
                  <span className="sr-only">Internal mark out of {internalMax}</span>
                  <input
                    inputMode="numeric"
                    value={draft ?? String(internal)}
                    onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, "").slice(0, 5))}
                    onBlur={commitDraft}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitDraft();
                    }}
                    className="focusable w-10 bg-transparent text-center text-heading font-semibold text-foreground"
                  />
                  <span className="text-body font-semibold text-foreground">/{internalMax}</span>
                </label>
                <button
                  type="button"
                  aria-label="Raise the internal mark by one"
                  onClick={() => set(internal + 1)}
                  disabled={internal >= internalMax}
                  className="focusable inline-flex h-11 w-11 items-center justify-center rounded-r-lg text-muted-foreground enabled:hover:bg-muted disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <p className="min-w-0 max-w-prose flex-1 text-small text-muted-foreground">
                {unscored
                  ? "No CAE is published yet. Enter the internal mark you expect."
                  : "Starts from your CAE average. Adjust it to your expected internal."}
              </p>
            </div>
          </div>

          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="End-sem score needed for each grade">
            {tiles.map((t) => {
              const style = TONES[tone(t.points)];
              return (
                <li
                  key={t.grade}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-center",
                    t.reachable ? style.box : "border-border bg-muted/40 opacity-70",
                  )}
                >
                  <p className={cn("text-body font-semibold", t.reachable ? style.grade : "text-muted-foreground")}>{t.grade}</p>
                  {t.reachable ? (
                    <>
                      <p className="mt-1 font-display text-title font-semibold leading-none tabular-nums text-foreground">
                        {t.paperNeeded}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">/{paperMax} ESE</p>
                    </>
                  ) : (
                    <>
                      <p className="mt-1 font-display text-title font-semibold leading-none text-muted-foreground" aria-label="Out of reach">
                        —
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">out of reach</p>
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="text-small text-muted-foreground">
            End-sem score needed out of {paperMax} for each grade. Passing also needs at least {passMinPaper} in the ESE.
          </p>
        </div>
      ) : null}
    </div>
  );
}
