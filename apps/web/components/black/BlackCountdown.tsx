"use client";

import Link from "@/components/ui/IntentLink";
import { useEffect, useRef, type CSSProperties } from "react";
import { COUNTDOWN_UNITS, OPENED_SEEN_KEY, OPENS_AT, pad2, splitCountdown, writeFlag } from "@/lib/black";
import { anton, mono } from "./fonts";
import { InterestButton } from "./InterestButton";
import { useNow } from "./useNow";

/*
 * Written black on black: only the light (cursor, a finger, or the beam drifting
 * by itself when nobody moves) makes them readable. `wide` ones hide on phones,
 * where the wordmark and clock take the whole width.
 */
const TRUTHS: { text: string; pos: CSSProperties; wide?: boolean }[] = [
  { text: "discover the undiscovered.", pos: { left: "6%", top: "7%" } },
  { text: "the dark isn't empty. it's unread.", pos: { right: "5%", top: "13%" }, wide: true },
  { text: "not everything is on the notice board.", pos: { left: "3%", top: "46%" }, wide: true },
  { text: "some doors only open from the inside.", pos: { right: "3%", top: "52%" }, wide: true },
  { text: "you weren't supposed to find this.", pos: { left: "8%", top: "82%" } },
  { text: "the truth was always here. you just needed light.", pos: { right: "6%", top: "88%" }, wide: true },
  { text: "every campus has a second one.", pos: { right: "7%", top: "3%" } },
  { text: "seen. never shown.", pos: { left: "14%", top: "30%" }, wide: true },
];

