"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { DEFAULT_THRESHOLD } from "@/lib/attendance";
import { readPrefs, updatePrefs, type TourStatus } from "@/lib/prefs";
import {
  FIRST_STEP,
  TOUR_AUTO_KEY,
  TOUR_PROGRESS_KEY,
  TOUR_STEPS,
  parseProgress,
  serializeProgress,
  shouldAutoStart,
  tourIndex,
} from "@/lib/tour";

/**
 * The walkthrough's state, shared by the overlay, the dashboard card, Settings and
 * the command palette. A tiny external store (read with useSyncExternalStore), so a
 * start from anywhere reaches the overlay without prop drilling, and progress is
 * mirrored to sessionStorage on every change.
 */

export interface TourRun {
  index: number;
  /** Steps passed over because their target was missing, so Back skips them too. */
  skipped: readonly number[];
}

export interface TourState {
  run: TourRun | null;
  status: TourStatus;
  /** The student's attendance rule, for "the 80% line". */
  threshold: number;
  /** True once this browser has been checked for saved progress, so the card never flashes. */
  ready: boolean;
}

const SERVER_STATE: TourState = { run: null, status: "done", threshold: DEFAULT_THRESHOLD, ready: false };

let state: TourState = SERVER_STATE;
const listeners = new Set<() => void>();

function set(next: Partial<TourState>) {
  state = { ...state, ...next };
  if ("run" in next) saveProgress(state.run);
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/* Storage can throw (private windows, blocked site data); the tour then simply does not resume. */
function readStorage(kind: "session" | "local", key: string): string | null {
  try {
    return (kind === "session" ? window.sessionStorage : window.localStorage).getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(kind: "session" | "local", key: string, value: string | null) {
  try {
    const store = kind === "session" ? window.sessionStorage : window.localStorage;
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function saveProgress(run: TourRun | null) {
  if (!run) {
    writeStorage("session", TOUR_PROGRESS_KEY, null);
    return;
  }
  const step = TOUR_STEPS[run.index];
  if (!step) return;
  writeStorage(
    "session",
    TOUR_PROGRESS_KEY,
    serializeProgress({
      step: step.id,
      skipped: run.skipped.map((i) => TOUR_STEPS[i]?.id).filter((id) => id !== undefined),
    }),
  );
}

/**
 * Called on every page change inside the signed-in app: resumes a tour saved in this
 * tab, or starts it by itself for a new student who has just reached the dashboard.
 */
export function bootTour(pathname: string) {
  const prefs = readPrefs();
  const base = { status: prefs.onboarding.tour, threshold: prefs.attendanceThreshold, ready: true };
  if (state.run) {
    set(base);
    return;
  }
  const saved = state.ready ? null : parseProgress(readStorage("session", TOUR_PROGRESS_KEY));
  if (saved) {
    set({
      ...base,
      run: { index: tourIndex(saved.step), skipped: saved.skipped.map(tourIndex) },
    });
    return;
  }
  const auto = shouldAutoStart({
    status: base.status,
    pathname,
    autoStartedBefore: readStorage("local", TOUR_AUTO_KEY) === "1",
    running: false,
  });
  if (auto) writeStorage("local", TOUR_AUTO_KEY, "1");
  set(auto ? { ...base, run: { index: FIRST_STEP, skipped: [] } } : base);
}

/** Starts (or restarts) at the welcome. The welcome waits until the dashboard is showing. */
export function startTour() {
  writeStorage("local", TOUR_AUTO_KEY, "1");
  const prefs = readPrefs();
  set({ run: { index: FIRST_STEP, skipped: [] }, threshold: prefs.attendanceThreshold, ready: true });
}

/** Moves to a step; past the last one the tour is done. `skip` records the step being left as skipped. */
export function goToStep(index: number, skip = false) {
  const run = state.run;
  if (!run) return;
  if (index >= TOUR_STEPS.length) {
    endTour("done");
    return;
  }
  const skipped = skip ? [...run.skipped, ...range(run.index, index)] : run.skipped;
  set({ run: { index: Math.max(0, index), skipped } });
}

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);

/** Finishes or skips: saved in the preferences so the tour never starts by itself again. */
export function endTour(outcome: Exclude<TourStatus, "new">) {
  writeStorage("local", TOUR_AUTO_KEY, "1");
  updatePrefs((p) => ({ onboarding: { ...p.onboarding, tour: outcome } }));
  set({ run: null, status: outcome });
}

/** The tour's state; on the server and during hydration, "not running". */
export function useTourState(): TourState {
  return React.useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

/** Starts the tour from the beginning and shows the dashboard, where it begins. */
export function useStartTour(): () => void {
  const router = useRouter();
  const pathname = usePathname();
  return React.useCallback(() => {
    startTour();
    if (pathname !== "/") router.push("/");
  }, [router, pathname]);
}
