import { Info } from "lucide-react";
import type { ExamResult, SemesterResult } from "@usp/core";
import { Badge } from "@/components/ui/Badge";
import { KeyValueList, Section } from "@/components/ui/Section";
import { ArrearsNote, ArrearsSection } from "@/components/results/ArrearsSection";
import { CreditCell } from "@/components/results/CreditCell";
import { GpaTrend } from "@/components/results/GpaTrend";
import { CgpaHeadline } from "@/components/results/CgpaHeadline";
import { HowCalculated } from "@/components/results/HowCalculated";
import { SupportNudge } from "@/components/support/SupportNudge";
import type { Arrear } from "@/lib/arrears";
import { officialCourse, type GradingSettings } from "@/lib/grading-presets";

const gpa = (n: number | null) => (n == null ? "—" : n.toFixed(2));
const DEFAULT_MAX = 100;

/** Grades that score nothing and stay out of GPA, with the words shown beside them. */
const NOT_COUNTED: Record<string, string> = {
  RA: "Reappear",
  AAA: "Absent",
  W: "Withdrawn",
  ABS: "Break of study",
};

const pct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;

/** True for a paper that was graded but is left out of GPA because it was not passed. */
function isExcluded(r: ExamResult): boolean {
  return !r.audit && r.grade !== undefined && r.counted === false;
}

