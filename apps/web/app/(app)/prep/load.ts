import "server-only";

import { getGradingSettings, requireDashboardData } from "@/lib/data";
import { erpSubjects } from "@/lib/course-names";
import { creditsResolver, presetById } from "@/lib/grading-presets";
import { estimatedPrevious, plannerSubjects, withCourses } from "@/lib/planner";
import type { PlannerInputs } from "@/lib/prep";

/**
 * What both prep pages start from. The planner's inputs are built exactly as the CGPA planner
 * page builds them (app/(app)/calculator/page.tsx), so the marks needed match it to the mark.
 */
export async function loadPrep() {
  const [data, grading] = await Promise.all([requireDashboardData(), getGradingSettings()]);
  const planner: PlannerInputs = {
    subjects: withCourses(
      plannerSubjects(
        data.attendance.map((a) => ({ code: a.code, title: a.title })),
        data.marks,
      ),
      creditsResolver(grading),
    ),
    presetScale: presetById(grading.preset).scale,
    estimatedPrevious: estimatedPrevious(data.results),
  };
  return { data, subjects: erpSubjects(data.attendance, data.timetable), planner };
}
