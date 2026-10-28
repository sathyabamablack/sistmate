"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { wrappedSlides, type Wrapped } from "@/lib/wrapped";
import { SLIDE_BODIES, slideSpeech, slideTheme } from "./slides";
import { Summary } from "./Summary";
import styles from "./wrapped.module.css";

/** Horizontal travel (px) that counts as a swipe rather than a tap. */
const SWIPE_MIN = 48;

/** Keys the story answers to, unless focus is in a field or a dialog is open. */
function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  return Boolean(t.closest("input, textarea, select, [contenteditable='true'], [role='dialog']"));
}

/**
 * Tap-through story slides: tap or click the right half for the next slide and the left half
 * for the previous one, swipe on touch, or use the arrow keys (Home and End jump). There is
 * no timer, so nothing moves on by itself. Each new slide is announced to screen readers.
 */
export function WrappedStory({ wrapped, host }: { wrapped: Wrapped; host: string }) {
  const slides = React.useMemo(() => wrappedSlides(wrapped), [wrapped]);
  const last = slides.length - 1;
  const [index, setIndex] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");
  const id = slides[index]!;
  const theme = slideTheme(id, wrapped);

  // The current slide for event handlers, updated as soon as a move is asked for.
  const indexRef = React.useRef(0);
  const go = React.useCallback(
    (to: number) => {
      const next = Math.max(0, Math.min(last, to));
      if (next === indexRef.current) return;
      indexRef.current = next;
      setIndex(next);
      setAnnounce(`Slide ${next + 1} of ${slides.length}. ${slideSpeech(slides[next]!, wrapped)}`);
    },
    [last, slides, wrapped],
  );
  const step = React.useCallback((by: number) => go(indexRef.current + by), [go]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
          step(1);
          break;
        case "ArrowLeft":
        case "PageUp":
          step(-1);
          break;
        case "Home":
          go(0);
          break;
        case "End":
          go(last);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, step, last]);

  // Swipes: decided on pointer up; the click that follows a swipe is ignored.
  const start = React.useRef<{ x: number; y: number } | null>(null);
  const swiped = React.useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    swiped.current = false;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.3) {
      swiped.current = true;
      step(dx < 0 ? 1 : -1);
    }
  };
  const onTap = (by: number) => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    step(by);
  };

  const isSummary = id === "summary";
  const Body = isSummary ? null : SLIDE_BODIES[id];

  // Reaching the summary removes the Next button (and Watch again removes the summary), so
  // focus that would fall back to the page lands on the new slide instead.
  const slideRef = React.useRef<HTMLDivElement>(null);
  const moved = React.useRef(false);
  React.useEffect(() => {
    if (!moved.current) {
      moved.current = true;
      return;
    }
    const active = document.activeElement;
    if (!active || active === document.body) slideRef.current?.focus({ preventScroll: true });
  }, [index]);

  return (
    <div className="mx-auto w-full max-w-[25rem]">
      <section
        aria-roledescription="carousel"
        aria-label={`Semester ${wrapped.semester} wrapped`}
        className={cn(
          "relative h-[clamp(32rem,calc(100dvh-14.5rem),46rem)] select-none overflow-hidden rounded-2xl shadow-pop transition-colors duration-500 [container-type:size] [touch-action:pan-y] lg:h-[clamp(32rem,calc(100dvh-13rem),46rem)]",
          theme.frame,
        )}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (start.current = null)}
      >
        {/* Progress: one segment per slide. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex gap-1.5 px-4 pt-3.5" aria-hidden>
          {slides.map((s, i) => (
            <span key={s} className={cn("h-1 flex-1 overflow-hidden rounded-full", theme.track)}>
              {i <= index ? (
                <span
                  key={i === index ? `on-${index}` : "done"}
                  className={cn("block h-full w-full rounded-full", theme.bar, i === index && styles.fill)}
                />
              ) : null}
            </span>
          ))}
        </div>

        {/* Tap zones: the left half goes back, the right half forward. */}
        {index > 0 ? (
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => onTap(-1)}
            className={cn(
              "absolute inset-y-0 left-0 z-0 w-1/2 rounded-l-2xl outline-hidden focus-visible:ring-2 focus-visible:ring-inset",
              theme.focus,
            )}
          />
        ) : null}
        {!isSummary ? (
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => onTap(1)}
            className={cn(
              "absolute inset-y-0 right-0 z-0 w-1/2 rounded-r-2xl outline-hidden focus-visible:ring-2 focus-visible:ring-inset",
              index === 0 && "w-full rounded-l-2xl",
              theme.focus,
            )}
          />
        ) : null}

        <div
          key={id}
          ref={slideRef}
          tabIndex={-1}
          role="group"
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${slides.length}`}
          className={cn("relative z-10 h-full outline-hidden", isSummary ? "" : "pointer-events-none")}
        >
          {Body ? <Body w={wrapped} theme={theme} /> : <Summary w={wrapped} host={host} onRestart={() => go(0)} />}
        </div>

      </section>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
      <p className="mt-2.5 text-center text-small text-muted-foreground" aria-hidden>
        <span className="lg:hidden">{index === 0 ? "Tap to continue" : "Tap either side, or swipe"}</span>
        <span className="hidden lg:inline">Click either side or use the arrow keys.</span>
      </p>
    </div>
  );
}
