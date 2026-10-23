/**
 * The first-time walkthrough: a spotlight tour that points at one thing at a time
 * and, for some steps, waits for the student to do it (open Attendance, mark a
 * class as skipped, pick this semester's courses). Pure data and helpers, so the
 * steps and the placement maths are unit tested; the engine that draws the
 * overlay lives in components/tour/. Whether it has been done or skipped is saved
 * in the `usp-prefs` cookie (`Prefs.onboarding.tour`, see lib/prefs.ts); progress
 * within a visit is kept in sessionStorage so a reload picks up where it was.
 */

import type { TourStatus } from "./prefs";

export type { TourStatus };

/** sessionStorage: the step the tour is on, so a reload or a page change resumes it. */
export const TOUR_PROGRESS_KEY = "usp-tour";
/** localStorage: the tour has started by itself once in this browser; after that the dashboard card offers it. */
export const TOUR_AUTO_KEY = "usp-tour-auto";

/** Elements the tour points at carry `data-tour="<target>"`. When two match, the visible one wins. */
export type TourTarget =
  | "next-class"
  | "attendance-overall"
  | "nav-attendance"
  | "todays-attendance"
  | "plan-first-class"
  | "plan-result"
  | "nav-courses"
  | "choose-courses"
  | "course-chooser"
  | "this-semester"
  | "save-courses"
  | "account-menu";

export type TourRoute = "/" | "/attendance" | "/courses";

/** "phone" below the lg breakpoint (bottom tab bar, "tap"), "desktop" from lg up (rail, "click"). */
export type TourDevice = "phone" | "desktop";

export type Side = "bottom" | "top" | "right" | "left";

/** Plain text, or different words for phones and desktops. Placeholders: {verb} {name} {threshold} {shortcut}. */
export type TourCopy = string | { desktop: string; phone: string };

/** What a "wait-for" step waits for. */
export type TourCondition =
  /** The target's aria-pressed is "true". */
  | "pressed"
  /** The step's `dialog` is open. */
  | "dialog-open"
  /** The step's `dialog` has closed (saved or cancelled). */
  | "dialog-closed";

interface BaseStep {
  id: string;
  title: TourCopy;
  body: TourCopy;
  /** The page the step lives on. Without one the step shows wherever the student is. */
  route?: TourRoute;
  /** Without a target the popover is centred on a dimmed page. */
  target?: TourTarget;
  /**
   * The target depends on the student's data (no classes, no LMS courses). When it is
   * missing once the page has loaded, the step is skipped instead of asking the student.
   */
  optional?: boolean;
  /** Which side of the target the popover tries first on a desktop (it flips when there is no room). */
  side?: Side;
  /** Steps that only make sense together: when one is skipped or its target goes away, the rest go too. */
  group?: "plan" | "courses";
}

export interface InfoStep extends BaseStep {
  kind: "info";
  /** An extra button that clicks another element for the student, then moves on ("Undo the skip"). */
  action?: { label: string; clicks: TourTarget };
}

export interface ClickStep extends BaseStep {
  kind: "click";
  target: TourTarget;
}

export interface WaitForStep extends BaseStep {
  kind: "wait-for";
  target: TourTarget;
  until: TourCondition;
  /** The dialog `until` watches. */
  dialog?: TourTarget;
}

export type TourStep = InfoStep | ClickStep | WaitForStep;

