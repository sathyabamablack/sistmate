"use client";

import * as React from "react";
import type { CSSProperties } from "react";
import { ArrowDownRight, ArrowUpRight, Check, Download, Minus, RotateCcw, Share2 } from "lucide-react";
import { formatPct } from "@/lib/attendance";
import { cn } from "@/lib/utils";
import { tileRows, wrappedSummary, type SummaryTile, type Wrapped } from "@/lib/wrapped";
import { renderShareImage } from "./share-image";
import { THEMES } from "./slides";
import styles from "./wrapped.module.css";

/** The same pairs as TILE_COLORS in share-image.ts, as classes. */
const TILE_CLASSES: Record<SummaryTile["id"], string> = {
  cgpa: "bg-[#64c9a7] text-[#0f2421]",
  credits: "bg-[#f3f6f4] text-[#0f2421]",
  best: "bg-[#e09f1f] text-[#0f2421]",
  "top-grades": "bg-[#d9ede3] text-[#0f2421]",
  attendance: "bg-[#f3f6f4] text-[#0f2421]",
};

const HIDE_GPA_KEY = "usp-wrapped-hide-gpa";

/* "Hide GPA", remembered in this browser only (and in memory when storage is blocked). */
let hideGpaMemory: boolean | null = null;
const hideGpaListeners = new Set<() => void>();

