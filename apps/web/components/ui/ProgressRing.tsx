import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "danger";

const toneClass: Record<Tone, string> = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

/**
 * Accessible SVG progress ring. Pass a precomputed percentage (0..100) and a
 * tone. `markAt` draws the threshold tick (the 80% line) across the stroke.
 * The centre can hold custom children.
 */
export function ProgressRing({
  value,
  size = 112,
  stroke = 10,
  tone = "primary",
  markAt,
  label,
  sublabel,
  children,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: Tone;
  markAt?: number;
  label?: string;
  sublabel?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const radius = (size - stroke) / 2 - 1;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const c = size / 2;

  return (
    <div
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${Math.round(pct)} percent`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={c} cy={c} r={radius} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={c}
          cy={c}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap={pct >= 99.5 ? "butt" : "round"}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("transition-[stroke-dashoffset] duration-700 ease-out-quint", toneClass[tone])}
          stroke="currentColor"
        />
        {markAt != null ? (
          // The threshold is a cut across the band in the page colour, so it reads as a notch in the
          // ring rather than a dash next to the figure (which looked like a minus sign).
          <line
            x1={c + radius - stroke / 2 - 0.5}
            x2={c + radius + stroke / 2 + 0.5}
            y1={c}
            y2={c}
            strokeWidth={3}
            strokeLinecap="butt"
            className="stroke-background"
            transform={`rotate(${(Math.max(0, Math.min(100, markAt)) / 100) * 360} ${c} ${c})`}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        {children ?? (
          <div className="leading-tight">
            <div className="font-display text-heading font-semibold tabular-nums text-foreground">
              {Math.round(pct)}
              <span className="text-small text-muted-foreground">%</span>
            </div>
            {sublabel ? <div className="text-micro text-muted-foreground">{sublabel}</div> : null}
          </div>
        )}
      </div>
    </div>
  );
}
