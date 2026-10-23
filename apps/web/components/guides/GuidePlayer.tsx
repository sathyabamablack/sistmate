"use client";

import "./guides.css";
import * as React from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import {
  formatClock,
  frameAt,
  getGuide,
  PORTAL_HOST,
  resolveGuide,
  stepLabel,
  stillOf,
  type Frame,
  type GuideId,
  type ResolvedGuide,
  type View,
} from "@/lib/guides";
import { cn } from "@/lib/utils";
import { LAPTOP_CANVAS, LaptopFrame } from "./LaptopFrame";
import { PHONE_CANVAS, PhoneFrame } from "./PhoneFrame";
import { DesktopScreen } from "./mock/desktop";
import { PhoneScreen } from "./mock/phone";

type Status = "idle" | "playing" | "paused" | "ended";

// ---------------------------------------------------------------------------
// Reduced motion: the OS setting or the portal's own "Reduce motion" switch.
// ---------------------------------------------------------------------------

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCE_QUERY);
  mq.addEventListener("change", onChange);
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  return () => {
    mq.removeEventListener("change", onChange);
    mo.disconnect();
  };
}

const readReducedMotion = () =>
  window.matchMedia(REDUCE_QUERY).matches || document.documentElement.dataset.motion === "reduce";

/** True when motion should stay off. False on the server, so the first render matches. */
export function useReducedMotion(): boolean {
  return React.useSyncExternalStore(subscribeMotion, readReducedMotion, () => false);
}

// ---------------------------------------------------------------------------
// Geometry. Positions are measured in the canvas's own (unscaled) coordinates
// by walking offsetParent, which ignores the fit and camera transforms.
// ---------------------------------------------------------------------------

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function measure(canvas: HTMLElement, target: string): Box | null {
  const el = canvas.querySelector<HTMLElement>(`[data-target="${target}"]`);
  if (!el) return null;
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== canvas) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  if (node !== canvas) return null;
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function placeHighlight(el: HTMLElement, box: Box) {
  const pad = 5;
  el.style.transform = `translate(${box.x - pad}px, ${box.y - pad}px)`;
  el.style.width = `${box.w + pad * 2}px`;
  el.style.height = `${box.h + pad * 2}px`;
}

function CursorArrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M4 2.5 L4 19.5 L8.6 15.2 L11.6 21.8 L14.6 20.4 L11.7 14 L18 14 Z" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Stage: the device, the screen for the current view, the finger and the ring.
// ---------------------------------------------------------------------------

type DivRef = React.RefObject<HTMLDivElement | null>;

