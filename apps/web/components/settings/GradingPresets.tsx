"use client";

import * as React from "react";
import Link from "@/components/ui/IntentLink";
import { useRouter } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { sortScale } from "@usp/core";
import { Button } from "@/components/ui/Button";
import {
  GRADING_COOKIE,
  OFFICIAL_PRESET,
  serializeGradingSettings,
  type GradingSettings,
} from "@/lib/grading-settings";
import { cn } from "@/lib/utils";

const YEAR_SECONDS = 60 * 60 * 24 * 365;

function writeCookie(settings: GradingSettings) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${GRADING_COOKIE}=${encodeURIComponent(
    serializeGradingSettings(settings),
  )}; path=/; max-age=${YEAR_SECONDS}; SameSite=Lax${secure}`;
}

/** "90–100", "80–89" ... "Below 50", from the official bands. */
function bandRows() {
  const sorted = sortScale(OFFICIAL_PRESET.scale);
  return sorted.map((b, i) => {
    const upper = i === 0 ? 100 : sorted[i - 1]!.min - 1;
    const range = b.min === 0 ? `Below ${sorted[i - 1]?.min ?? 50}` : `${b.min}–${upper}`;
    return { range, grade: b.grade, points: b.points };
  });
}

export interface CgpaSummary {
  value: number;
  semesters: number;
}

/**
 * The grading scheme: the official Sathyabama rules, which are the only scheme. Shows the
 * bands and rules, the resulting CGPA, and lets the student clear their credit corrections
 * (stored in the `usp-grading` cookie). Custom bands live in the CGPA planner.
 */
export function GradingPresets({
  settings,
  cgpa,
  published,
}: {
  settings: GradingSettings;
  cgpa: CgpaSummary | null;
  /** The portal already publishes grades, so the official scheme is not applied to them. */
  published: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const corrections = Object.keys(settings.credits).length;

  function save(next: GradingSettings) {
    writeCookie(next);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-5">
      <div className="max-w-prose space-y-2 text-body text-muted-foreground">
        {published ? null : (
          <p>Your ERP publishes marks only, so grades below are estimated from them. Your official grade sheet is final.</p>
        )}
      </div>

      {cgpa ? (
        <p
          className={cn("text-body text-foreground transition-opacity", pending && "opacity-60")}
          aria-live="polite"
          aria-busy={pending}
        >
          Your CGPA:{" "}
          <span className="font-display font-semibold tabular-nums">{cgpa.value.toFixed(2)}</span>
          <span className="text-muted-foreground">
            {" "}
            across {cgpa.semesters} {cgpa.semesters === 1 ? "semester" : "semesters"}
            {published ? "" : " (estimated)"}
          </span>
        </p>
      ) : null}

      <section
        aria-labelledby="grading-scheme-title"
        className="max-w-2xl border-t border-border pt-5"
      >
        <div className="flex items-start gap-2.5">
          <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <h3 id="grading-scheme-title" className="text-subheading font-semibold text-foreground">
              {OFFICIAL_PRESET.name}
            </h3>
            <p className="mt-0.5 text-body text-muted-foreground">Official scale.</p>
          </div>
        </div>

        <table className="mt-4 w-full max-w-sm text-small tabular-nums">
          <caption className="sr-only">Grade bands: marks as a percentage, grade, grade points</caption>
          <thead>
            <tr className="border-b border-border text-left text-micro text-muted-foreground">
              <th scope="col" className="py-1.5 pr-3 font-medium">Marks (%)</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Grade</th>
              <th scope="col" className="py-1.5 text-right font-medium">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {bandRows().map((row) => (
              <tr key={row.grade}>
                <td className="py-1.5 pr-3 text-muted-foreground">{row.range}</td>
                <th scope="row" className="py-1.5 pr-3 text-left font-semibold text-foreground">
                  {row.grade}
                </th>
                <td className="py-1.5 text-right text-foreground">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-4 max-w-prose text-body text-muted-foreground">
          Pass: 50% of the total and 30% of the end-semester exam. GPA counts passed papers only,
          weighted by credits.
        </p>
      </section>

      <p className="max-w-prose text-small text-muted-foreground">
        Want to try different bands? The{" "}
        <Link
          href="/calculator"
          className="focusable rounded-sm font-semibold text-primary underline underline-offset-4"
        >
          CGPA planner
        </Link>{" "}
        lets you edit them for planning without changing your results.
      </p>

      {corrections > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <p className="text-small text-muted-foreground">
            You have corrected credits for {corrections} {corrections === 1 ? "subject" : "subjects"}.
            Corrections replace the official credits for those subjects.
          </p>
          <Button
            variant="outline"
            size="sm"
            loading={pending}
            onClick={() => save({ preset: settings.preset, credits: {} })}
          >
            Reset credit corrections
          </Button>
        </div>
      ) : null}
    </div>
  );
}
