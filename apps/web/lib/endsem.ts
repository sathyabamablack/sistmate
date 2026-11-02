import { externalMinimum, requiredExternal, type GradeBand } from "@usp/core";
import { toPaper } from "./planner";

/**
 * "What do I need in the end-sem?": for one subject, the exam score each passing grade takes,
 * given an internal (CAE) mark. Pure arithmetic over numbers the server already resolved, so the
 * course catalog never reaches the browser.
 */

export interface EndSemInput {
  /** Internal mark out of the subject's internal maximum. */
  internal: number;
  externalMax: number;
  /** What the exam paper is written out of (100 for a 50-mark theory exam). */
  paperMax: number;
  maxTotal: number;
  scale: GradeBand[];
}

export interface EndSemTile {
  grade: string;
  points: number;
  /** Exam marks needed, out of `externalMax`. */
  needed: number;
  /** The same on the paper's own scale (what the student sees as "out of 100"). */
  paperNeeded: number;
  /** False when even a full-marks exam falls short of this grade. */
  reachable: boolean;
  /** True when the internal mark alone reaches this grade, so only the pass minimum is asked of the exam. */
  atMinimum: boolean;
}

/** Passing grades, lowest first (C to A++ on the official scale), each with the exam score it takes. */
export function endSemTiles(input: EndSemInput): EndSemTile[] {
  const { internal, externalMax, paperMax, maxTotal, scale } = input;
  // No exam, no question to answer.
  if (!(externalMax > 0) || !(maxTotal > 0)) return [];
  const floor = Math.ceil(externalMinimum({ externalMax }) - 1e-9);
  return [...scale]
    .filter((b) => b.points > 0)
    .sort((a, b) => a.min - b.min)
    .map((band) => {
      const req = requiredExternal(internal, (band.min * maxTotal) / 100, externalMax);
      // Every passing grade also needs 30% of the exam, however strong the internal mark is.
      const needed = Math.max(req.needed, floor);
      return {
        grade: band.grade,
        points: band.points,
        needed,
        paperNeeded: toPaper(needed, externalMax, paperMax),
        reachable: needed <= externalMax,
        atMinimum: req.needed <= floor,
      };
    });
}

/** Just the parts of a marks row this needs. */
export interface CaeComponent {
  name: string;
  scored: number | null;
  max: number;
}

/**
 * The internal mark to start from: the average of the CAE tests scored so far, as a share of
 * their maximum, scaled to the internal maximum (two CAEs of 42/50 give 42 of 50). Null when no
 * CAE has been scored yet.
 */
export function caeStart(components: CaeComponent[], internalMax: number): number | null {
  const shares: number[] = [];
  for (const n of [1, 2]) {
    const c = components.find((x) => new RegExp(`(?:cae|cia|internal)\\D*${n}\\b`, "i").test(x.name));
    if (!c || c.scored === null) continue;
    const share = c.max > 0 ? c.scored / c.max : c.scored / internalMax;
    shares.push(Math.min(1, Math.max(0, share)));
  }
  if (shares.length === 0 || !(internalMax > 0)) return null;
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  return Math.round(mean * internalMax);
}
