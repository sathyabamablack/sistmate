import type { Metadata } from "next";
import Link from "@/components/ui/IntentLink";
import { notFound, redirect } from "next/navigation";
import { BookOpen, TriangleAlert } from "lucide-react";
import { getDashboardData, requireDashboardData } from "@/lib/data";
import {
  courseFiles,
  courseStats,
  fileSearchText,
  loadCourseContents,
  sectionIsEmpty,
  statsLine,
  unitAnchor,
  unitStats,
} from "@/lib/lms-course";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { CourseMaterials, type MaterialFile } from "@/components/courses/CourseMaterials";
import { UnitList } from "@/components/courses/UnitList";
import { UnitNav } from "@/components/courses/UnitNav";
import { fileHref, fileTypeShort, formatDay, formatSize, isViewable, relativeTo } from "@/components/courses/format";

export const dynamic = "force-dynamic";
// Loading one course takes several Moodle calls on a cold cache.
export const maxDuration = 30;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const data = await getDashboardData();
    const course = data.courses.find((c) => c.id === Number(id));
    if (course) return { title: course.displayName ?? course.fullName };
  } catch {
    /* the page itself handles auth */
  }
  return { title: "Course" };
}

export default async function CoursePage({ params }: Props) {
  const { id } = await params;
  const courseId = Number(id);
  if (!Number.isInteger(courseId) || courseId <= 0) notFound();

  // Hidden courses (Choose courses) still open here when visited directly.
  const data = await requireDashboardData();
  const course = data.courses.find((c) => c.id === courseId);
  if (!course) notFound();

  const view = await loadCourseContents(courseId);
  if (view.status === "signed-out") redirect("/login");
  if (view.status === "expired") redirect("/api/auth/expired");

  const now = new Date();
  const contents = view.status === "ok" ? view.contents : null;
  const units = contents ? contents.sections.filter((s) => !sectionIsEmpty(s)) : [];
  const stats = contents ? courseStats(contents) : null;
  const grade = contents?.grade ?? (course.grade ? { display: course.grade, percentage: null } : null);

  const files: MaterialFile[] = courseFiles(units).map((r) => ({
    key: `${r.cmid}-${r.index}`,
    name: r.file.name,
    href: fileHref(courseId, r.cmid, "files", r.index),
    viewHref: isViewable(r.file) ? fileHref(courseId, r.cmid, "files", r.index, true) : null,
    type: fileTypeShort(r.file),
    meta: [formatSize(r.file.size), r.file.modified ? `updated ${formatDay(r.file.modified, now)}` : ""]
      .filter(Boolean)
      .join(", "),
    unitName: r.unitName,
    moduleName: r.moduleName,
    search: fileSearchText(r),
  }));

  return (
    <div>
      <header className="mb-6 min-w-0 sm:mb-8">
        <nav aria-label="Breadcrumb" className="mb-2 text-small text-muted-foreground">
          <Link
            href="/courses"
            className="focusable inline-flex min-h-11 items-center rounded-sm hover:text-foreground lg:min-h-0"
          >
            Courses
          </Link>
          <span aria-hidden className="mx-2">
            /
          </span>
          <span aria-current="page" className="break-words">
            {course.displayCode ?? course.shortName}
          </span>
        </nav>
        <h1 className="break-words text-title font-semibold text-foreground">{course.displayName ?? course.fullName}</h1>
        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-body text-muted-foreground">
          <span className="tabular-nums">{course.displayCode ?? course.shortName}</span>
          {course.category ? <span>{course.category}</span> : null}
          {stats && statsLine(stats) ? <span className="tabular-nums">{statsLine(stats)}</span> : null}
          {course.lastAccess ? <span>Last opened {relativeTo(course.lastAccess, now)}</span> : null}
        </p>

        <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
          <div className="min-w-0">
            <dt className="text-small text-muted-foreground">Progress</dt>
            <dd className="mt-0.5 flex items-center gap-3">
              {course.progress === null ? (
                <span className="text-body text-muted-foreground">Not tracked</span>
              ) : (
                <>
                  <span className="font-display text-subheading font-semibold tabular-nums text-foreground">
                    {course.progress}%
                  </span>
                  <ProgressBar value={course.progress} className="h-1.5 w-28" aria-label="Course progress" />
                </>
              )}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-small text-muted-foreground">Grade</dt>
            <dd className="mt-0.5">
              {grade ? (
                <>
                  <span className="font-display text-subheading font-semibold tabular-nums text-foreground">
                    {grade.display}
                  </span>
                  {grade.percentage ? (
                    <span className="ml-2 text-small tabular-nums text-muted-foreground">{grade.percentage}</span>
                  ) : null}
                </>
              ) : (
                <span className="text-body text-muted-foreground">None yet</span>
              )}
            </dd>
          </div>
        </dl>
      </header>

      {view.status !== "ok" ? (
        <Unavailable status={view.status} message={view.status === "error" ? view.message : undefined} />
      ) : units.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Nothing posted in this course yet"
          description="Your instructor hasn't added any units or material. New items will appear here once they're published on the LMS."
        />
      ) : (
        <CourseMaterials
          total={stats?.items ?? 0}
          files={files}
          nav={
            units.length > 1 ? (
              <UnitNav
                units={units.map((s) => ({ anchor: unitAnchor(s), name: s.name, ...unitStats(s) }))}
              />
            ) : null
          }
        >
          <UnitList sections={units} courseId={courseId} now={now} />
        </CourseMaterials>
      )}
    </div>
  );
}

function Unavailable({ status, message }: { status: string; message?: string }) {
  const text =
    status === "not-connected"
      ? "Your LMS account isn't connected, so course material can't be loaded. Connect it from the dashboard, then come back."
      : (message ?? "The LMS didn't return this course.");
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl bg-warning/10 p-4 text-body ring-1 ring-warning/30">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0">
        <p className="font-medium text-foreground">
          {status === "not-connected" ? "LMS isn't connected" : "Couldn't load this course"}
        </p>
        <p className="mt-0.5 text-muted-foreground">{text}</p>
        {status === "error" ? (
          <p className="mt-2 text-muted-foreground">
            Reload the page to try again. Your other courses aren&apos;t affected.
          </p>
        ) : null}
      </div>
    </div>
  );
}
