"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn, titleCase } from "@/lib/utils";
import {
  DOCK_BELOW,
  INSTALL_STEPS,
  TOUR_STEPS,
  afterMissing,
  backIndex,
  dockSide,
  holeFor,
  nextIndex,
  overlayPath,
  placePopover,
  routeLabel,
  stepCounter,
  tourCopy,
  type Box,
  type CopyContext,
  type Side,
  type Size,
  type TourStep,
  type TourTarget,
  type WaitForStep,
} from "@/lib/tour";
import { bootTour, endTour, goToStep, useTourState } from "./store";

/**
 * The first-time walkthrough's engine: a dimmed overlay with a rounded cut-out
 * around one element, a popover next to it, and steps that wait for the student
 * to click the highlighted thing. Self-contained (no tour library): it has to
 * follow the student across pages, wait for clicks and dialogs, and stay inside
 * the Register design system.
 *
 * Layers: overlay and highlight at z-55, popover at z-56. That is above the tab
 * bar (40) and dialogs (50), so a highlighted tab or a button inside the course
 * chooser shows through the cut-out, and below the command palette (60) and the
 * skip link (70).
 */

/** How long a step waits for its page and element before offering "Can't see it?". */
const WAIT_MS = 5_000;
/** After the page has loaded, how long an optional step waits for its element before skipping itself. */
const GRACE_MS = 700;
/** How long a shown element may disappear (a re-render, a closing dialog) before the step reacts. */
const LOST_MS = 600;
/** The "Loading the next step" note only appears when the wait is noticeable. */
const SLOW_MS = 600;
const POP_WIDTH = 352;

type Phase = "seeking" | "shown" | "missing";

const LG_QUERY = "(min-width: 1024px)";
const STANDALONE_QUERY = "(display-mode: standalone)";

function subscribeQuery(query: string) {
  return (onChange: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  };
}
const subscribeLg = subscribeQuery(LG_QUERY);
const subscribeStandalone = subscribeQuery(STANDALONE_QUERY);
const noopSubscribe = () => () => {};

function useDevice(): CopyContext["device"] {
  const desktop = React.useSyncExternalStore(
    subscribeLg,
    () => window.matchMedia(LG_QUERY).matches,
    () => true,
  );
  return desktop ? "desktop" : "phone";
}

function useShortcut(): string {
  const apple = React.useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent),
    () => false,
  );
  return apple ? "⌘K" : "Ctrl K";
}

/** The visible element for a target: the rail link on desktop, the tab bar link on a phone. */
function findTarget(name: TourTarget): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    if (el.getClientRects().length === 0) continue;
    if (el instanceof HTMLButtonElement && el.disabled) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    return el;
  }
  return null;
}

function conditionMet(step: WaitForStep, el: HTMLElement | null): boolean {
  if (step.until === "pressed") return el?.getAttribute("aria-pressed") === "true";
  const dialog = step.dialog ? document.querySelector(`[data-tour="${step.dialog}"]`) : null;
  const open = dialog?.getAttribute("data-state") === "open";
  return step.until === "dialog-open" ? open : !open;
}

function prefersReducedMotion(): boolean {
  return (
    document.documentElement.getAttribute("data-motion") === "reduce" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Rail links, the tab bar and dialogs never scroll with the page. */
function isPinned(el: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
    const p = getComputedStyle(n).position;
    if (p === "fixed" || p === "sticky") return true;
  }
  return false;
}

/** Brings the target into view: centred on a desktop, near the top on a phone (the popover docks below). */
function scrollToTarget(el: HTMLElement) {
  if (isPinned(el)) return;
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const phone = window.innerWidth < DOCK_BELOW;
  const top = 64; // clears the sticky top bar
  let delta: number | null = null;
  if (phone) {
    if (r.top < top || r.top > vh * 0.4) delta = r.top - (top + 8);
  } else if (r.top < top || r.bottom > vh - 24) {
    delta = r.height < vh - 260 ? r.top - (vh - r.height) / 2 : r.top - (top + 16);
  }
  if (delta === null) return;
  window.scrollTo({ top: window.scrollY + delta, behavior: prefersReducedMotion() ? "instant" : "smooth" });
}

function focusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")].filter(
    (el) => el.getClientRects().length > 0,
  );
}