/** CGPA, per-semester GPA and grades: published by a grade-based portal, or estimated from ERP marks. */
export function GradedResults({
  semesters,
  cgpa,
  settings,
  arrears,
  profileArrears,
}: {
  semesters: SemesterResult[];
  cgpa: number;
  /** The student's credit corrections; drives credit editing. */
  settings: GradingSettings;
  /** Failed papers not yet cleared, across every semester (see lib/arrears.ts). */
  arrears: Arrear[];
  /** Standing arrears the ERP itself reports, when it does. */
  profileArrears?: number;
}) {
  const withGpa = semesters.filter((s) => s.gpa != null);
  const totalCredits = semesters.reduce((s, r) => s + (r.credits ?? 0), 0);
  const best = withGpa.reduce<SemesterResult | null>(
    (b, s) => (!b || s.gpa! > b.gpa! ? s : b),
    null,
  );
  const latest = withGpa[withGpa.length - 1] ?? null;
  const showTrend = withGpa.length >= 2;

  const estimated = semesters.some((s) => s.estimated);
  const anyExcluded = semesters.some((s) => s.estimated && s.results.some(isExcluded));

  return (
    <div className="space-y-10">
      <CgpaHeadline
        cgpa={cgpa}
        credits={totalCredits}
        latestGpa={latest?.gpa ?? null}
        latestSemester={latest?.semester}
        estimated={estimated}
        footer={arrears.length === 0 ? <SupportNudge lead="Glad this helped? Free, and made by a student." /> : undefined}
      />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="space-y-10">
        <ArrearsSection arrears={arrears} />

        {anyExcluded ? (
          <p className="flex gap-2 text-body text-muted-foreground" role="note">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>Reappear and absent papers stay out of your GPA until you clear them.</span>
          </p>
        ) : null}

        {semesters
          .slice()
          .reverse()
          .map((sem) => {
            const editable = sem.estimated === true;
            const showMarks = sem.results.some((r) => r.total != null);
            const creditProps = (r: ExamResult) => ({
              code: r.code,
              title: r.title,
              credits: r.credits ?? 0,
              templateCredits: officialCourse(r.code, r.title).credits,
              edited: settings.credits[r.code] !== undefined,
              source: r.creditSource,
            });
            return (
              <Section
                key={sem.semester}
                id={`sem-${sem.semester}`}
                title={`Semester ${sem.semester}`}
                action={
                  <span className="tabular-nums text-muted-foreground">
                    {sem.credits != null ? `${sem.credits} credits, ` : ""}
                    {editable ? "estimated " : ""}GPA{" "}
                    <span className="font-display text-subheading font-semibold text-foreground">
                      {gpa(sem.gpa)}
                    </span>
                  </span>
                }
              >
                <table className="hidden w-full text-body sm:table">
                  <caption className="sr-only">
                    Semester {sem.semester} {editable ? "estimated grades" : "grades"}
                  </caption>
                  <thead>
                    <tr className="border-b border-border text-left text-small text-muted-foreground">
                      <th scope="col" className="w-28 py-2.5 pr-3 font-medium">Code</th>
                      <th scope="col" className="py-2.5 pr-3 font-medium">Course</th>
                      {showMarks ? (
                        <th scope="col" className="w-28 py-2.5 pr-3 text-right font-medium">Marks</th>
                      ) : null}
                      <th scope="col" className={editable ? "w-28 py-2.5 pr-3 text-right font-medium" : "w-20 py-2.5 pr-3 text-right font-medium"}>
                        Credits
                      </th>
                      <th scope="col" className={editable ? "w-36 py-2.5 text-right font-medium" : "w-24 py-2.5 text-right font-medium"}>
                        Grade
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sem.results.map((r) => (
                      <tr key={r.code}>
                        <td className="py-3 pr-3 align-top text-small tabular-nums text-muted-foreground">{r.code}</td>
                        <td className="py-3 pr-3 align-top text-foreground">{r.title}</td>
                        {showMarks ? (
                          <td className="py-3 pr-3 text-right align-top tabular-nums text-foreground">
                            <Marks result={r} />
                          </td>
                        ) : null}
                        <td className="py-2 pr-3 text-right align-top tabular-nums text-muted-foreground">
                          {editable && r.credits != null ? (
                            <CreditCell
                              key={`${r.code}-${r.credits}`}
                              {...creditProps(r)}
                              className="ml-auto"
                            />
                          ) : (
                            (r.credits ?? "—")
                          )}
                        </td>
                        <td className="py-3 text-right align-top">
                          <GradeCell result={r} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <ul className="divide-y divide-border sm:hidden">
                  {sem.results.map((r) => (
                    <li key={r.code} className="py-3 first:pt-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-body text-foreground">{r.title}</p>
                          <p className="text-small tabular-nums text-muted-foreground">
                            {r.code}
                            {r.total != null
                              ? `, ${r.total} / ${r.maxTotal ?? DEFAULT_MAX}${r.percent != null ? ` (${pct(r.percent)})` : ""}`
                              : ""}
                            {!editable && r.credits != null ? `, ${r.credits} credits` : ""}
                          </p>
                        </div>
                        <GradeCell result={r} />
                      </div>
                      {editable && r.credits != null ? (
                        <div className="mt-2 flex items-start justify-between gap-3">
                          <span className="pt-2.5 text-small text-muted-foreground" aria-hidden>
                            Credits
                          </span>
                          <CreditCell key={`${r.code}-${r.credits}`} {...creditProps(r)} />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Section>
            );
          })}
      </div>

      <div className="space-y-10">
        {showTrend ? (
          <Section id="trend" title="GPA by semester">
            <GpaTrend semesters={semesters} />
            <KeyValueList
              className="mt-4"
              items={[
                {
                  label: "Best semester",
                  value: best ? gpa(best.gpa) : "—",
                  hint: best ? `Semester ${best.semester}` : undefined,
                },
              ]}
            />
          </Section>
        ) : null}
        <div>
          <ArrearsNote count={arrears.length} profileArrears={profileArrears} />
          {estimated ? <HowCalculated /> : null}
        </div>
      </div>
      </div>
    </div>
  );
}

/** "38 / 50" with the percentage beneath, or a dash when the ERP published no total. */
function Marks({ result }: { result: ExamResult }) {
  if (result.total == null) return <span className="text-small text-muted-foreground">—</span>;
  return (
    <>
      <span className="whitespace-nowrap">
        {result.total}
        <span className="text-muted-foreground"> / {result.maxTotal ?? DEFAULT_MAX}</span>
      </span>
      {result.percent != null ? (
        <span className="block text-micro text-muted-foreground">{pct(result.percent)}</span>
      ) : null}
    </>
  );
}

/** The grade, with words beside it when the paper is not in the GPA. */
function GradeCell({ result }: { result: ExamResult }) {
  const grade = result.grade?.toUpperCase();
  if (result.audit) {
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        <Badge variant={grade === "FAIL" ? "danger" : "muted"}>{grade === "FAIL" ? "Fail" : "Pass"}</Badge>
        <span className="text-micro text-muted-foreground">Audit course, not in GPA</span>
      </span>
    );
  }
  const excluded = grade ? NOT_COUNTED[grade] : undefined;
  if (excluded && (result.counted === false || result.passed === false)) {
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
          <Badge variant="outline" className="text-small">
            {result.grade}
          </Badge>
          <Badge variant="danger">{excluded}</Badge>
        </span>
        <span className="text-micro text-muted-foreground">Not in GPA</span>
      </span>
    );
  }
  const failed = result.passed === false;
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      <Grade grade={result.grade} point={result.gradePoint} />
      {failed ? <Badge variant="danger">Failed</Badge> : null}
    </span>
  );
}

function Grade({ grade, point }: { grade: string | undefined; point: number | undefined }) {
  if (!grade) return <span className="text-small text-muted-foreground">—</span>;
  const variant =
    point == null ? "default" : point >= 9 ? "success" : point >= 7 ? "primary" : point >= 5 ? "warning" : "danger";
  return (
    <Badge variant={variant} className="text-small">
      {grade}
    </Badge>
  );
}
