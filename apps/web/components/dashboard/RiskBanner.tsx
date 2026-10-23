import Link from "@/components/ui/IntentLink";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { sectionLinkClass } from "@/components/ui/Section";
import type { AttendanceRisk, Countdown } from "@/lib/risk";
import { cn } from "@/lib/utils";

/**
 * One line naming the worst subject, for anything under or near the attendance
 * threshold. It used to list every at-risk subject with its advice, which the
 * Attendance table directly below then repeated. Deliberately not a heading:
 * this is an alert, not a section of its own.
 */
export function RiskBanner({
  risks,
  threshold,
}: {
  risks: AttendanceRisk[];
  threshold: number;
}) {
  if (risks.length === 0) return null;
  const below = risks.filter((r) => r.level === "below").length;
  const worst = risks[0]!;
  const others = risks.length - 1;
  const summary =
    below > 0
      ? `${below} ${below === 1 ? "subject is" : "subjects are"} below ${threshold}%`
      : `${risks.length} ${risks.length === 1 ? "subject is" : "subjects are"} close to ${threshold}%`;
  return (
    <Panel
      tone={below > 0 ? "danger" : "warning"}
      role="group"
      aria-label="Attendance alerts"
      className="flex flex-wrap items-center gap-x-3 gap-y-2"
    >
      <AlertTriangle
        className={cn("h-4 w-4 shrink-0", below > 0 ? "text-danger" : "text-warning")}
        aria-hidden
      />
      <p className="min-w-0 flex-1 text-body">
        <span className="font-semibold text-foreground">{summary}.</span>{" "}
        <span className="text-muted-foreground">
          {worst.action}
          {others > 0 ? ` (+${others} more)` : ""}
        </span>
      </p>
      <Link href="/attendance" className={cn(sectionLinkClass, "shrink-0")}>
        Details
      </Link>
    </Panel>
  );
}

/** Chip counting down to the next exam. Assignment deadlines are left out on purpose. */
export function CountdownChips({ exam }: { exam: Countdown | null }) {
  if (!exam) return null;
  const soon = exam.days <= 2;
  return (
    <ul aria-label="Coming up" className="flex flex-wrap gap-2">
      <li className="inline-flex min-w-0 max-w-full items-start gap-2 rounded-xl bg-muted px-3 py-2 text-small text-foreground">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0">
          <span className="text-muted-foreground">Next exam: </span>
          {exam.title}{" "}
          <span className={cn("whitespace-nowrap tabular-nums", soon && "font-semibold")}>{exam.when}</span>
        </span>
      </li>
    </ul>
  );
}