/** True while a Radix dialog or menu is animating closed: it hands focus back when done. */
const closingLayer = () => document.querySelector('[role="dialog"][data-state="closed"], [role="menu"][data-state="closed"]');

function firstName(name: string): string {
  return titleCase(name).trim().split(/\s+/)[0] ?? "";
}

/** Ends the tour and puts keyboard focus somewhere sensible instead of on <body>. */
function finish(outcome: "done" | "skipped") {
  const active = document.activeElement;
  const lost = !active || active === document.body || !!active.closest("[data-tour-layer]");
  endTour(outcome);
  if (lost) document.getElementById("main")?.focus({ preventScroll: true });
}

/** Mounted once in the app shell. Resumes or auto-starts the tour, and draws the current step. */
export function Tour({ studentName }: { studentName: string }) {
  const pathname = usePathname();
  const tour = useTourState();
  const device = useDevice();
  const shortcut = useShortcut();
  const [announcement, setAnnouncement] = React.useState("");
  const running = tour.run !== null;

  React.useEffect(() => {
    bootTour(pathname);
  }, [pathname]);

  // Escape skips the tour, unless an open menu or dialog used it to close itself.
  React.useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) finish("skipped");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running]);

  const ctx: CopyContext = { device, name: firstName(studentName), threshold: tour.threshold, shortcut };

  return (
    <>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {running ? announcement : ""}
      </p>
      {tour.run ? (
        <TourStepView
          key={tour.run.index}
          index={tour.run.index}
          skipped={tour.run.skipped}
          ctx={ctx}
          pathname={pathname}
          onShown={setAnnouncement}
        />
      ) : null}
    </>
  );
}

