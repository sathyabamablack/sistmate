import Link from "@/components/ui/IntentLink";
import { CheckCircle2, Info } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Section, sectionLinkClass } from "@/components/ui/Section";
import type { Arrear } from "@/lib/arrears";

const marks = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** What the student has to score in the re-exam, in one plain sentence. */
function needLine(a: Arrear): string {
  if (a.audit) {
    return `An audit course: it is cleared through internal assessment and does not count in your CGPA.`;
  }
  if (a.externalNeeded == null) {
    return `Needs ${marks(a.passTotal)} of ${a.maxTotal} in total and ${a.externalMin} of ${a.externalMax} in the exam. Internal marks are not published for this paper.`;
  }
  if (a.outOfReach) {
    return `Needs ${marks(a.externalNeeded)} exam marks, but the exam carries ${a.externalMax}.`;
  }
  if (a.externalNeeded === a.externalMin) {
    return `Needs ${a.externalMin} of ${a.externalMax} in the exam, the pass minimum. Internal marks of ${marks(a.internal ?? 0)} cover the rest.`;
  }
  return `Needs ${marks(a.externalNeeded)} of ${a.externalMax} in the exam, on top of ${marks(a.internal ?? 0)} internal.`;
}

/** Papers still to clear, with the marks needed to pass. Rendered only when there are arrears. */
export function ArrearsSection({ arrears }: { arrears: Arrear[] }) {
  if (arrears.length === 0) return null;
  return (
    <Section
      id="arrears"
      title="Papers to clear"
      action={
        <Link href="/calculator" className={sectionLinkClass}>
          Plan these
        </Link>
      }
    >
      <ul className="divide-y divide-border">
        {arrears.map((a) => (
          <li key={a.code} className="py-3 first:pt-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-body font-medium text-foreground">{a.title}</p>
              <Badge variant={a.outOfReach ? "warning" : "danger"}>
                {a.outOfReach ? "Out of reach" : "To clear"}
              </Badge>
            </div>
            <p className="text-body tabular-nums text-muted-foreground">
              {a.code}, failed in semester {a.semester}
              {a.failedAttempts > 1 ? `, ${a.failedAttempts} attempts` : ""}
              {a.lastTotal != null ? `, scored ${marks(a.lastTotal)} of ${a.maxTotal}` : ""}
            </p>
            <p className="mt-1 text-body text-foreground">{needLine(a)}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Calm one-liner for the Summary column when nothing is left to clear. */
export function ArrearsNote({
  count,
  profileArrears,
}: {
  count: number;
  /** Standing arrears the ERP itself reports, when it does. */
  profileArrears?: number;
}) {
  if (count > 0) {
    return (
      <p className="mt-3 text-small text-muted-foreground">
        {count} {count === 1 ? "paper" : "papers"} to clear, listed above.
      </p>
    );
  }
  if ((profileArrears ?? 0) > 0) {
    return (
      <p className="mt-3 flex gap-2 text-small text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          Your ERP reports {profileArrears} standing {profileArrears === 1 ? "arrear" : "arrears"}, but
          the papers are not in these results.
        </span>
      </p>
    );
  }
  return (
    <p className="mt-3 flex items-center gap-2 text-small text-muted-foreground">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
      <span>No arrears</span>
    </p>
  );
}