function reducedMotion() {
  return (
    document.documentElement.dataset.motion === "reduce" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function BlackCountdown() {
  const now = useNow();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /*
   * One frame loop for the light and the embers. The beam eases toward the
   * pointer; after a few idle seconds it wanders on its own, so phones and
   * people who never move the mouse still catch a truth or two.
   */
  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!root || !canvas || !ctx) return;

    const still = reducedMotion();
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const embers = Array.from({ length: Math.round(Math.min(60, w / 22)) }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.3 + 0.4,
      vy: Math.random() * 0.25 + 0.06,
      sway: Math.random() * Math.PI * 2,
      a: Math.random() * 0.5 + 0.15,
    }));

    const drawEmbers = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const e of embers) {
        if (!still) {
          e.y -= e.vy;
          e.x += Math.sin(t / 1800 + e.sway) * 0.12;
          if (e.y < -4) {
            e.y = h + 4;
            e.x = Math.random() * w;
          }
        }
        const flicker = still ? 1 : 0.75 + 0.25 * Math.sin(t / 300 + e.sway);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(230, 30, 40, ${e.a * flicker})`;
        ctx.fill();
      }
    };

    const beam = { x: -999, y: -999 };
    const target = { x: -999, y: -999 };
    let lastMove = -Infinity;
    const onMove = (e: PointerEvent) => {
      // Page coordinates: the beam lives in the page, so it stays under the pointer after scrolling.
      target.x = e.pageX;
      target.y = e.pageY;
      if (beam.x < -900) Object.assign(beam, target);
      lastMove = performance.now();
    };

    let frame = 0;
    const loop = (t: number) => {
      if (!still && t - lastMove > 4000) {
        target.x = w * (0.5 + 0.44 * Math.sin(t / 4300));
        target.y = h * (0.5 + 0.42 * Math.sin(t / 3100 + 1.3));
        if (beam.x < -900) Object.assign(beam, target);
      }
      const ease = still ? 1 : 0.14;
      beam.x += (target.x - beam.x) * ease;
      beam.y += (target.y - beam.y) * ease;
      root.style.setProperty("--x", `${beam.x}px`);
      root.style.setProperty("--y", `${beam.y}px`);
      if (!still || t === 0) drawEmbers(t);
      frame = requestAnimationFrame(loop);
    };
    drawEmbers(0);
    frame = requestAnimationFrame(loop);

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onMove);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
    };
  }, []);

  const open = now !== null && now >= OPENS_AT;

  // Someone who has seen the opened page needs no more nudges toward it.
  useEffect(() => {
    if (open) writeFlag("local", OPENED_SEEN_KEY, "1");
  }, [open]);

  // The tab says something else when nobody is looking at it.
  useEffect(() => {
    const original = document.title;
    const onVisibility = () => {
      document.title = document.hidden ? (open ? "the lights are on." : "still dark.") : original;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.title = original;
    };
  }, [open]);

  useEffect(() => {
    console.log(
      "%cyou opened devtools. curious. the truths aren't in here.",
      "color:#c1121f;font:13px monospace",
    );
  }, []);

  const t = now === null ? null : splitCountdown(OPENS_AT - now);

  return (
    <div
      ref={rootRef}
      className="sb-root relative isolate flex min-h-dvh touch-pan-y select-none flex-col overflow-hidden bg-[#050505] text-[#8a8a8a] [--x:-999px] [--y:-999px]"
    >
      <style>{CSS}</style>

      {/* Atmosphere: red floor glow, rings around the wordmark, grain, embers. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 50% 108%, rgba(140,8,16,0.32), transparent 70%), radial-gradient(ellipse 60% 50% at 50% 28%, rgba(60,4,8,0.35), transparent 70%)",
        }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
        {[38, 62, 88, 118].map((size, i) => (
          <span
            key={size}
            className="sb-ring absolute aspect-square rounded-full border border-white/[0.035]"
            style={{ width: `${size}vmax`, animationDelay: `${i * -2.5}s` }}
          />
        ))}
      </div>
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />
      <div aria-hidden className="sb-grain pointer-events-none absolute inset-0 -z-10 opacity-[0.06] mix-blend-screen" />

      {/* The beam, then what it reveals. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(circle 200px at var(--x) var(--y), rgba(200,20,30,0.10), rgba(255,255,255,0.02) 45%, transparent 75%)",
        }}
      />
      <div
        aria-hidden
        className={`${mono.className} pointer-events-none absolute inset-0 -z-10 text-[11px] tracking-[0.06em] sm:text-xs`}
        style={{
          maskImage: "radial-gradient(circle 170px at var(--x) var(--y), #000 25%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(circle 170px at var(--x) var(--y), #000 25%, transparent 100%)",
        }}
      >
        {TRUTHS.map((truth) => (
          <span
            key={truth.text}
            className={`absolute whitespace-nowrap text-[#e8e8e8] ${truth.wide ? "max-sm:hidden" : ""}`}
            style={truth.pos}
          >
            {truth.text}
          </span>
        ))}
      </div>

      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-4 pt-10 text-center">
        <h1 className={`${anton.className} sb-rise uppercase leading-[0.86]`}>
          <span className="block text-[clamp(3.1rem,18vw,8.5rem)] tracking-[0.01em] text-[#ececec]">
            Sathyabama
          </span>
          <span
            className="relative inline-block tracking-[-0.01em]"
            style={{ fontSize: "clamp(4.6rem, 28vw, 13.5rem)" }}
          >
            <span className="sb-black">Black</span>
            {/* Glitch copies: they only twitch for a split second every few seconds. */}
            <span aria-hidden className="sb-black sb-glitch sb-glitch-a absolute inset-0">
              Black
            </span>
            <span aria-hidden className="sb-black sb-glitch sb-glitch-b absolute inset-0">
              Black
            </span>
            <span aria-hidden className="sb-dot absolute -right-[0.17em] bottom-[0.1em] size-[0.12em] bg-[#e01b24]" />
          </span>
        </h1>

        <p className="sb-rise mt-6 text-[15px] text-[#9a9a9a] [animation-delay:150ms] sm:mt-8 sm:text-lg">
          Something different is coming. Stay curious.
        </p>

        {open ? (
          <div className="sb-rise mt-10 flex flex-col items-center [animation-delay:300ms] sm:mt-14">
            <p className={`${mono.className} text-sm uppercase tracking-[0.5em] text-[#ededed]`}>
              the lights are on<span className="text-[#e01b24]">.</span>
            </p>
            <Link
              href="/"
              className={`${mono.className} mt-6 inline-flex min-h-11 items-center gap-3 border border-[#e01b24]/50 px-6 text-xs uppercase tracking-[0.35em] text-[#ededed] transition-colors hover:border-[#e01b24] hover:bg-[#e01b24]/10`}
            >
              enter <span aria-hidden>→</span>
            </Link>
          </div>
        ) : (
          <>
            <div
              role="timer"
              aria-live="off"
              aria-label={
                t
                  ? `${t.days} days, ${t.hours} hours, ${t.minutes} minutes, ${t.seconds} seconds until it opens, Wednesday 28 October, 11:00 IST`
                  : "Opens Wednesday 28 October, 11:00 IST"
              }
              className={`${mono.className} sb-rise mt-10 grid w-full max-w-[60rem] grid-cols-4 [animation-delay:300ms] sm:mt-10`}
            >
              {COUNTDOWN_UNITS.map((unit) => (
                <div
                  key={unit}
                  className="flex flex-col items-center border-l border-white/[0.07] py-4 last:border-r sm:py-6"
                >
                  <span
                    className={`text-[clamp(2rem,9vw,4.75rem)] font-bold leading-none tabular-nums ${
                      unit === "seconds"
                        ? "text-[#e01b24] [text-shadow:0_0_24px_rgba(224,27,36,0.45)]"
                        : "text-[#f2f2f2]"
                    }`}
                  >
                    {t ? (
                      <span key={t[unit]} className={unit === "seconds" ? "sb-tick inline-block" : undefined}>
                        {pad2(t[unit])}
                      </span>
                    ) : (
                      <span className="text-[#2a2a2a]">--</span>
                    )}
                  </span>
                  <span className="mt-3 text-[9px] font-medium uppercase tracking-[0.35em] text-[#6b6b6b] sm:mt-5 sm:text-[11px]">
                    {unit}
                  </span>
                </div>
              ))}
            </div>
            <InterestButton />
            <p
              className={`${mono.className} sb-rise mt-8 text-[11px] uppercase tracking-[0.5em] text-[#6b6b6b] [animation-delay:450ms] sm:mt-8 sm:text-xs`}
            >
              coming soon<span className="sb-dot text-[#e01b24]">.</span>
            </p>
            <p className="sr-only">Opens Wednesday 28 October, 11:00 IST.</p>
          </>
        )}
      </main>

      <footer className="mx-4 mt-auto flex flex-col gap-2 border-t border-white/[0.06] pb-2 pt-3 text-[11px] leading-snug sm:mx-8 sm:flex-row sm:items-end sm:justify-between sm:gap-8 sm:pb-3 sm:pt-4 sm:text-[13px]">
        <span className="shrink-0 font-semibold text-[#d4d4d4]">
          SathyabamaBlack <span className="font-normal text-[#6b6b6b]">© 2026</span>
        </span>
        <p className="max-w-2xl text-[#777] sm:text-right">
          An independent project. Not affiliated with, endorsed by, or operated by Sathyabama
          Institute of Science and Technology.
        </p>
      </footer>
    </div>
  );
}

