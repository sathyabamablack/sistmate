import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatPct } from "@/lib/attendance";
import { cn } from "@/lib/utils";
import { plural, type OdProjection as Projection, type OdProjectionRow } from "@/lib/od";

/** Now as a solid fill, the hours the ERP still owes as a lighter extension, and the threshold tick. */
function GainBar({ row, threshold }: { row: OdProjectionRow; threshold: number }) {
  const now = Math.max(0, Math.min(100, row.now));
  const after = Math.max(now, Math.min(100, row.after));
  const tone = row.verdict === "still-below" ? "bg-danger" : row.now < threshold ? "bg-warning" : "bg-success";
  return (
    <div className="relative h-2 w-full" aria-hidden>
      <div className="absolute inset-0 overflow-hidden rounded-full bg-muted">
        <div className={cn("absolute inset-y-0 left-0 rounded-full", tone)} style={{ width: `${now}%` }} />
        <div
          className="absolute inset-y-0 rounded-r-full bg-success/45"
          style={{ left: `${now}%`, width: `${after - now}%` }}
        />
      </div>
      <div
        className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
        style={{ left: `${Math.max(0, Math.min(100, threshold))}%` }}
      />
    </div>
  );
}

/** Only a subject that crosses the threshold, or stays under it, gets words; the bar says the rest. */
function Verdict({ row, threshold }: { row: OdProjectionRow; threshold: number }) {
  if (row.verdict === "back-above") return <Badge variant="success">Back to {threshold}% or more</Badge>;
  if (row.verdict === "still-below") return <Badge variant="danger">Still below {threshold}%</Badge>;
  return null;
}

/**
 * "Attendance after your ODs": each affected subject now and once the ERP updates the
 * hours it still shows absent (attended goes up, the total stays).
 */
export function OdProjection({ projection, threshold }: { projection: Projection; threshold: number }) {
  const { rows, overall, uncounted, unmatched } = projection;
  const hours = rows.reduce((n, r) => n + r.hours, 0);
  // Laid out by its own width: one line per subject in the main column, stacked in the side column.
  return (
    <div className="@container space-y-3">
      {overall ? (
        <p className="text-body text-muted-foreground">
          Overall{" "}
          <span className="font-display font-semibold tabular-nums text-foreground">{formatPct(overall.now)}</span>
          <ArrowRight className="mx-1 inline h-4 w-4 align-[-2px]" aria-label="to" />
          <span className="font-display font-semibold tabular-nums text-foreground">{formatPct(overall.after)}</span>{" "}
          once the ERP updates {plural(hours, "hour")}.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="divide-y divide-border border-y border-border" aria-label="Subjects after your ODs">
          {rows.map((row) => (
            <li
              key={row.code}
              data-testid={`od-projection-${row.code}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 @2xl:grid-cols-[minmax(0,1fr)_minmax(8rem,12rem)_8.5rem_10.5rem]"
            >
              <div className="min-w-0">
                <p className="text-body font-medium text-foreground">{row.title}</p>
                <p className="text-small tabular-nums text-muted-foreground">
                  {row.code} · {plural(row.hours, "hour")} to update
                </p>
              </div>
              <p
                className="text-right text-small tabular-nums text-muted-foreground @2xl:order-3 @2xl:text-left"
                aria-label={`${formatPct(row.now)} now, ${formatPct(row.after)} after`}
              >
                <span>{formatPct(row.now)}</span>
                <ArrowRight className="mx-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                <span className="font-display text-subheading font-semibold text-foreground">{formatPct(row.after)}</span>
              </p>
              <div className="col-span-2 @2xl:order-2 @2xl:col-span-1">
                <GainBar row={row} threshold={threshold} />
              </div>
              {row.verdict !== "above" ? (
                <div className="col-span-2 @2xl:order-4 @2xl:col-span-1 @2xl:justify-self-end">
                  <Verdict row={row} threshold={threshold} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {uncounted > 0 ? (
        <p className="text-small text-muted-foreground">
          {plural(uncounted, "more hour")} {uncounted === 1 ? "is" : "are"} left out: those entries are not counted as attended. Turn it on in an entry if your department counts it.
        </p>
      ) : null}
      {unmatched > 0 ? (
        <p className="text-small text-muted-foreground">
          {plural(unmatched, "hour")} could not be matched to a subject in the ERP, so {unmatched === 1 ? "it is" : "they are"} left out.
        </p>
      ) : null}
    </div>
  );
}
