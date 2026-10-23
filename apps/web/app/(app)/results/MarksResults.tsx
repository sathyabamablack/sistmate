import type { ExamResult, SemesterResult } from "@usp/core";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { Stat } from "@/components/ui/Stat";

const mark = (n: number | null | undefined) => (n == null ? "—" : String(n));

function ResultStatus({ passed }: { passed: boolean | undefined }) {
  if (passed === undefined) return <span className="text-small text-muted-foreground">—</span>;
  return passed ? (
    <Badge variant="success">Pass</Badge>
  ) : (
    <Badge variant="danger">Fail</Badge>
  );
}

/** Cleared / arrears counts across everything the ERP has published. */
export function MarksSummary({
  semesters,
  arrears,
}: {
  semesters: SemesterResult[];
  arrears: number | undefined;
}) {
  const papers: ExamResult[] = semesters.flatMap((s) => s.results);
  const judged = papers.filter((r) => r.passed !== undefined);
  const cleared = judged.filter((r) => r.passed).length;
  const failed = judged.filter((r) => !r.passed);

  const figures: { label: string; value: string; hint: string }[] = [
    {
      label: "Papers cleared",
      value: judged.length > 0 ? `${cleared} of ${judged.length}` : String(papers.length),
      hint:
        semesters.length === 1
          ? `Semester ${semesters[0]!.semester}`
          : `Across ${semesters.length} semesters`,
    },
  ];
  if (arrears != null) {
    figures.push({
      label: "Arrears",
      value: String(arrears),
      hint: arrears === 0 ? "None to clear" : "Papers still to clear",
    });
  } else if (failed.length > 0) {
    figures.push({
      label: "Failed papers",
      value: String(failed.length),
      hint: failed.map((r) => r.code).join(", "),
    });
  }
  figures.push({
    label: semesters.length === 1 ? "Semester" : "Semesters",
    value: semesters.map((s) => s.semester).join(", "),
    hint: `${papers.length} ${papers.length === 1 ? "paper" : "papers"} in total`,
  });

  return (
    <Panel padded={false}>
      <dl className="grid grid-cols-3 divide-x divide-border">
        {figures.map((f) => (
          <Stat
            key={f.label}
            label={f.label}
            value={f.value}
            hint={f.hint}
            className="px-3 py-3.5 sm:px-5 sm:py-4"
          />
        ))}
      </dl>
    </Panel>
  );
}

/** One semester's marks: a table from sm up, stacked rows on phones. */
export function MarksTable({ semester }: { semester: SemesterResult }) {
  const rows = semester.results;
  if (rows.length === 0) {
    return <p className="text-body text-muted-foreground">Nothing published for this semester.</p>;
  }
  return (
    <div>
      <table className="hidden w-full text-body sm:table">
        <caption className="sr-only">Semester {semester.semester} marks</caption>
        <thead>
          <tr className="border-b border-border text-left text-small text-muted-foreground">
            <th scope="col" className="py-2.5 pr-4 font-medium">Subject</th>
            <th scope="col" className="w-24 py-3 pr-4 text-right font-medium">Internal</th>
            <th scope="col" className="w-24 py-3 pr-4 text-right font-medium">External</th>
            <th scope="col" className="w-24 py-3 pr-4 text-right font-medium">Total</th>
            <th scope="col" className="w-24 py-2.5 font-medium">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.code}>
              <td className="py-3 pr-4">
                <p className="font-medium text-foreground">{r.title}</p>
                <p className="text-small tabular-nums text-muted-foreground">{r.code}</p>
              </td>
              <td className="py-3 pr-4 text-right tabular-nums text-foreground">{mark(r.internal)}</td>
              <td className="py-3 pr-4 text-right tabular-nums text-foreground">{mark(r.external)}</td>
              <td className="py-3 pr-4 text-right font-semibold tabular-nums text-foreground">{mark(r.total)}</td>
              <td className="py-3">
                <ResultStatus passed={r.passed} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-border sm:hidden">
        {rows.map((r) => (
          <li key={r.code} className="py-3.5 first:pt-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-body font-medium text-foreground">{r.title}</p>
                <p className="text-small tabular-nums text-muted-foreground">{r.code}</p>
              </div>
              <ResultStatus passed={r.passed} />
            </div>
            <dl className="mt-2.5 grid grid-cols-3 gap-2 text-small">
              {(
                [
                  ["Internal", r.internal],
                  ["External", r.external],
                  ["Total", r.total],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-body font-medium tabular-nums text-foreground">{mark(value)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