export const TOUR_STEPS = [
  {
    id: "welcome",
    kind: "info",
    route: "/",
    title: "Welcome to your portal{name}",
    body: "Take a 1-minute tour? It shows you around one step at a time.",
  },
  {
    id: "next-class",
    kind: "info",
    route: "/",
    target: "next-class",
    optional: true,
    title: "Your next class",
    body: "Your next class, when it starts, and whether you can skip it.",
  },
  {
    id: "attendance-overall",
    kind: "info",
    route: "/",
    target: "attendance-overall",
    optional: true,
    title: "Attendance at a glance",
    body: "Overall attendance against the {threshold}% line. The tick on each bar marks {threshold}%.",
  },
  {
    id: "open-attendance",
    kind: "click",
    route: "/",
    target: "nav-attendance",
    side: "right",
    title: "Open Attendance",
    body: {
      desktop: "Click Attendance in the menu on the left.",
      phone: "Tap Attendance in the bar at the bottom.",
    },
  },
  {
    id: "todays-attendance",
    kind: "info",
    route: "/attendance",
    target: "todays-attendance",
    title: "Today's attendance",
    body: "Daily and hour-wise attendance are separate. Hour-wise usually appears after 7 pm.",
  },
  {
    id: "plan-skip",
    kind: "wait-for",
    route: "/attendance",
    target: "plan-first-class",
    until: "pressed",
    optional: true,
    group: "plan",
    title: "Plan your week",
    body: "{verb} a class to see what skipping it does.",
  },
  {
    id: "plan-result",
    kind: "info",
    route: "/attendance",
    target: "plan-result",
    optional: true,
    group: "plan",
    title: "Where each subject ends up",
    body: "See how your attendance would change. {verb} the class again to undo.",
    action: { label: "Undo the skip", clicks: "plan-first-class" },
  },
  {
    id: "open-courses",
    kind: "click",
    target: "nav-courses",
    side: "right",
    title: "Open Courses",
    body: {
      desktop: "Your LMS courses live here. Click Courses in the menu on the left.",
      phone: "Your LMS courses live here. Tap Courses in the bar at the bottom.",
    },
  },
  {
    id: "choose-courses",
    kind: "wait-for",
    route: "/courses",
    target: "choose-courses",
    until: "dialog-open",
    dialog: "course-chooser",
    optional: true,
    group: "courses",
    title: "Hide old semesters' courses",
    body: "The LMS lists every semester. {verb} Choose courses.",
  },
  {
    id: "this-semester",
    kind: "click",
    route: "/courses",
    target: "this-semester",
    optional: true,
    group: "courses",
    title: "This semester only",
    body: "{verb} This semester only to keep just the courses you take now.",
  },
  {
    id: "save-courses",
    kind: "wait-for",
    route: "/courses",
    target: "save-courses",
    until: "dialog-closed",
    dialog: "course-chooser",
    optional: true,
    group: "courses",
    title: "Save your choice",
    body: "{verb} Save. You can change it any time from Choose courses.",
  },
  {
    id: "settings",
    kind: "info",
    target: "account-menu",
    title: "Make it yours",
    body: "Change your start page, colours and the attendance rule in Settings. It's in this menu.",
  },
  {
    id: "finish",
    kind: "info",
    title: "You're all set",
    body: {
      desktop: "You can replay this tour any time from Settings or the search ({shortcut}).",
      phone: "You can replay this tour any time from Settings or the search.",
    },
  },
] as const satisfies readonly TourStep[];

export type TourStepId = (typeof TOUR_STEPS)[number]["id"];

const STEPS: readonly TourStep[] = TOUR_STEPS;

export function tourStep(index: number): TourStep | undefined {
  return STEPS[index];
}

/** The step's position, or -1 for an unknown id. */
export function tourIndex(id: string): number {
  return STEPS.findIndex((s) => s.id === id);
}

export const FIRST_STEP = 0;
export const LAST_STEP = STEPS.length - 1;

/** "3 of 12": the welcome is not counted; every step after it is. Null for the welcome. */
export function stepCounter(index: number): string | null {
  if (index <= 0 || index > LAST_STEP) return null;
  return `${index} of ${LAST_STEP}`;
}

/**
 * Where to go after `index`. With `wholeGroup`, also past the rest of its group
 * (a skipped "Plan your week" step takes its follow-up with it). Returns
 * `STEPS.length` when the tour is over.
 */