function Stage({
  guide,
  view,
  typeMs,
  paused,
  scale,
  viewportRef,
  canvasRef,
  cameraRef,
  pointerRef,
  highlightRef,
  fitHeight,
}: {
  guide: ResolvedGuide;
  view: View;
  typeMs: number;
  paused: boolean;
  scale: number;
  viewportRef: DivRef;
  canvasRef: DivRef;
  cameraRef: DivRef;
  pointerRef: DivRef;
  highlightRef: DivRef;
  fitHeight?: boolean;
}) {
  const phone = guide.device === "phone";
  const canvas = phone ? PHONE_CANVAS : LAPTOP_CANVAS;
  const os = guide.id === "iphone" ? "ios" : "android";
  return (
    <div
      ref={viewportRef}
      aria-hidden
      inert
      data-paused={paused || undefined}
      className={cn("guide-stage relative select-none overflow-hidden", fitHeight ? "h-full max-w-full" : "w-full")}
      style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}
    >
      <div
        ref={canvasRef}
        className="absolute left-0 top-0 origin-top-left"
        style={
          {
            width: `${canvas.width}rem`,
            height: `${canvas.height}rem`,
            transform: `scale(${scale || 1})`,
            visibility: scale ? undefined : "hidden",
            "--guide-type-ms": `${typeMs}ms`,
          } as React.CSSProperties
        }
      >
        <div ref={cameraRef} className="guide-camera">
          {phone ? (
            <PhoneFrame os={os}>
              <PhoneScreen view={view} os={os} />
            </PhoneFrame>
          ) : (
            <LaptopFrame>
              <DesktopScreen view={view} />
            </LaptopFrame>
          )}
          <div ref={highlightRef} className="guide-highlight" />
          <div ref={pointerRef} className="guide-pointer">
            <span className="guide-ripple" />
            {phone ? <span className="guide-touch" /> : <CursorArrow className="guide-cursor" />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export interface GuidePlayerProps {
  guideId: GuideId;
  /** "capture" renders a chromeless, fixed layout for scripts/record-guides.mjs. */
  variant?: "inline" | "capture";
  /** Extra content beside the transcript (downloads, links). */
  aside?: React.ReactNode;
  className?: string;
}

declare global {
  interface Window {
    /** Set by the capture variant so the recording script can start playback. */
    __guide?: { start: () => void; duration: number };
  }
}

export function GuidePlayer({ guideId, variant = "inline", aside, className }: GuidePlayerProps) {
  const guide = React.useMemo(() => resolveGuide(getGuide(guideId)), [guideId]);
  const capture = variant === "capture";
  const reduced = useReducedMotion();
  const animated = capture || !reduced;
  const phone = guide.device === "phone";

  const [status, setStatus] = React.useState<Status>("idle");
  const [pos, setPos] = React.useState({ scene: 0, beat: 0 });
  const [scale, setScale] = React.useState(0);
  const [cover, setCover] = React.useState(capture);

  const viewportRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const cameraRef = React.useRef<HTMLDivElement>(null);
  const pointerRef = React.useRef<HTMLDivElement>(null);
  const highlightRef = React.useRef<HTMLDivElement>(null);
  const fillRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const clockRef = React.useRef<HTMLSpanElement>(null);
  const msRef = React.useRef(0);
  const posRef = React.useRef(pos);
  const statusRef = React.useRef<Status>(status);
  const autoPausedRef = React.useRef(false);
  const restRef = React.useRef<{ x: number; y: number } | null>(null);
  const headingRef = React.useRef<{ x: number; y: number } | null>(null);

  const id = React.useId();
  const titleId = `${id}-title`;
  const captionId = `${id}-caption`;

  React.useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Fit the fixed-size canvas into whatever width (or height) the layout gives it.
  React.useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas) return;
    const ro = new ResizeObserver(() => {
      if (canvas.offsetWidth) setScale(viewport.clientWidth / canvas.offsetWidth);
    });
    ro.observe(viewport);
    return () => ro.disconnect();
  }, []);

  /** Draws everything that moves every frame, without a React render. */
  const paint = React.useCallback(
    (frame: Frame | null, ms: number) => {
      guide.scenes.forEach((s, i) => {
        const fill = fillRefs.current[i];
        if (fill) fill.style.transform = `scaleX(${clamp((ms - s.start) / s.duration, 0, 1)})`;
      });
      if (clockRef.current) clockRef.current.textContent = formatClock(ms);

      const canvas = canvasRef.current;
      const pointer = pointerRef.current;
      const ring = highlightRef.current;
      if (!canvas || !pointer || !ring) return;
      const box = frame?.pointer ? measure(canvas, frame.pointer.target) : null;
      if (frame?.pointer && box) {
        const to = center(box);
        const from = restRef.current ?? {
          x: canvas.offsetWidth * (phone ? 0.62 : 0.55),
          y: canvas.offsetHeight * (phone ? 0.78 : 0.6),
        };
        const p = easeInOut(frame.pointer.progress);
        pointer.style.transform = `translate(${from.x + (to.x - from.x) * p}px, ${from.y + (to.y - from.y) * p}px)`;
        pointer.style.opacity = "1";
        pointer.toggleAttribute("data-pressing", frame.pointer.pressing);
        placeHighlight(ring, box);
        ring.toggleAttribute("data-on", frame.pointer.progress > 0.25);
        headingRef.current = to;
        return;
      }
      if (headingRef.current) {
        restRef.current = headingRef.current;
        headingRef.current = null;
      }
      pointer.removeAttribute("data-pressing");
      ring.removeAttribute("data-on");
      // A finger lifts off the glass; a cursor stays where it clicked.
      if (phone || !restRef.current) {
        pointer.style.opacity = "0";
      } else {
        pointer.style.transform = `translate(${restRef.current.x}px, ${restRef.current.y}px)`;
        pointer.style.opacity = "1";
      }
    },
    [guide, phone],
  );

  // The clock. Only discrete changes (scene, beat, end) reach React state.
  React.useEffect(() => {
    if (status !== "playing") return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      msRef.current = Math.min(guide.duration, msRef.current + (now - last));
      last = now;
      const frame = frameAt(guide, msRef.current);
      const prev = posRef.current;
      if (frame.scene !== prev.scene || frame.beat !== prev.beat) {
        posRef.current = { scene: frame.scene, beat: frame.beat };
        setPos(posRef.current);
      }
      paint(frame, msRef.current);
      if (frame.ended) {
        setStatus("ended");
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, guide, paint]);

  const seek = React.useCallback(
    (sceneIndex: number, thenPlay: boolean) => {
      const scene = guide.scenes[clamp(sceneIndex, 0, guide.scenes.length - 1)]!;
      const index = guide.scenes.indexOf(scene);
      msRef.current = scene.start;
      restRef.current = null;
      headingRef.current = null;
      posRef.current = { scene: index, beat: 0 };
      setPos(posRef.current);
      paint(null, scene.start);
      if (thenPlay) {
        autoPausedRef.current = false;
        setStatus("playing");
      }
    },
    [guide, paint],
  );

  const play = () => {
    autoPausedRef.current = false;
    if (status === "ended") seek(0, true);
    else setStatus("playing");
  };
  const pause = () => {
    autoPausedRef.current = false;
    setStatus("paused");
  };

  // Start when at least half of the frame is on screen; hold while it is not.
  React.useEffect(() => {
    if (capture || !animated) return;
    const el = viewportRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const visible = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.5);
        const s = statusRef.current;
        if (visible && (s === "idle" || (s === "paused" && autoPausedRef.current))) {
          autoPausedRef.current = false;
          setStatus("playing");
        } else if (!visible && s === "playing") {
          autoPausedRef.current = true;
          setStatus("paused");
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && statusRef.current === "playing") {
        autoPausedRef.current = true;
        setStatus("paused");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [capture, animated]);

  // The recording script starts playback itself, after the title card.
  React.useEffect(() => {
    if (!capture) return;
    window.__guide = {
      start: () => {
        setCover(false);
        window.setTimeout(() => {
          msRef.current = 0;
          setStatus("playing");
        }, 700);
      },
      duration: guide.duration + 700,
    };
    if (new URLSearchParams(window.location.search).get("autoplay") === "1") {
      const id = window.setTimeout(() => window.__guide?.start(), 1200);
      return () => {
        window.clearTimeout(id);
        delete window.__guide;
      };
    }
    return () => {
      delete window.__guide;
    };
  }, [capture, guide]);

  // What to draw: a still per step when motion is off, the poster before the first play.
  const scene = guide.scenes[pos.scene]!;
  const still = !animated ? stillOf(scene) : status === "idle" ? stillOf(guide.scenes[0]!) : null;
  const beatIndex = still ? still.beat : pos.beat;
  const view = scene.beats[beatIndex]!.view;
  const nextBeat = scene.beats[beatIndex + 1];
  const typeMs = clamp((nextBeat ? nextBeat.at : scene.duration) - scene.beats[beatIndex]!.at - 300, 400, 1600);
  const stillTarget = still?.target ?? null;

  // Camera: zoom toward the view's focus, keeping the device edges inside the frame.
  React.useLayoutEffect(() => {
    const camera = cameraRef.current;
    const canvas = canvasRef.current;
    if (!camera || !canvas) return;
    const box = view.focus ? measure(canvas, view.focus) : null;
    if (view.zoom <= 1 || !box) {
      camera.style.transform = "";
      return;
    }
    const z = view.zoom;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    const c = center(box);
    const tx = clamp(W / 2 - z * c.x, W - z * W, 0);
    const ty = clamp(H / 2 - z * c.y, H - z * H, 0);
    camera.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`;
  }, [view, scale]);

  // Stills: mark what to tap, with the finger resting on it.
  React.useLayoutEffect(() => {
    if (status === "playing") return;
    const canvas = canvasRef.current;
    const pointer = pointerRef.current;
    const ring = highlightRef.current;
    if (!canvas || !pointer || !ring) return;
    const box = stillTarget && (!animated || status === "idle") ? measure(canvas, stillTarget) : null;
    if (!box) {
      if (!animated || status === "idle") {
        ring.removeAttribute("data-on");
        pointer.style.opacity = "0";
      }
      return;
    }
    const c = center(box);
    placeHighlight(ring, box);
    ring.setAttribute("data-on", "");
    pointer.removeAttribute("data-pressing");
    pointer.style.transform = `translate(${c.x}px, ${c.y}px)`;
    pointer.style.opacity = "1";
  }, [stillTarget, animated, status, scale, pos.scene]);

  const count = guide.scenes.length;
  const label = stepLabel(pos.scene, count);

  const progress = (
    <div role="group" aria-label="Steps" className="flex items-center gap-1.5">
      {guide.scenes.map((s, i) => {
        const done = i < pos.scene || (i === pos.scene && (!animated || status === "ended"));
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => seek(i, animated)}
            aria-label={`${stepLabel(i, count)}: ${s.title}`}
            aria-current={i === pos.scene ? "step" : undefined}
            tabIndex={capture ? -1 : undefined}
            className="group flex h-8 min-w-0 items-center rounded-sm focusable"
            style={{ flexGrow: s.duration, flexBasis: 0 }}
          >
            <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-border transition-[height] group-hover:h-2">
              <span
                ref={(el) => {
                  fillRefs.current[i] = el;
                }}
                className="absolute inset-0 origin-left rounded-full bg-primary"
                // Animated: starts empty and the clock paints it each frame (a constant, so React never rewrites it).
                style={{ transform: animated ? "scaleX(0)" : `scaleX(${done ? 1 : 0})` }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );

  const caption = (
    <div id={captionId} aria-live={animated ? "off" : "polite"} className={cn(capture ? "space-y-2" : "min-h-[6.5rem] space-y-1")}>
      <p className={cn("font-semibold text-muted-foreground", capture ? "text-[22px]" : "text-micro uppercase tracking-wide")}>{label}</p>
      <p className={cn("font-display font-semibold text-foreground", capture ? "text-[40px] leading-tight" : "text-subheading")}>{scene.title}</p>
      <p className={cn("text-muted-foreground", capture ? "text-[26px] leading-snug" : "text-body leading-relaxed")}>{scene.caption}</p>
    </div>
  );

  const stage = (
    <Stage
      guide={guide}
      view={view}
      typeMs={typeMs}
      paused={animated && status !== "playing"}
      scale={scale}
      viewportRef={viewportRef}
      canvasRef={canvasRef}
      cameraRef={cameraRef}
      pointerRef={pointerRef}
      highlightRef={highlightRef}
      fitHeight={capture && phone}
    />
  );

  if (capture) {
    return (
      <div
        data-guide={guide.id}
        data-state={cover ? "cover" : status}
        data-ready={scale ? "" : undefined}
        className="relative h-dvh w-screen overflow-hidden bg-background text-foreground"
      >
        {phone ? (
          <div className="flex h-full flex-col px-[48px] pb-[40px] pt-[44px]">
            <div className="flex items-center gap-4">
              <Logo className="h-14 w-14" />
              <div>
                <p className="text-[20px] font-semibold text-muted-foreground">Student Portal</p>
                <p className="font-display text-[36px] font-semibold leading-tight">{guide.title}</p>
              </div>
            </div>
            <div className="mt-5">{progress}</div>
            <div className="mt-4 flex min-h-0 flex-1 justify-center">{stage}</div>
            <div className="mt-6 min-h-[200px]">{caption}</div>
            <p className="text-[20px] font-medium text-muted-foreground">{PORTAL_HOST}/install</p>
          </div>
        ) : (
          <div className="grid h-full grid-cols-[minmax(0,1fr)_400px] gap-10 px-[44px] py-[36px]">
            <div className="flex min-h-0 items-center">{stage}</div>
            <div className="flex min-h-0 flex-col">
              <div className="flex items-center gap-3">
                <Logo className="h-12 w-12" />
                <div>
                  <p className="text-[18px] font-semibold text-muted-foreground">Student Portal</p>
                  <p className="font-display text-[30px] font-semibold leading-tight">{guide.title}</p>
                </div>
              </div>
              <div className="mt-8">{progress}</div>
              <div className="mt-6 flex-1">{caption}</div>
              <p className="text-[18px] font-medium text-muted-foreground">{PORTAL_HOST}/install</p>
            </div>
          </div>
        )}
        {/* Tab capture only records repainted frames; this keeps the stream ticking through still moments. */}
        <span aria-hidden className="guide-keepalive" />
        {status === "idle" || cover ? (
          <div
            className={cn(
              "absolute inset-0 z-10 flex flex-col justify-center bg-accent px-[64px] text-accent-foreground transition-opacity duration-500",
              !cover && "opacity-0",
            )}
          >
            <Logo className={phone ? "h-28 w-28" : "h-24 w-24"} />
            <p className={cn("mt-8 font-display font-semibold leading-[1.05] tracking-tight", phone ? "text-[72px]" : "text-[64px]")}>{guide.title}</p>
            <p className={cn("mt-6 max-w-[900px] text-accent-foreground/80", phone ? "text-[30px]" : "text-[26px]")}>{guide.summary}</p>
            <p className={cn("mt-10 font-semibold", phone ? "text-[26px]" : "text-[22px]")}>
              {count} steps · about {Math.round(guide.duration / 1000)} seconds · {guide.browser}
            </p>
            <p className={cn("mt-2 text-accent-foreground/70", phone ? "text-[24px]" : "text-[20px]")}>{PORTAL_HOST}/install</p>
          </div>
        ) : null}
      </div>
    );
  }

  const playing = status === "playing";
  const overlay =
    animated && status !== "playing" ? (
      // Mouse and touch shortcut only; the real controls are the buttons below.
      <div
        aria-hidden
        onClick={play}
        className="absolute inset-0 z-10 grid cursor-pointer place-items-center"
      >
        <span className="grid h-16 w-16 place-items-center rounded-full bg-primary/90 text-primary-foreground shadow-pop transition-transform hover:scale-105">
          {status === "ended" ? <RotateCcw className="h-7 w-7" /> : <Play className="ml-1 h-7 w-7" />}
        </span>
      </div>
    ) : null;

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      data-guide={guide.id}
      data-state={status}
      data-motion={animated ? "animated" : "stills"}
      className={cn(
        "grid gap-x-10 gap-y-6",
        phone ? "md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:items-start" : "lg:grid-cols-[minmax(0,1fr)_18rem]",
        className,
      )}
    >
      <p id={titleId} className="sr-only">
        {guide.title}, animated guide
      </p>
      <div className={cn("min-w-0", phone && "mx-auto w-full max-w-[16rem] md:max-w-none")}>
        <div className="relative">
          {stage}
          {overlay}
        </div>
        <div className="mt-3">{progress}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {animated ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={playing ? pause : play}>
                {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                {playing ? "Pause" : status === "ended" ? "Replay" : "Play"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => seek(0, true)}>
                <RotateCcw className="h-4 w-4" aria-hidden />
                Restart
              </Button>
              <span className="ml-auto text-small tabular-nums text-muted-foreground">
                <span ref={clockRef}>0:00</span> / {formatClock(guide.duration)}
              </span>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => seek(pos.scene - 1, false)} disabled={pos.scene === 0}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Back
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => seek(pos.scene + 1, false)} disabled={pos.scene === count - 1}>
                Next
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </>
          )}
        </div>
        <div className="mt-3">{caption}</div>
        {!animated ? (
          <p className="mt-2 text-small text-muted-foreground">Motion is reduced, so this shows one still picture per step.</p>
        ) : null}
      </div>

      <div className="min-w-0 space-y-5">
        <div>
          <p className="text-small font-semibold text-foreground">The steps in words</p>
          <ol aria-label={`${guide.title}: steps`} className="mt-2 border-t border-border">
            {guide.scenes.map((s, i) => (
              <li
                key={s.id}
                aria-current={i === pos.scene ? "step" : undefined}
                className={cn(
                  "grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 border-b border-border py-3 transition-colors",
                  i === pos.scene ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-full font-display text-small font-semibold tabular-nums",
                    i === pos.scene ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <span className="text-small leading-relaxed">
                  <span className="block font-semibold text-foreground">{s.title}</span>
                  {s.caption}
                </span>
              </li>
            ))}
          </ol>
          {guide.note ? <p className="mt-3 text-small text-muted-foreground">{guide.note}</p> : null}
        </div>
        {aside}
      </div>
    </div>
  );
}
