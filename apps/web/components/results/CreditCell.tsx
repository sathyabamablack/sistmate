"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CircleDashed, Pencil } from "lucide-react";
import type { CreditSource } from "@usp/core";
import { fieldClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  CREDIT_STEP,
  MAX_CREDITS,
  MIN_CREDITS,
  creditOverrideCookie,
  normalizeCredits,
} from "@/lib/grading-credits";

/** Where the credits came from, as an icon plus words (never colour alone). */
const SOURCE: Record<CreditSource, { label: string; Icon: typeof BadgeCheck }> = {
  official: { label: "official", Icon: BadgeCheck },
  estimated: { label: "estimated", Icon: CircleDashed },
  custom: { label: "edited", Icon: Pencil },
};

/**
 * Editable credits for one estimated paper. Committing (blur or Enter) merges the
 * correction into the `usp-grading` cookie and refreshes the page, so the semester
 * GPA and CGPA recompute on the server. A value equal to the official (or estimated)
 * default clears the correction. Render it with `key={`${code}-${credits}`}` so it
 * restarts from the server value after a refresh.
 */
export function CreditCell({
  code,
  title,
  credits,
  templateCredits,
  edited,
  source,
  className,
}: {
  code: string;
  title: string;
  /** Credits in use right now. */
  credits: number;
  /** Credits from the official curriculum (or the estimate) for this paper. */
  templateCredits: number;
  /** True when the student has corrected this paper's credits. */
  edited: boolean;
  /** Where the credits in use came from; shown as a small marker. */
  source?: CreditSource;
  className?: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState(String(credits));
  const [, startTransition] = React.useTransition();
  const lastSaved = React.useRef(credits);
  const hintId = React.useId();
  const kind: CreditSource | undefined = edited ? "custom" : source;
  const marker = kind ? SOURCE[kind] : null;

  function commit() {
    const next = normalizeCredits(draft);
    if (next === null) {
      setDraft(String(credits));
      return;
    }
    setDraft(String(next));
    if (next === lastSaved.current) return;
    lastSaved.current = next;
    document.cookie = creditOverrideCookie(document.cookie, code, next, templateCredits);
    startTransition(() => router.refresh());
  }

  return (
    <div className={cn("flex flex-col items-end", className)}>
      <input
        type="number"
        inputMode="decimal"
        min={MIN_CREDITS}
        max={MAX_CREDITS}
        step={CREDIT_STEP}
        value={draft}
        aria-label={`Credits for ${title}`}
        aria-describedby={marker ? hintId : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className={cn(fieldClass, "w-20 px-2 text-right tabular-nums md:w-[4.5rem]")}
      />
      {marker ? (
        <span id={hintId} className="mt-0.5 inline-flex items-center gap-1 text-micro text-muted-foreground">
          <marker.Icon className="h-3 w-3 shrink-0" aria-hidden />
          {marker.label}
          {kind === "custom" ? (
            <span className="sr-only">, default is {templateCredits}</span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