export function nextIndex(index: number, wholeGroup = false): number {
  const group = STEPS[index]?.group;
  let next = index + 1;
  if (wholeGroup && group) while (STEPS[next]?.group === group) next++;
  return Math.min(next, STEPS.length);
}

/**
 * Where to go when an optional step's element is missing. The first step of a group
 * takes the whole group with it (no class to mark, so nothing to show after it);
 * a later one only skips itself ("This semester only" is greyed out, but Save still
 * makes sense).
 */
export function afterMissing(index: number): number {
  const group = STEPS[index]?.group;
  const first = group !== undefined && STEPS[index - 1]?.group !== group;
  return nextIndex(index, first);
}

/**
 * Where Back goes: the nearest earlier step that was not skipped, only when it is an
 * info step on the page the student is on now. Going back to a click step would ask
 * them to repeat something already done (or already navigated away from).
 */
export function backIndex(index: number, skipped: ReadonlySet<number>, pathname: string): number | null {
  for (let i = index - 1; i >= 0; i--) {
    if (skipped.has(i)) continue;
    const step = STEPS[i]!;
    if (step.kind !== "info") return null;
    if (step.route && step.route !== pathname) return null;
    return i;
  }
  return null;
}

export interface CopyContext {
  device: TourDevice;
  /** The student's first name, or "" when unknown. */
  name: string;
  threshold: number;
  /** "Ctrl K" or "⌘K". */
  shortcut: string;
}

/** Picks the wording for the device and fills the placeholders. */
export function tourCopy(copy: TourCopy, ctx: CopyContext): string {
  const text = typeof copy === "string" ? copy : copy[ctx.device];
  return text
    .replaceAll("{verb}", ctx.device === "phone" ? "Tap" : "Click")
    .replaceAll("{name}", ctx.name ? `, ${ctx.name}` : "")
    .replaceAll("{threshold}", String(ctx.threshold))
    .replaceAll("{shortcut}", ctx.shortcut);
}

/** The nav label for a route, for "Go to Attendance". */
export function routeLabel(route: TourRoute): string {
  return route === "/" ? "Home" : route === "/attendance" ? "Attendance" : "Courses";
}

export interface TourProgress {
  step: TourStepId;
  /** Steps passed over because their target was missing, so Back skips them too. */
  skipped: TourStepId[];
}

export function serializeProgress(p: TourProgress): string {
  return JSON.stringify({ v: 1, step: p.step, skipped: p.skipped });
}

/** Reads saved progress defensively; anything unexpected means "no tour in progress". */
export function parseProgress(raw: string | null | undefined): TourProgress | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (typeof o !== "object" || o === null || o.v !== 1 || typeof o.step !== "string") return null;
    if (tourIndex(o.step) < 0) return null;
    const skipped = Array.isArray(o.skipped)
      ? [...new Set(o.skipped.filter((s): s is TourStepId => typeof s === "string" && tourIndex(s) >= 0))]
      : [];
    return { step: o.step as TourStepId, skipped };
  } catch {
    return null;
  }
}

/**
 * The tour starts by itself only for a student who has never finished or skipped it,
 * only on the dashboard (never on /welcome, /login, /connect, /setup, or another start
 * page), once per browser, and never on top of a tour already running.
 */
export function shouldAutoStart(o: {
  status: TourStatus;
  pathname: string;
  autoStartedBefore: boolean;
  running: boolean;
}): boolean {
  return o.status === "new" && o.pathname === "/" && !o.autoStartedBefore && !o.running;
}

/** How to add the portal to a home screen, folded into the tour's last step. */
export const INSTALL_STEPS = [
  { device: "Android", text: "open the browser menu, then tap Install app or Add to Home screen." },
  { device: "iPhone or iPad", text: "in Safari, tap Share, then Add to Home Screen." },
  { device: "Computer", text: "click the install icon at the right end of the address bar." },
] as const;

