import { attendanceStats, DEFAULT_ATTENDANCE_THRESHOLD } from "./calc";

/**
 * Week planning for attendance. Pure and exact (integer arithmetic), no I/O.
 *
 * Model: every class held in the window adds one hour to the total. A class you
 * skip adds nothing to hours attended; a class you attend adds one. All figures
 * are whole hours, which is how the ERP counts.
 */

export interface AttendanceCounts {
  attended: number;
  total: number;
}

export interface Projection {
  attended: number;
  total: number;
  percentage: number;
  /**
   * Hours of room against the threshold. Zero or more: hours you could still
   * miss and stay at or above it. Negative: hours you would have to attend in a
   * row to get back to it (so -3 means "3 hours short").
   */
  margin: number;
  safe: boolean;
}

/**
 * What a subject looks like after `skipHours` hours that are held but missed and
 * `extraAttendHours` hours that are held and attended.
 */
export function projectAttendance(
  counts: AttendanceCounts,
  skipHours: number,
  extraAttendHours = 0,
  threshold = DEFAULT_ATTENDANCE_THRESHOLD,
): Projection {
  const skip = Math.max(0, Math.floor(skipHours));
  const extra = Math.max(0, Math.floor(extraAttendHours));
  const attended = counts.attended + extra;
  const total = counts.total + extra + skip;
  const s = attendanceStats(attended, total, threshold);
  return {
    attended,
    total,
    percentage: s.percentage,
    margin: s.safe ? s.canSkip : -s.needed,
    safe: s.safe,
  };
}

/**
 * The most hours of `upcomingHours` you can skip while attending the rest and
 * still finish at or above the threshold. Zero when even attending everything
 * leaves you below it.
 */
export function maxSafeSkips(counts: AttendanceCounts, upcomingHours: number, threshold = DEFAULT_ATTENDANCE_THRESHOLD): number {
  const held = Math.max(0, Math.floor(upcomingHours));
  // 100·(a + held − s) >= T·(total + held)  =>  s <= (100·a + (100 − T)·held − T·total) / 100
  const room = 100 * counts.attended + (100 - threshold) * held - threshold * counts.total;
  if (room < 0) return 0;
  return Math.min(held, Math.floor(room / 100));
}

export interface PlanClass {
  /** unique per class in the plan */
  id: string;
  /** subject code */
  code: string;
}

export interface PlanSubject extends AttendanceCounts {
  code: string;
}

/**
 * Classes you could skip without any subject finishing below the threshold,
 * best first. Subjects do not affect each other, so the set is simply each
 * subject's `maxSafeSkips`; the order is greedy: always take the next class
 * from the subject with the most buffer left (ties go to the lower code), so
 * the first suggestions come from where you can most afford to miss.
 * Classes in a subject are taken earliest first, in the order given.
 * Classes of subjects with no attendance record are ignored.
 */
export function suggestSkips(
  subjects: PlanSubject[],
  classes: PlanClass[],
  threshold = DEFAULT_ATTENDANCE_THRESHOLD,
): PlanClass[] {
  const queues = new Map<string, PlanClass[]>();
  for (const c of classes) {
    const q = queues.get(c.code);
    if (q) q.push(c);
    else queues.set(c.code, [c]);
  }

  const buffer = new Map<string, number>();
  for (const s of subjects) {
    const q = queues.get(s.code);
    if (!q) continue;
    const n = maxSafeSkips(s, q.length, threshold);
    if (n > 0) buffer.set(s.code, n);
  }

  const picked: PlanClass[] = [];
  for (;;) {
    let best: string | null = null;
    for (const [code, left] of buffer) {
      if (left <= 0) continue;
      const b = best === null ? 0 : buffer.get(best)!;
      if (best === null || left > b || (left === b && code < best)) best = code;
    }
    if (best === null) break;
    picked.push(queues.get(best)!.shift()!);
    buffer.set(best, buffer.get(best)! - 1);
  }
  return picked;
}
