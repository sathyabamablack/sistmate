import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import styles from "./wrapped.module.css";

/** The amber of the logo's tick (components/ui/Logo.tsx). */
export const TICK_AMBER = "#e09f1f";

/**
 * The portal mark, large: a ring filled to `value` (0..1) with the amber tick across it at
 * `tick` (the fill's end by default; the 80% line on the attendance slide). Decorative.
 */
export function Ring({
  value,
  tick = value,
  className,
  trackOpacity = 0.16,
  strokeWidth = 20,
}: {
  value: number;
  tick?: number;
  className?: string;
  trackOpacity?: number;
  strokeWidth?: number;
}) {
  const r = 80;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const arc = c * v;
  const angle = -Math.PI / 2 + 2 * Math.PI * Math.max(0, Math.min(1, tick));
  const inner = r - strokeWidth * 0.95;
  const outer = r + strokeWidth * 0.95;
  return (
    <svg viewBox="0 0 200 200" className={cn("pointer-events-none", className)} aria-hidden focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
        <circle cx="100" cy="100" r={r} strokeOpacity={trackOpacity} />
        {arc > 0 ? (
          <circle
            cx="100"
            cy="100"
            r={r}
            strokeLinecap="round"
            strokeDasharray={`${arc.toFixed(2)} ${c.toFixed(2)}`}
            transform="rotate(-90 100 100)"
            className={styles.draw}
            style={{ "--len": arc.toFixed(2) } as CSSProperties}
          />
        ) : null}
      </g>
      <line
        x1={100 + inner * Math.cos(angle)}
        y1={100 + inner * Math.sin(angle)}
        x2={100 + outer * Math.cos(angle)}
        y2={100 + outer * Math.sin(angle)}
        stroke={TICK_AMBER}
        strokeWidth={strokeWidth * 0.55}
        strokeLinecap="round"
      />
    </svg>
  );
}