/* ---------- Placement ---------- */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Space between the highlight and the element it surrounds. */
export const HOLE_PADDING = 6;
/** Gap between the highlight and the popover (the arrow sits in it). */
export const POPOVER_GAP = 14;
/** The popover never comes closer than this to the edge of the screen. */
export const VIEWPORT_MARGIN = 12;
/** Below this width (Tailwind `sm`) the popover docks to the top or bottom edge like a sheet. */
export const DOCK_BELOW = 640;

/**
 * The cut-out around a target: padded, then clipped to the screen so a tall section
 * never draws a hole edge far off-screen. Null when nothing of it is on screen.
 */
export function holeFor(target: Box, view: Size, pad = HOLE_PADDING): Box | null {
  const left = Math.max(target.x - pad, 0);
  const top = Math.max(target.y - pad, 0);
  const right = Math.min(target.x + target.width + pad, view.width);
  const bottom = Math.min(target.y + target.height + pad, view.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export interface Placement {
  side: Side;
  x: number;
  y: number;
  /** Arrow offset along the popover edge facing the target, or null when the popover covers the target. */
  arrow: number | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * Puts the popover next to the highlight: below it if it fits, else above, right,
 * left. Kept inside the screen; the arrow points at the middle of the highlight.
 * When no side fits (a huge target), it sits at the bottom of the screen with no arrow.
 */
export function placePopover(
  hole: Box,
  pop: Size,
  view: Size,
  order: readonly Side[] = ["bottom", "top", "right", "left"],
): Placement {
  const m = VIEWPORT_MARGIN;
  const g = POPOVER_GAP;
  const cx = hole.x + hole.width / 2;
  const cy = hole.y + hole.height / 2;
  const fits: Record<Side, boolean> = {
    bottom: hole.y + hole.height + g + pop.height <= view.height - m,
    top: hole.y - g - pop.height >= m,
    right: hole.x + hole.width + g + pop.width <= view.width - m,
    left: hole.x - g - pop.width >= m,
  };
  const arrowEdge = 18;
  for (const side of order) {
    if (!fits[side]) continue;
    if (side === "bottom" || side === "top") {
      const x = clamp(cx - pop.width / 2, m, view.width - pop.width - m);
      const y = side === "bottom" ? hole.y + hole.height + g : hole.y - g - pop.height;
      return { side, x, y, arrow: clamp(cx - x, arrowEdge, pop.width - arrowEdge) };
    }
    const y = clamp(cy - pop.height / 2, m, view.height - pop.height - m);
    const x = side === "right" ? hole.x + hole.width + g : hole.x - g - pop.width;
    return { side, x, y, arrow: clamp(cy - y, arrowEdge, pop.height - arrowEdge) };
  }
  return {
    side: "bottom",
    x: clamp(cx - pop.width / 2, m, view.width - pop.width - m),
    y: Math.max(m, view.height - pop.height - m),
    arrow: null,
  };
}

/**
 * SVG path for the dimmed overlay: the whole screen with a rounded hole cut out.
 * Drawn with fill-rule="evenodd", so the hole is not part of the shape and clicks
 * inside it reach the page underneath.
 */
export function overlayPath(view: Size, hole: Box | null, radius = 12): string {
  const outer = `M0 0H${view.width}V${view.height}H0Z`;
  if (!hole) return outer;
  const r = Math.max(0, Math.min(radius, hole.width / 2, hole.height / 2));
  const { x, y, width: w, height: h } = hole;
  const n = (v: number) => Math.round(v * 10) / 10;
  return (
    `${outer}M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}` +
    `V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}` +
    `A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`
  );
}

/** On a phone the popover docks to the edge away from the target, so it never covers it. */
export function dockSide(hole: Box | null, view: Size): "top" | "bottom" {
  if (!hole) return "bottom";
  return hole.y + hole.height / 2 > view.height / 2 ? "top" : "bottom";
}