function readHideGpa(): boolean {
  if (hideGpaMemory != null) return hideGpaMemory;
  try {
    return window.localStorage.getItem(HIDE_GPA_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHideGpa(v: boolean) {
  hideGpaMemory = v;
  try {
    window.localStorage.setItem(HIDE_GPA_KEY, v ? "1" : "0");
  } catch {
    /* storage blocked: the choice lasts for this visit */
  }
  hideGpaListeners.forEach((l) => l());
}

function subscribeHideGpa(listener: () => void) {
  hideGpaListeners.add(listener);
  return () => {
    hideGpaListeners.delete(listener);
  };
}

function useHideGpa(): [boolean, (v: boolean) => void] {
  const hide = React.useSyncExternalStore(subscribeHideGpa, readHideGpa, () => false);
  return [hide, writeHideGpa];
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const theme = THEMES.brand;
const at = (i: number) => ({ "--i": i }) as CSSProperties;

/** The closing card: what the share image shows, the Hide GPA switch, and Share / Download. */
export function Summary({ w, host, onRestart }: { w: Wrapped; host: string; onRestart: () => void }) {
  const [hideGpa, setHideGpa] = useHideGpa();
  const summary = React.useMemo(() => wrappedSummary(w, { hideGpa, attendancePct: formatPct }), [w, hideGpa]);
  const fileName = `semester-${w.semester}-wrapped.png`;
  const gpaFraction = !hideGpa && w.gpa != null ? w.gpa / 10 : null;

  // The image is made ahead of the tap: some browsers only allow sharing straight after it.
  const [made, setMade] = React.useState<{ for: unknown; file: File } | null>(null);
  const file = made?.for === summary ? made.file : null;
  const [busy, setBusy] = React.useState<"share" | "download" | null>(null);
  const [status, setStatus] = React.useState("");
  React.useEffect(() => {
    let live = true;
    renderShareImage(summary, { host, semester: w.semester, gpaFraction })
      .then((blob) => {
        if (live) setMade({ for: summary, file: new File([blob], fileName, { type: "image/png" }) });
      })
      .catch(() => {
        /* made again on the tap, which reports the error */
      });
    return () => {
      live = false;
    };
  }, [summary, host, w.semester, gpaFraction, fileName]);

  const getFile = async (): Promise<File> =>
    file ?? new File([await renderShareImage(summary, { host, semester: w.semester, gpaFraction })], fileName, { type: "image/png" });

  const onDownload = async () => {
    setBusy("download");
    try {
      download(await getFile(), fileName);
      setStatus("Image saved. Post it from your downloads.");
    } catch {
      setStatus("Couldn't make the image. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const onShare = async () => {
    setBusy("share");
    try {
      const f = await getFile();
      const data: ShareData = { files: [f], title: summary.title };
      if (typeof navigator.share === "function" && navigator.canShare?.(data)) {
        try {
          await navigator.share(data);
          setStatus("");
        } catch (err) {
          if ((err as DOMException)?.name === "AbortError") return; // closed the share sheet
          download(f, fileName);
          setStatus("Sharing didn't open, so the image was saved instead.");
        }
      } else {
        download(f, fileName);
        setStatus("Sharing isn't available here, so the image was saved instead.");
      }
    } catch {
      setStatus("Couldn't make the image. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const change = summary.gpa?.change ?? "";
  const ChangeIcon = /^Up/.test(change) ? ArrowUpRight : /^Down/.test(change) ? ArrowDownRight : /^Same/.test(change) ? Minus : null;
  const rows = tileRows(summary.tiles);
  const chip = cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-micro font-semibold", theme.soft);

  return (
    <div className="flex h-full flex-col px-5 pb-4 pt-9 sm:px-6">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <p className={cn(styles.rise, "min-w-0 truncate font-display text-subheading font-semibold")} style={at(0)}>
          {summary.gpa ? summary.title : "Your summary"}
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={hideGpa}
          onClick={() => setHideGpa(!hideGpa)}
          className={cn(
            "-mr-1 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-1 text-small font-semibold focusable",
            theme.focus,
          )}
        >
          Hide GPA
          <span
            aria-hidden
            className={cn(
              "relative inline-flex h-6 w-10 items-center rounded-full transition-colors",
              hideGpa ? "bg-[#64c9a7]" : "bg-[#f3f6f4]/25",
            )}
          >
            <span
              className={cn(
                "absolute left-0.5 h-5 w-5 rounded-full bg-[#f3f6f4] shadow transition-transform",
                hideGpa && "translate-x-4",
              )}
            />
          </span>
        </button>
      </div>

      <section
        aria-label="Summary card"
        className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1 scrollbar-slim"
      >
        {summary.gpa ? (
          <div className={cn(styles.rise, "mt-1")} style={at(1)}>
            <p className="text-micro font-semibold uppercase tracking-[0.14em] text-[#64c9a7]">
              {summary.gpa.label}
              {summary.note ? " · estimated" : ""}
            </p>
            <p className="font-display text-[min(19cqw,11cqh)] font-semibold leading-[0.95] tracking-[-0.045em] tabular-nums">
              {summary.gpa.value}
            </p>
          </div>
        ) : (
          <p
            className={cn(styles.rise, "mt-1 font-display text-[min(12cqw,7.5cqh)] font-semibold leading-[0.95] tracking-[-0.03em]")}
            style={at(1)}
          >
            Semester {w.semester} <span className="text-[#64c9a7]">wrapped.</span>
          </p>
        )}

        {summary.gpa || summary.arrears ? (
          <ul className={cn(styles.rise, "mt-2.5 flex flex-wrap gap-1.5")} style={at(2)}>
            {summary.gpa ? (
              <li className={chip}>
                {ChangeIcon ? <ChangeIcon className="h-3.5 w-3.5 text-[#64c9a7]" aria-hidden /> : null}
                {summary.gpa.change}
              </li>
            ) : null}
            {summary.arrears ? (
              <li className={chip}>
                <Check className="h-3.5 w-3.5 text-[#64c9a7]" aria-hidden />
                {summary.arrears}
              </li>
            ) : null}
          </ul>
        ) : null}

        <div className="mt-3 space-y-2">
          {rows.map((row, r) => (
            <div key={row.map((t) => t.id).join("-")} className="grid grid-cols-2 gap-2">
              {row.map((t, i) => (
                <div
                  key={t.id}
                  className={cn(
                    styles.tile,
                    "flex min-w-0 items-center justify-between gap-2 rounded-xl px-3 py-2.5",
                    TILE_CLASSES[t.id],
                    row.length === 1 && "col-span-2",
                  )}
                  style={at(r * 2 + i)}
                >
                  <div className="min-w-0">
                    <p className="text-micro font-semibold opacity-75">{t.label}</p>
                    <p
                      className={cn(
                        "font-display font-semibold leading-[1.1] tracking-tight",
                        t.id === "best" ? "line-clamp-2 text-subheading" : "text-[1.625rem] tabular-nums",
                      )}
                    >
                      {t.value}
                    </p>
                    {t.sub ? <p className="truncate text-micro font-medium opacity-75">{t.sub}</p> : null}
                  </div>
                  {t.grade ? (
                    <span className="shrink-0 rounded-lg bg-[#0f2421] px-2.5 py-1.5 font-display text-heading font-semibold text-[#e09f1f]">
                      {t.grade}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>

        {summary.note ? <p className="mt-2.5 text-micro text-[#64c9a7]">{summary.note}.</p> : null}
      </section>

      <div className="pt-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onShare}
            disabled={busy !== null}
            aria-busy={busy === "share" || undefined}
            className={cn(
              "inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#f3f6f4] px-4 text-body font-semibold text-[#134841] transition-[transform,opacity] focusable active:scale-[0.98] disabled:opacity-70",
              theme.focus,
            )}
          >
            <Share2 className="h-4 w-4" aria-hidden />
            Share
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={busy !== null}
            aria-busy={busy === "download" || undefined}
            className={cn(
              "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-body font-semibold border border-[#f3f6f4]/40 transition-[transform,background-color] hover:bg-[#f3f6f4]/10 focusable active:scale-[0.98] disabled:opacity-70",
              theme.focus,
            )}
          >
            <Download className="h-4 w-4" aria-hidden />
            Download
          </button>
          <button
            type="button"
            onClick={onRestart}
            aria-label="Watch again"
            title="Watch again"
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[#f3f6f4]/40 transition-colors hover:bg-[#f3f6f4]/10 focusable",
              theme.focus,
            )}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p role="status" className="mt-1.5 min-h-4 text-micro text-[#f3f6f4]/85">
          {status}
        </p>
      </div>
    </div>
  );
}
