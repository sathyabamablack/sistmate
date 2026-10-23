import type { Metadata } from "next";
import { computeCgpa, hasGrades } from "@usp/core";
import type { SemesterResult } from "@usp/core";
import { requireDashboardData, getGradingSettings } from "@/lib/data";
import { computeArrears } from "@/lib/arrears";
import { ArrearsSection } from "@/components/results/ArrearsSection";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinkTabs } from "@/components/ui/LinkTabs";
import { Section } from "@/components/ui/Section";
import { GradedResults } from "./GradedResults";
import { MarksSummary, MarksTable } from "./MarksResults";

export const metadata: Metadata = { title: "Results" };
export const dynamic = "force-dynamic";

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ sem?: string }>;
}) {
  const [data, { sem }, grading] = await Promise.all([
    requireDashboardData(),
    searchParams,
    getGradingSettings(),
  ]);
  const semesters = [...data.results].sort((a, b) => a.semester - b.semester);
  const arrears = computeArrears(semesters);
  const graded = hasGrades(semesters);
  const estimated = graded && semesters.some((s) => s.estimated);
  // Estimated mode shows semesters that had scored papers (an all-RA semester has no GPA but
  // is still shown); semesters with nothing scored have no grades to show.
  const gradedSemesters = estimated
    ? semesters.filter((s) => s.gpa != null || s.estimated === true)
    : semesters;

  if (semesters.length === 0) {
    return (
      <div>
        <PageHeader title="Results" />
        <EmptyState title="No results published" description="Nothing from your ERP yet." />
      </div>
    );
  }

  if (graded) {
    return (
      <div>
        <PageHeader title="Results" />
        <GradedResults
          semesters={gradedSemesters}
          cgpa={computeCgpa(gradedSemesters)}
          settings={grading}
          arrears={arrears}
          profileArrears={data.profile.arrears}
        />
      </div>
    );
  }

  const selected = pickSemester(semesters, sem);
  return (
    <div>
      <PageHeader title="Results" description="End-semester marks, by semester." />
      <div className="space-y-8">
        <MarksSummary semesters={semesters} arrears={data.profile.arrears} />
        <ArrearsSection arrears={arrears} />
        {semesters.length > 1 ? (
          <LinkTabs
            label="Semester"
            items={semesters.map((s) => ({
              href: `/results?sem=${s.semester}`,
              label: `Semester ${s.semester}`,
              active: s.semester === selected.semester,
            }))}
          />
        ) : null}
        <Section id="semester" title={`Semester ${selected.semester} marks`}>
          <MarksTable semester={selected} />
        </Section>
      </div>
    </div>
  );
}

/** `?sem=` if it names a published semester, otherwise the latest one. */
function pickSemester(semesters: SemesterResult[], sem: string | undefined): SemesterResult {
  const wanted = Number(sem);
  return (
    semesters.find((s) => s.semester === wanted) ?? semesters[semesters.length - 1]!
  );
}
