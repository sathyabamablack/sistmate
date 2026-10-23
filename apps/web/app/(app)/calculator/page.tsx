import type { Metadata } from "next";
import { requireDashboardData, getGradingSettings } from "@/lib/data";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Planner } from "@/components/calculator/Planner";
import { creditsResolver, presetById } from "@/lib/grading-presets";
import { estimatedPrevious, plannerSubjects, withCourses } from "@/lib/planner";

export const metadata: Metadata = { title: "CGPA planner" };
export const dynamic = "force-dynamic";

export default async function CalculatorPage() {
  const [data, grading] = await Promise.all([requireDashboardData(), getGradingSettings()]);
  // Credits and mark maxima come from the official catalog here on the server, so the
  // client only receives the few numbers it needs per subject.
  const subjects = withCourses(
    plannerSubjects(
      data.attendance.map((a) => ({ code: a.code, title: a.title })),
      data.marks,
    ),
    creditsResolver(grading),
  );
  const fromErp = subjects.some((s) => s.cae1 !== null || s.cae2 !== null);
  const presetScale = presetById(grading.preset).scale;
  const previous = estimatedPrevious(data.results);

  return (
    <div>
      <PageHeader
        title="CGPA planner"
        description="Build your internal marks from CAE 1 and CAE 2, then see what you need in the semester exam for the grade you want, using the official Sathyabama grades and credits."
      />
      {subjects.length > 0 ? (
        <Planner
          subjects={subjects}
          fromErp={fromErp}
          presetScale={presetScale}
          estimatedPrevious={previous}
        />
      ) : (
        <EmptyState
          title="No subjects to plan yet"
          description="Your current subjects come from the ERP's attendance list, which is empty right now. Try Refresh in a minute."
        />
      )}
    </div>
  );
}