const CSS = `
.sb-black {
  background: linear-gradient(180deg, #a3111c 0%, #7a0a14 55%, #4a050b 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 28px rgba(160, 10, 22, 0.35));
}
.sb-glitch { opacity: 0; }
.sb-grain {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
@media (prefers-reduced-motion: no-preference) {
  html:not([data-motion="reduce"]) .sb-rise { animation: sb-rise 1.1s cubic-bezier(.2,.7,.1,1) both; }
  html:not([data-motion="reduce"]) .sb-ring { animation: sb-breathe 10s ease-in-out infinite; }
  html:not([data-motion="reduce"]) .sb-dot { animation: sb-blink 1.1s steps(1) infinite; }
  html:not([data-motion="reduce"]) .sb-tick { animation: sb-tick .45s cubic-bezier(.2,.7,.1,1); }
  html:not([data-motion="reduce"]) .sb-glitch-a { animation: sb-glitch-a 7s infinite; }
  html:not([data-motion="reduce"]) .sb-glitch-b { animation: sb-glitch-b 7s infinite; }
}
@keyframes sb-rise {
  from { opacity: 0; transform: translateY(18px); filter: blur(10px); }
  to { opacity: 1; transform: none; filter: none; }
}
@keyframes sb-breathe {
  0%, 100% { transform: scale(1); opacity: .6; }
  50% { transform: scale(1.035); opacity: 1; }
}
@keyframes sb-blink { 0%, 60% { opacity: 1; } 61%, 100% { opacity: .15; } }
@keyframes sb-tick {
  from { opacity: .2; transform: translateY(-14%); filter: blur(3px); }
  to { opacity: 1; transform: none; filter: none; }
}
@keyframes sb-glitch-a {
  0%, 91%, 100% { opacity: 0; transform: none; }
  92% { opacity: .9; transform: translate(-4px, 0); clip-path: inset(10% 0 62% 0); }
  94% { opacity: .9; transform: translate(5px, 0); clip-path: inset(55% 0 20% 0); }
  96% { opacity: .9; transform: translate(-2px, 0); clip-path: inset(30% 0 45% 0); }
  97% { opacity: 0; }
}
@keyframes sb-glitch-b {
  0%, 91%, 100% { opacity: 0; transform: none; }
  92.5% { opacity: .6; transform: translate(4px, 1px); clip-path: inset(70% 0 8% 0); filter: hue-rotate(-20deg) brightness(1.8); }
  95% { opacity: .6; transform: translate(-5px, 0); clip-path: inset(18% 0 66% 0); filter: brightness(2.2); }
  96.5% { opacity: 0; }
}
`;
