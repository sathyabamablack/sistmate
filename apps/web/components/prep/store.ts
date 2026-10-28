import * as React from "react";
import { PREP_KEY, parsePrepState, resolvePlanner, type PlannerInputs, type PrepState } from "@/lib/prep";

/** The CGPA planner's saved inputs (components/calculator/Planner.tsx). Read here, never written. */
const PLANNER_KEY = "usp-planner-v1";

function readStorage(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

/** Calls `listener` when another tab changes `key`. */
function onOtherTab(key: string, listener: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === key || e.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

const getServerSnapshot = () => "";

// Checklists live in this browser only. A module-level copy keeps ticks working
// when storage is blocked (private windows, cleared site data).
let memory: string | null = null;
const listeners = new Set<() => void>();

function subscribePrep(listener: () => void) {
  listeners.add(listener);
  const off = onOtherTab(PREP_KEY, () => {
    memory = null;
    listener();
  });
  return () => {
    listeners.delete(listener);
    off();
  };
}
const getPrepSnapshot = () => memory ?? readStorage(PREP_KEY);

export function savePrep(next: PrepState) {
  const json = JSON.stringify(next);
  memory = json;
  try {
    localStorage.setItem(PREP_KEY, json);
  } catch {
    /* kept in memory for this visit */
  }
  listeners.forEach((l) => l());
}

/** Every subject's revision checklist, as saved in this browser. */
export function usePrepState(): PrepState {
  const snapshot = React.useSyncExternalStore(subscribePrep, getPrepSnapshot, getServerSnapshot);
  return React.useMemo(() => parsePrepState(snapshot), [snapshot]);
}

const subscribePlanner = (listener: () => void) => onOtherTab(PLANNER_KEY, listener);
const getPlannerSnapshot = () => readStorage(PLANNER_KEY);

/** The CGPA planner's plan for the student's saved inputs, worked out the way the planner page does. */
export function usePlannerPlan(inputs: PlannerInputs) {
  const snapshot = React.useSyncExternalStore(subscribePlanner, getPlannerSnapshot, getServerSnapshot);
  return React.useMemo(
    () => resolvePlanner(snapshot, inputs.subjects, inputs.presetScale, inputs.estimatedPrevious),
    [snapshot, inputs],
  );
}
