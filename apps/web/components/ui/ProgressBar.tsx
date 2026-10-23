import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "danger";

const toneClass: Record<Tone, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/**
 * Horizontal meter. `markAt` draws the signature threshold tick (e.g. the 80%
 * attendance line): it rises above and below the track so it reads at a glance.
 */
export function ProgressBar({
  value,
  tone = "primary",
  className,
  markAt,
  "aria-label": ariaLabel,
}: {
  value: number;
  tone?: Tone;
  className?: string;
  markAt?: number;
  "aria-label"?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("relative h-2 w-full", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <div className="absolute inset-0 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width] duration-700 ease-out-quint", toneClass[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {markAt != null ? (
        <div
          className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
          style={{ left: `${Math.max(0, Math.min(100, markAt))}%` }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
