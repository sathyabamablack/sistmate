import { COUNTDOWN_UNITS, OPENS_AT, pad2, splitCountdown } from "@/lib/black";
import { mono } from "./fonts";

/** Four labelled cells, seconds in red. Used in the login pop-up. */
export function ClockCells({ now }: { now: number | null }) {
  const t = now === null ? null : splitCountdown(OPENS_AT - now);
  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={
        t
          ? `${t.days} days, ${t.hours} hours, ${t.minutes} minutes and ${t.seconds} seconds until it opens`
          : "Countdown"
      }
      className={`${mono.className} grid grid-cols-4`}
    >
      {COUNTDOWN_UNITS.map((unit) => (
        <div key={unit} className="flex flex-col items-center border-l border-white/[0.08] py-2 first:border-l-0">
          <span
            className={`text-[1.75rem] font-bold leading-none tabular-nums sm:text-[2.25rem] ${
              unit === "seconds" ? "text-[#e01b24] [text-shadow:0_0_20px_rgba(224,27,36,0.45)]" : "text-[#f2f2f2]"
            }`}
          >
            {t ? pad2(t[unit]) : <span className="text-[#2a2a2a]">--</span>}
          </span>
          <span className="mt-2 text-[9px] font-medium uppercase tracking-[0.3em] text-[#6b6b6b]">{unit}</span>
        </div>
      ))}
    </div>
  );
}

/** One line: 04d 14h 05m 27s, seconds in red. Used in the dashboard strip. */
export function ClockInline({ now }: { now: number | null }) {
  if (now === null) return null;
  const t = splitCountdown(OPENS_AT - now);
  return (
    <span
      aria-hidden
      className={`${mono.className} whitespace-nowrap text-[13px] font-bold tabular-nums text-[#f2f2f2]`}
    >
      {pad2(t.days)}d {pad2(t.hours)}h {pad2(t.minutes)}m{" "}
      <span className="text-[#e01b24]">{pad2(t.seconds)}s</span>
    </span>
  );
}