function TourStepView({
  index,
  skipped,
  ctx,
  pathname,
  onShown,
}: {
  index: number;
  skipped: readonly number[];
  ctx: CopyContext;
  pathname: string;
  onShown: (text: string) => void;
}) {
  const step: TourStep = TOUR_STEPS[index]!;
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("seeking");
  const [slow, setSlow] = React.useState(false);
  const [target, setTarget] = React.useState<HTMLElement | null>(null);
  const [hole, setHole] = React.useState<Box | null>(null);
  const [view, setView] = React.useState<Size | null>(null);
  const [popSize, setPopSize] = React.useState<Size | null>(null);
  const popRef = React.useRef<HTMLDivElement>(null);
  const pathRef = React.useRef(pathname);

  const title = tourCopy(step.title, ctx);
  const body = tourCopy(step.body, ctx);
  const counter = stepCounter(index);
  const back = step.kind === "info" ? backIndex(index, new Set(skipped), pathname) : null;
  const waits = step.kind !== "info";

  const next = React.useCallback(() => goToStep(nextIndex(index)), [index]);
  const skipStep = React.useCallback(() => goToStep(nextIndex(index), true), [index]);
  const skipGroup = React.useCallback(() => goToStep(nextIndex(index, true), true), [index]);
  const skipMissing = React.useCallback(() => goToStep(afterMissing(index), true), [index]);

  // The loop below reads these without restarting.
  const latest = React.useRef({ next, skipGroup, skipMissing, announce: "" });
  React.useEffect(() => {
    pathRef.current = pathname;
    latest.current = {
      next,
      skipGroup,
      skipMissing,
      announce: [counter, title, body].filter(Boolean).join(". "),
    };
  });

  /*
   * One animation-frame loop per step: finds the target (waiting for a page change
   * or a slow render), tracks its box through scrolling, resizing and layout shifts,
   * advances "wait-for" steps when their condition comes true, and skips optional
   * steps whose element never shows up.
   */
  React.useEffect(() => {
    const t0 = performance.now();
    let readyAt: number | null = null;
    let seen = false;
    let lostAt: number | null = null;
    let scrolled = false;
    let focused = false;
    let stopped = false;
    let raf = 0;
    let last = { phase: "", hole: "", view: "", el: null as HTMLElement | null, slow: false };

    const stop = (then: () => void) => {
      stopped = true;
      then();
    };

    const tick = () => {
      if (stopped) return;
      const now = performance.now();
      const routeOk = !step.route || step.route === pathRef.current;
      const pageReady = routeOk && document.querySelector("main h1") !== null;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let phaseNow: Phase;
      let el: HTMLElement | null = null;
      let holding = false;

      if (!step.target) {
        phaseNow = routeOk ? "shown" : now - t0 > WAIT_MS ? "missing" : "seeking";
      } else {
        el = routeOk ? findTarget(step.target) : null;
        if (step.kind === "wait-for" && seen && conditionMet(step, el)) return stop(latest.current.next);
        if (el) {
          seen = true;
          lostAt = null;
          phaseNow = "shown";
          if (!scrolled) {
            scrolled = true;
            scrollToTarget(el);
          }
        } else if (seen) {
          // It was there and went away: a closed dialog, or the student left the page.
          lostAt ??= now;
          if (now - lostAt > LOST_MS) {
            // The rest of a group needs this element (Save needs the open chooser).
            if (step.group) return stop(latest.current.skipGroup);
            seen = false;
          }
          // Hold the last picture for a moment: it may come straight back after a re-render.
          holding = seen;
          phaseNow = seen ? (last.phase as Phase) : "missing";
        } else {
          readyAt = pageReady ? (readyAt ?? now) : null;
          if (step.optional && readyAt !== null && now - readyAt > GRACE_MS) return stop(latest.current.skipMissing);
          phaseNow = now - t0 > WAIT_MS ? "missing" : "seeking";
        }
      }

      const viewKey = `${vw}x${vh}`;
      const slowNow = phaseNow === "seeking" && now - t0 > SLOW_MS;
      if (phaseNow !== last.phase) setPhase(phaseNow);
      if (viewKey !== last.view) setView({ width: vw, height: vh });
      if (slowNow !== last.slow) setSlow(slowNow);
      if (!holding) {
        const box = el && phaseNow === "shown" ? el.getBoundingClientRect() : null;
        const holeNow = box
          ? holeFor({ x: box.x, y: box.y, width: box.width, height: box.height }, { width: vw, height: vh })
          : null;
        const holeKey = holeNow
          ? [holeNow.x, holeNow.y, holeNow.width, holeNow.height].map(Math.round).join(",")
          : "";
        if (holeKey !== last.hole) setHole(holeNow);
        if (el !== last.el) setTarget(el);
        last = { ...last, hole: holeKey, el };
      }
      last = { ...last, phase: phaseNow, view: viewKey, slow: slowNow };

      // Move focus into the popover once it is placed, after any closing menu has handed focus back.
      const pop = popRef.current;
      if (!focused && phaseNow !== "seeking" && pop && pop.style.visibility !== "hidden" && !closingLayer()) {
        focused = true;
        pop.focus({ preventScroll: true });
        onShown(latest.current.announce);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [step, onShown]);

  // Click steps move on when the highlighted element is clicked (capture phase, so it runs
  // before the page's own handler navigates or re-renders). Tab from the element returns
  // to the popover, so keyboard users can go back and forth without a focus trap.
  React.useEffect(() => {
    if (!target || !waits) return;
    const onClick = () => {
      if (step.kind === "click") latest.current.next();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables(popRef.current);
      const to = e.shiftKey ? items.at(-1) : items[0];
      if (!to) return;
      e.preventDefault();
      to.focus();
    };
    target.addEventListener("click", onClick, { capture: true });
    target.addEventListener("keydown", onKeyDown);
    return () => {
      target.removeEventListener("click", onClick, { capture: true });
      target.removeEventListener("keydown", onKeyDown);
    };
  }, [target, waits, step.kind]);

  /*
   * The dimmed page does not respond to the mouse or touch while the tour is up. The overlay
   * itself never takes pointer events (so a click lands on exactly what is under the cursor,
   * even mid-scroll); instead pointer and click events are stopped in the capture phase unless
   * they are on the tour's popover, the element a click step is waiting for, or the command
   * palette. Scrolling still works, and the keyboard is never trapped.
   */
  React.useEffect(() => {
    const allowed = (node: EventTarget | null) => {
      const el = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
      if (!el) return false;
      if (waits && target?.contains(el)) return true;
      return el.closest("[data-tour-layer], [data-tour-allow]") !== null;
    };
    const block = (e: Event) => {
      // Only the student's own input is stopped; the tour's "Undo the skip" clicks for them.
      if (!e.isTrusted || allowed(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const types = ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick", "auxclick", "contextmenu"];
    for (const t of types) window.addEventListener(t, block, { capture: true });
    return () => {
      for (const t of types) window.removeEventListener(t, block, { capture: true });
    };
  }, [target, waits]);

  // Measure the popover so it can be placed; it grows when the install help opens.
  React.useEffect(() => {
    const el = popRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPopSize({ width: el.offsetWidth, height: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);

  const onPopoverKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const items = focusables(popRef.current);
    const first = items[0];
    const lastItem = items.at(-1);
    const active = document.activeElement;
    // Click steps: Tab moves between the popover and the highlighted element. Info steps: it cycles in the popover.
    const out = waits && phase === "shown" && target ? target : null;
    if (!e.shiftKey && active === lastItem) {
      e.preventDefault();
      (out ?? first)?.focus();
    } else if (e.shiftKey && (active === first || active === popRef.current)) {
      e.preventDefault();
      (out ?? lastItem)?.focus();
    }
  };

  if (!view) return null;

  const missing = phase === "missing";
  const routeMismatch = missing && step.route !== undefined && step.route !== pathname;
  const anchored = phase === "shown" && step.target !== undefined;
  const docked = view.width < DOCK_BELOW;
  const width = Math.min(POP_WIDTH, view.width - 32);

  let style: React.CSSProperties;
  let arrow: { side: Side; offset: number } | null = null;
  if (!popSize || (anchored && !hole)) {
    style = { left: 0, top: 0, width: docked ? view.width - 32 : width, visibility: "hidden" };
  } else if (docked) {
    const side = anchored ? dockSide(hole, view) : null;
    style =
      side === "top"
        ? { left: 16, right: 16, top: "calc(16px + env(safe-area-inset-top))" }
        : side === "bottom"
          ? { left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom))" }
          : { left: 16, right: 16, top: Math.max(16, (view.height - popSize.height) / 2) };
  } else if (!anchored || !hole) {
    style = { left: (view.width - popSize.width) / 2, top: Math.max(16, (view.height - popSize.height) / 2), width };
  } else {
    const order: Side[] = ["bottom", "top", "right", "left"];
    const p = placePopover(hole, popSize, view, step.side ? [step.side, ...order.filter((s) => s !== step.side)] : order);
    style = { left: p.x, top: p.y, width };
    if (p.arrow !== null) arrow = { side: p.side, offset: p.arrow };
  }

  const showHole = anchored && hole !== null;
  const isWelcome = index === 0;
  const isFinish = index === TOUR_STEPS.length - 1;

  return (
    <>
      <svg
        aria-hidden
        data-tour-layer
        className="pointer-events-none fixed inset-0 z-55"
        width={view.width}
        height={view.height}
        viewBox={`0 0 ${view.width} ${view.height}`}
      >
        <path d={overlayPath(view, showHole ? hole : null)} fillRule="evenodd" className="fill-foreground/50" />
      </svg>

      {showHole ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-55 rounded-xl shadow-[0_0_0_4px_hsl(var(--primary)/0.25)] ring-2 ring-primary"
          style={{ left: hole.x, top: hole.y, width: hole.width, height: hole.height }}
        />
      ) : null}

      {phase === "seeking" ? (
        slow ? (
          <div
            data-tour-layer
            role="status"
            className="fixed left-1/2 top-1/2 z-56 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-full bg-surface py-1.5 pl-4 pr-1.5 text-small text-foreground shadow-pop ring-1 ring-border"
          >
            Loading the next step…
            <Button type="button" variant="ghost" size="sm" onClick={() => finish("skipped")}>
              Skip tour
            </Button>
          </div>
        ) : null
      ) : (
        <div
          ref={popRef}
          data-tour-layer
          data-tour-step={step.id}
          role="dialog"
          aria-modal="false"
          aria-labelledby="tour-title"
          aria-describedby="tour-body"
          tabIndex={-1}
          onKeyDown={onPopoverKeyDown}
          className={cn(
            "pointer-events-auto fixed z-56 rounded-xl bg-surface p-4 text-foreground shadow-pop ring-1 ring-border outline-hidden animate-pop-in sm:p-5",
            "focus-visible:ring-2 focus-visible:ring-ring",
          )}
          style={style}
        >
          {arrow ? <Arrow side={arrow.side} offset={arrow.offset} /> : null}
          {counter ? (
            <p className="text-micro font-medium tabular-nums text-muted-foreground">{counter}</p>
          ) : null}
          <h2 id="tour-title" className="font-display text-heading font-semibold text-foreground">
            {title}
          </h2>
          <p id="tour-body" className="mt-1 text-body text-muted-foreground">
            {body}
          </p>

          {missing ? (
            <div className="mt-3 rounded-lg bg-muted px-3 py-2.5 text-small text-foreground">
              {routeMismatch ? (
                <p className="mb-2">This step is on the {routeLabel(step.route!)} page.</p>
              ) : null}
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>Can&apos;t see it?</span>
                <button
                  type="button"
                  onClick={skipStep}
                  className="inline-flex min-h-11 items-center rounded-md font-semibold text-primary underline underline-offset-4 focusable lg:min-h-0"
                >
                  Skip this step
                </button>
              </p>
            </div>
          ) : null}

          {isFinish ? <InstallHelp /> : null}

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {isWelcome ? (
              <>
                <Button type="button" variant="ghost" size="sm" className="mr-auto -ml-3" onClick={() => finish("skipped")}>
                  Skip for now
                </Button>
                <Button type="button" size="sm" onClick={next}>
                  Start the tour
                </Button>
              </>
            ) : (
              <>
                {isFinish ? null : (
                  <Button type="button" variant="ghost" size="sm" className="mr-auto -ml-3" onClick={() => finish("skipped")}>
                    Skip tour
                  </Button>
                )}
                {back !== null && !missing ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => goToStep(back)}>
                    Back
                  </Button>
                ) : null}
                {routeMismatch ? (
                  <Button type="button" size="sm" onClick={() => router.push(step.route!)}>
                    Go to {routeLabel(step.route!)}
                  </Button>
                ) : null}
                {step.kind === "info" && step.action && !missing ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const el = findTarget(step.action!.clicks);
                      if (el?.getAttribute("aria-pressed") === "true") el.click();
                      next();
                    }}
                  >
                    {step.action.label}
                  </Button>
                ) : null}
                {step.kind === "info" && !missing ? (
                  <Button type="button" size="sm" onClick={isFinish ? () => finish("done") : next}>
                    {isFinish ? "Done" : "Next"}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const arrowEdge: Record<Side, string> = {
  bottom: "-top-1.5 border-l border-t",
  top: "-bottom-1.5 border-r border-b",
  right: "-left-1.5 border-l border-b",
  left: "-right-1.5 border-r border-t",
};

/** Points from the popover at the highlight. Decorative. */
function Arrow({ side, offset }: { side: Side; offset: number }) {
  const along = side === "bottom" || side === "top" ? { left: offset - 6 } : { top: offset - 6 };
  return (
    <span
      aria-hidden
      className={cn("absolute h-3 w-3 rotate-45 border-border bg-surface", arrowEdge[side])}
      style={along}
    />
  );
}

/** "Add the app to your home screen", folded into the last step. Hidden when already installed. */
function InstallHelp() {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const standalone = React.useSyncExternalStore(
    subscribeStandalone,
    () =>
      window.matchMedia(STANDALONE_QUERY).matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => false,
  );
  if (standalone) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 items-center gap-1 rounded-md text-small font-semibold text-primary underline-offset-4 hover:underline focusable lg:min-h-0"
      >
        Add the app to your home screen
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <ul id={id} hidden={!open} className="mt-1 space-y-1 text-small text-muted-foreground">
        {INSTALL_STEPS.map((s) => (
          <li key={s.device}>
            <span className="font-semibold text-foreground">{s.device}:</span> {s.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
