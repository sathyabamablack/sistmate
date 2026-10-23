import type { AttendanceSubject } from "@usp/core";
import { DEFAULT_THRESHOLD, attendanceAdvice, formatPct, type AttendanceAdvice } from "@/lib/attendance";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { cn } from "@/lib/utils";

const barTone = (t: AttendanceAdvice["tone"]) => (t === "none" ? "primary" : t);

/** Status = icon + colour + words (Badge), so it never depends on colour alone. */
function Status({ advice }: { advice: AttendanceAdvice }) {
  return <Badge variant={advice.tone === "none" ? "muted" : advice.tone}>{advice.short}</Badge>;
}

function Bar({
  subject,
  advice,
  threshold,
}: {
  subject: AttendanceSubject;
  advice: AttendanceAdvice;
  threshold: number;
}) {
  return (
    <ProgressBar
      value={subject.totalClasses > 0 ? subject.percentage : 0}
      tone={barTone(advice.tone)}
      markAt={threshold}
      aria-label={`${subject.title} attendance`}
    />
  );
}

const pct = (s: AttendanceSubject) => (s.totalClasses > 0 ? formatPct(s.percentage) : "—");
const hoursLabel = (s: AttendanceSubject) =>
  s.totalClasses > 0 ? `${s.attended} of ${s.totalClasses} hours` : "No hours recorded yet";

/**
 * Per-subject attendance. `compact` (dashboard) is a list with a bar on every row;
 * `full` adds a proper table with an hours column from md up. Below md both
 * collapse to the same stacked rows. Both layouts stay in the DOM.
 */
export function AttendanceTable({
  subjects,
  variant = "full",
  threshold = DEFAULT_THRESHOLD,
}: {
  subjects: AttendanceSubject[];
  variant?: "full" | "compact";
  /** Minimum attendance percentage (the student's setting). */
  threshold?: number;
}) {
  const rows = subjects.map((s) => ({
    s,
    advice: attendanceAdvice(s.attended, s.totalClasses, threshold),
  }));

  return (
    <>
      {variant === "full" ? (
        <table className="hidden w-full text-body md:table">
          <caption className="sr-only">Attendance by subject</caption>
          <thead>
            <tr className="border-b border-border text-left text-small text-muted-foreground">
              <th scope="col" className="py-2.5 pr-4 font-medium">Subject</th>
              <th scope="col" className="py-2.5 pr-4 text-right font-medium">Hours attended</th>
              <th scope="col" className="w-72 py-2.5 pr-4 font-medium">Attendance</th>
              <th scope="col" className="py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ s, advice }) => (
              <tr key={s.code}>
                <td className="py-row pr-4">
                  <p className="font-medium text-foreground">{s.title}</p>
                  <p className="text-micro tabular-nums text-muted-foreground">{s.code}</p>
                </td>
                <td className="py-row pr-4 text-right tabular-nums text-foreground">
                  {s.totalClasses > 0 ? (
                    <>
                      {s.attended}
                      <span className="text-muted-foreground"> / {s.totalClasses}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-row pr-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <Bar subject={s} advice={advice} threshold={threshold} />
                    </div>
                    <span className="w-14 text-right font-display font-semibold tabular-nums text-foreground">
                      {pct(s)}
                    </span>
                  </div>
                </td>
                <td className="py-row">
                  <Status advice={advice} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <ul className={cn("divide-y divide-border", variant === "full" && "md:hidden")}>
        {rows.map(({ s, advice }) => (
          <li key={s.code} className="py-row first:pt-0 last:pb-0">
            {/* stacked: phones everywhere, and the dashboard list below sm */}
            <div className={cn(variant === "compact" && "sm:hidden")}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 text-body font-medium text-foreground">{s.title}</p>
                <p className="shrink-0 font-display text-subheading font-semibold tabular-nums text-foreground">
                  {pct(s)}
                </p>
              </div>
              <div className="my-2.5">
                <Bar subject={s} advice={advice} threshold={threshold} />
              </div>
              <div className="flex items-center justify-between gap-3 text-small text-muted-foreground">
                <span className="tabular-nums">{hoursLabel(s)}</span>
                <Status advice={advice} />
              </div>
            </div>
            {variant === "compact" ? (
              <div className="hidden items-center gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_8rem_3.5rem_8.5rem]">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-foreground">{s.title}</p>
                  <p className="truncate text-small tabular-nums text-muted-foreground">
                    {s.code}, {hoursLabel(s)}
                  </p>
                </div>
                <Bar subject={s} advice={advice} threshold={threshold} />
                <p className="text-right font-display font-semibold tabular-nums text-foreground">
                  {pct(s)}
                </p>
                <div className="flex justify-end">
                  <Status advice={advice} />
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
