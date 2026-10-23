import type { Metadata } from "next";
import { BookOpen, EyeOff } from "lucide-react";
import { requireDashboardData } from "@/lib/data";
import { courseStats, peekCourseContents, sortCourses, statsLine } from "@/lib/lms-course";
import { displayCourse, erpSubjects, visibleCourses } from "@/lib/course-names";
import { getPrefs } from "@/lib/prefs-server";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { CourseChooser } from "@/components/courses/CourseChooser";
import { CourseGrid, type CourseCardData } from "@/components/courses/CourseGrid";
import { relativeTo } from "@/components/courses/format";

export const metadata: Metadata = { title: "Courses" };
export const dynamic = "force-dynamic";

/**
 * Course cards, most recently opened first.
 *
 * "4 units, 9 files" comes from `peekCourseContents`, which only reads contents
 * that are already at hand (the mock data, or a course opened in the last few
 * minutes). Loading every course's contents here would cost several Moodle
 * calls per course, so a card without them simply leaves that line out.
 */
export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ choose?: string | string[] }>;
}) {
  const choose = [(await searchParams).choose].flat().includes("1");
  const [data, prefs] = await Promise.all([requireDashboardData(), getPrefs()]);
  const now = new Date();

  const all = sortCourses(data.courses);
  // Moodle names carry codes, batches and semesters; show the clean subject title instead.
  const subjects = erpSubjects(data.attendance, data.timetable);
  const shownAs = new Map(all.map((c) => [c.id, displayCourse(c, subjects)]));

  // This semester's courses: matched to the ERP's attendance and timetable by code or by title.
  const thisSemester = all.filter((c) => shownAs.get(c.id)!.current).map((c) => c.id);

  /*
   * Moodle lists every semester a student was ever enrolled in, so the default
   * is this semester only. It falls back to the full list when nothing matches
   * (a term the ERP has not published yet), so the page is never empty just
   * because the filter found nothing.
   */
  const shown = visibleCourses(all, prefs, subjects);
  const currentOnly = prefs.courseFilter === "current" && thisSemester.length > 0;
  const contents = await Promise.all(shown.map((c) => peekCourseContents(c.id)));

  const cards: CourseCardData[] = shown.map((c, i) => {
    const loaded = contents[i];
    return {
      id: c.id,
      name: shownAs.get(c.id)!.title,
      code: shownAs.get(c.id)!.code ?? c.shortName,
      category: c.category ?? null,
      progress: c.progress,
      grade: c.grade ?? null,
      materials: loaded ? statsLine(courseStats(loaded)) || "Nothing posted yet" : null,
      opened: c.lastAccess ? `Opened ${relativeTo(c.lastAccess, now)}` : null,
      search: `${c.fullName} ${c.shortName} ${c.category ?? ""}`.toLowerCase(),
    };
  });

  const noun = shown.length === 1 ? "course" : "courses";
  const summary =
    all.length === 0
      ? undefined
      : shown.length < all.length
        ? // Some are left out, either by the filter or by hand: say how many of how many.
          `${currentOnly ? "This semester, " : ""}${shown.length} of ${all.length} courses.`
        : `${currentOnly ? "This semester, " : ""}${shown.length} ${noun}.`;

  return (
    <div>
      <PageHeader
        title="Courses"
        description={summary}
        actions={
          all.length > 0 ? (
            <CourseChooser
              courses={all.map((c) => ({
                id: c.id,
                name: shownAs.get(c.id)!.title,
                code: shownAs.get(c.id)!.code ?? c.shortName,
                opened: c.lastAccess ? `Opened ${relativeTo(c.lastAccess, now)}` : null,
              }))}
              prefs={prefs}
              thisSemester={thisSemester}
              defaultOpen={choose}
            />
          ) : null
        }
      />

      {all.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={data.connected.lms ? "No courses on your LMS account" : "LMS isn't connected"}
          description={
            data.connected.lms
              ? "Nothing enrolled for this term yet."
              : "Connect your LMS account to see your course material here."
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={EyeOff}
          title="Nothing to show"
          description="Use Choose courses to pick the ones you want."
        />
      ) : (
        <CourseGrid cards={cards} />
      )}
    </div>
  );
}
