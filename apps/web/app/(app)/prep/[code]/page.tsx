import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BookOpen, CalendarCheck, CalendarClock, ChevronRight } from "lucide-react";
import Link from "@/components/ui/IntentLink";
import { Badge } from "@/components/ui/Badge";
import { CoursePapers } from "@/components/papers/CoursePapers";
import { formatWhen } from "@/components/courses/format";
import { Checklist } from "@/components/prep/Checklist";
import { NeedPanel } from "@/components/prep/NeedPanel";
import { getDashboardData } from "@/lib/data";
import { erpSubjects } from "@/lib/course-names";
import { attendanceAdvice, formatPct } from "@/lib/attendance";
import { courseStats, peekCourseContents, statsLine } from "@/lib/lms-course";
import { papersAccess } from "@/lib/papers";
import { getPrefs } from "@/lib/prefs-server";
import { courseFor, nextExamFor } from "@/lib/prep";
import { loadPrep } from "../load";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

const CODE = /^[A-Za-z0-9]{3,16}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  try {
    const data = await getDashboardData();
    const subject = erpSubjects(data.attendance, data.timetable).find((s) => s.code === code.toUpperCase());
    if (subject) return { title: `${subject.title} exam prep` };
  } catch {
    /* the page itself handles auth */
  }
  return { title: "Exam prep" };
}

export default async function SubjectPrepPage({ params }: Props) {
  const { code: raw } = await params;
  if (!CODE.test(raw)) notFound();
  const code = raw.toUpperCase();
  if (code !== raw) redirect(`/prep/${code}`);

  const [{ data, subjects, planner }, papers, prefs] = await Promise.all([loadPrep(), papersAccess(), getPrefs()]);
  const subject = subjects.find((s) => s.code === code);
  if (!subject) notFound();

  const now = new Date();
  const exam = nextExamFor(subject, subjects, data.events, now);
  const course = courseFor(code, data.courses);
  // Only contents already at hand (mock, or opened in the last few minutes): never a Moodle call here.
  const contents = course ? await peekCourseContents(course.id) : null;
  const courseLine = [
    contents ? statsLine(courseStats(contents)) : null,
    course?.progress != null ? `${course.progress}% complete` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const attendance = data.attendance.find((a) => a.code.toUpperCase() === code);
  const threshold = prefs.attendanceThreshold;
  const advice = attendance ? attendanceAdvice(attendance.attended, attendance.totalClasses, threshold) : null;

  return (
    <div>
      <header className="mb-6 min-w-0 sm:mb-8">
        <nav aria-label="Breadcrumb" className="mb-2 text-small text-muted-foreground">
          <Link
            href="/prep"
            className="focusable inline-flex min-h-11 items-center rounded-sm hover:text-foreground lg:min-h-0"
          >
            Exam prep
          </Link>
          <span aria-hidden className="mx-2">
            /
          </span>
          <span aria-current="page">{subject.code}</span>
        </nav>
        <h1 className="break-words text-title font-semibold text-foreground">{subject.title}</h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-body text-muted-foreground">
          <span className="tabular-nums">{subject.code}</span>
          {exam ? (
            <span className="inline-flex items-start gap-1.5 text-foreground">
              <CalendarClock className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="font-semibold">
                  {exam.label} {exam.when}
                </span>
                <span className="block text-muted-foreground sm:inline">
                  <span className="hidden sm:inline"> · </span>
                  {formatWhen(exam.date, now)}
                </span>
              </span>
            </span>
          ) : null}
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        <div className="min-w-0 space-y-10">
          <NeedPanel code={code} planner={planner} />
          <Checklist code={code} title={subject.title} />
        </div>

        <div className="min-w-0 space-y-10">
          {papers ? (
            <div className="*:mb-0">
              <CoursePapers client={papers} subject={subject} subjects={subjects} />
            </div>
          ) : null}

          {course || attendance ? (
            <section aria-labelledby="more-heading">
              <h2 id="more-heading" className="text-heading font-semibold text-foreground">
                {course ? "Course and attendance" : "Attendance"}
              </h2>
              <ul className="mt-1 divide-y divide-border">
                {course ? (
                  <li>
                    <RowLink href={`/courses/${course.id}`} icon={<BookOpen className="h-4 w-4" aria-hidden />}>
                      <p className="text-body font-medium text-foreground">Course material on the LMS</p>
                      {courseLine ? <p className="text-small tabular-nums text-muted-foreground">{courseLine}</p> : null}
                    </RowLink>
                  </li>
                ) : null}
                {attendance && advice ? (
                  <li>
                    <RowLink
                      href="/attendance"
                      icon={<CalendarCheck className="h-4 w-4" aria-hidden />}
                      end={<Badge variant={advice.tone === "none" ? "muted" : advice.tone}>{advice.short}</Badge>}
                    >
                      <p className="text-body text-foreground">
                        {attendance.totalClasses > 0 ? (
                          <>
                            <span className="font-semibold tabular-nums">{formatPct(attendance.percentage)}</span>{" "}
                            attendance
                          </>
                        ) : (
                          "Attendance"
                        )}
                      </p>
                      <p className="text-small tabular-nums text-muted-foreground">
                        {attendance.totalClasses > 0
                          ? `${attendance.attended} of ${attendance.totalClasses} hours`
                          : "No hours recorded yet"}
                      </p>
                    </RowLink>
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RowLink({
  href,
  icon,
  end,
  children,
}: {
  href: string;
  icon: ReactNode;
  end?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="focusable group -mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/60"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
      {end ? <div className="shrink-0">{end}</div> : null}
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}
