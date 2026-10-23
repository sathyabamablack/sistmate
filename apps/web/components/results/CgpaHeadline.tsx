import type { ReactNode } from "react";
import Link from "@/components/ui/IntentLink";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const fmt = (n: number | null) => (n == null ? "—" : n.toFixed(2));

/**
 * The answer to "where's my CGPA?", first thing on the page at every width.
 * It used to sit in a side column that a phone only reached after scrolling
 * every semester's course list.
 */
export function CgpaHeadline({
  cgpa,
  credits,
  latestGpa,
  latestSemester,
  estimated,
  footer,
  className,
}: {
  cgpa: number | null;
  credits: number;
  latestGpa: number | null;
  latestSemester?: number;
  /** Worked out from marks rather than published as grades. */
  estimated?: boolean;
  /** Optional quiet line under the links. */
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label="Your standing"
      className={cn("border-b border-border pb-6", className)}
    >
      <dl className="flex flex-wrap items-end gap-x-10 gap-y-6">
        <div className="min-w-0">
          <dt className="text-body text-muted-foreground">CGPA</dt>
          <dd className="font-display text-[3.25rem] font-semibold leading-none tracking-tight tabular-nums text-foreground sm:text-[4rem]">
            {fmt(cgpa)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-body text-muted-foreground">
            {latestSemester != null ? `Semester ${latestSemester} GPA` : "Latest GPA"}
          </dt>
          <dd className="font-display text-title font-semibold tabular-nums text-foreground">
            {fmt(latestGpa)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-body text-muted-foreground">Credits earned</dt>
          <dd className="font-display text-title font-semibold tabular-nums text-foreground">
            {credits}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link
          href="/calculator"
          className="focusable inline-flex min-h-11 items-center gap-1.5 rounded-md text-body font-semibold text-primary underline-offset-4 hover:underline lg:min-h-0"
        >
          Plan your next CGPA
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        {estimated ? (
          <p className="text-body text-muted-foreground">
            Estimated from your marks.{" "}
            <Link
              href="/settings#grades"
              className="focusable rounded-sm font-medium text-foreground underline underline-offset-4"
            >
              Grade scheme
            </Link>
          </p>
        ) : null}
      </div>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </section>
  );
}
