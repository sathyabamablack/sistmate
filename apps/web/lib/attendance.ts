import { attendanceStats } from "@usp/core";

export type AttendanceTone = "success" | "warning" | "danger";

export const DEFAULT_THRESHOLD = 80;

/** How far above the threshold a subject stays amber before it reads as safe. */
const NEAR_BAND = 5;

/**
 * Color coding for attendance, relative to the threshold T (default 80):
 *   >= T + 5 -> green (safe)
 *   T..T+5   -> amber (near the line)
 *   < T      -> red   (below requirement)
 */
export function attendanceTone(percentage: number, threshold = DEFAULT_THRESHOLD): AttendanceTone {
  if (percentage < threshold) return "danger";
  if (percentage < threshold + NEAR_BAND) return "warning";
  return "success";
}

export const attendanceToneLabel: Record<AttendanceTone, string> = {
  success: "Safe",
  warning: "Near limit",
  danger: `Below ${DEFAULT_THRESHOLD}%`,
};

/** Tone labels for a given threshold ("Below 80%"). */
export function toneLabels(threshold = DEFAULT_THRESHOLD): Record<AttendanceTone, string> {
  return { ...attendanceToneLabel, danger: `Below ${threshold}%` };
}

/**
 * Percentage for display, to one decimal, dropping a trailing ".0" so 100 reads
 * "100%" and 87.5 reads "87.5%".
 *
 * Rounds normally, with one exception: a value is never rounded UP past a whole
 * number, because that is where thresholds sit and "80%" must not be shown to
 * someone on 79.96. So 79.96 reads "79.9%", while 97.78 reads "97.8%" — plain
 * flooring used to report that as "97.7%".
 */
export function formatPct(p: number): string {
  const rounded = Math.round(p * 10) / 10;
  const crossesWholeNumber = Math.floor(rounded) > Math.floor(p + 1e-9);
  const shown = crossesWholeNumber ? Math.floor(p * 10 + 1e-9) / 10 : rounded;
  return `${Number.isInteger(shown) ? shown.toFixed(0) : shown.toFixed(1)}%`;
}

export interface AttendanceAdvice {
  /** `none` when there is nothing to judge yet (no hours recorded). */
  tone: AttendanceTone | "none";
  /** Short status for tables: "Can skip 8", "Exactly 80%", "Attend next 4". */
  short: string;
  /** A full plain-language sentence. */
  long: string;
}

const hours = (n: number) => (n === 1 ? "1 hour" : `${n} hours`);

/** Plain-words guidance for one subject (or the overall figure) against the threshold (default 80%). */
export function attendanceAdvice(
  attended: number,
  total: number,
  threshold = DEFAULT_THRESHOLD,
): AttendanceAdvice {
  if (total <= 0) {
    return {
      tone: "none",
      short: "Not started",
      long: "No hours have been recorded yet, so there is nothing to measure.",
    };
  }
  const s = attendanceStats(attended, total, threshold);
  if (!s.safe) {
    return {
      tone: "danger",
      short: `Attend next ${s.needed}`,
      long: `Below ${threshold}%. Attend the next ${hours(s.needed)} without a miss to get back to ${threshold}%.`,
    };
  }
  if (s.canSkip === 0) {
    const exact = 100 * attended === threshold * total;
    return {
      tone: "warning",
      short: exact ? `Exactly ${threshold}%` : "Don't skip",
      long: exact
        ? `Exactly at ${threshold}%. Missing the next hour takes you below the limit.`
        : `Just above ${threshold}%. Missing the next hour takes you below the limit.`,
    };
  }
  return {
    tone: attendanceTone(s.percentage, threshold),
    short: `Can skip ${s.canSkip}`,
    long: `You can miss ${hours(s.canSkip)} and still stay at or above ${threshold}%.`,
  };
}
