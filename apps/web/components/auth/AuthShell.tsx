import type { CSSProperties, ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

/** Sample subjects for the brand side: two above the 80% line, one below. */
const SAMPLE_BARS = [
  { pct: 92, above: true },
  { pct: 86, above: true },
  { pct: 63, above: false },
] as const;

/** Decorative: three attendance bars and the 80% line that the whole product is built around. */
function ThresholdMotif() {
  return (
    <div aria-hidden className="relative mt-12 max-w-md pt-8">
      <span
        className="absolute top-0 -translate-x-1/2 rounded-full bg-foreground px-2.5 py-0.5 text-micro font-semibold text-background"
        style={{ left: "80%" }}
      >
        80%
      </span>
      <div className="space-y-4">
        {SAMPLE_BARS.map((b, i) => (
          <div
            key={b.pct}
            className="enter h-3 overflow-hidden rounded-full bg-surface/70"
            style={{ "--i": i + 1 } as CSSProperties}
          >
            <div
              className={cn("h-full rounded-full", b.above ? "bg-primary" : "bg-danger")}
              style={{ width: `${b.pct}%` }}
            />
          </div>
        ))}
      </div>
      <div
        className="absolute -bottom-2 top-6 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
        style={{ left: "80%" }}
      />
    </div>
  );
}

/**
 * Frame for the signed-out flow (sign in, connect). Desktop: brand side with
 * the promise and the 80% motif next to the form. Phone: one column with a
 * slim brand header. Children render inside <main> and should hold the h1.
 */
export function AuthShell({ children, footnote }: { children: ReactNode; footnote?: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[5fr_6fr]">
      <aside className="hidden flex-col justify-between bg-accent p-12 text-accent-foreground lg:sticky lg:top-0 lg:flex lg:h-dvh xl:p-16">
        <div className="flex items-center gap-3">
          <Logo className="h-10 w-10" />
          <span className="font-display text-heading font-semibold">Student Portal</span>
        </div>

        <div>
          <p className="max-w-md font-display text-display font-semibold">
            Know where you stand before you skip.
          </p>
          <ThresholdMotif />
        </div>

        <p className="max-w-sm text-body text-accent-foreground/80">
          Attendance, marks, timetable and fees from your college ERP and LMS, in one place.
        </p>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center gap-2.5 px-4 py-4 sm:px-8 lg:hidden">
          <Logo className="h-8 w-8" />
          <span className="font-display text-subheading font-semibold">Student Portal</span>
        </header>

        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-8 sm:py-12 lg:max-w-md lg:px-0">
          {children}
        </main>

        {footnote ? (
          <footer className="mx-auto w-full max-w-sm px-4 pb-8 text-small text-muted-foreground lg:max-w-md lg:px-0">
            {footnote}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
