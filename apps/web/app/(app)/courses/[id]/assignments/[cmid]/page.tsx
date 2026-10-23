import type { Metadata } from "next";
import Link from "@/components/ui/IntentLink";
import { notFound, redirect } from "next/navigation";
import { courseAssignments } from "@usp/core";
import { Panel } from "@/components/ui/Panel";
import { Section } from "@/components/ui/Section";
import { requireDashboardData } from "@/lib/data";
import { loadCourseContents } from "@/lib/lms-course";
import { FileList } from "@/components/courses/FileList";
import { RichText } from "@/components/courses/RichText";
import { StatusText } from "@/components/courses/StatusText";
import { assignmentState, formatWhen, relativeTo } from "@/components/courses/format";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Props = { params: Promise<{ id: string; cmid: string }> };

export const metadata: Metadata = { title: "Assignment" };

export default async function AssignmentPage({ params }: Props) {
  const { id, cmid } = await params;
  const courseId = Number(id);
  const assignId = Number(cmid);
  if (!Number.isInteger(courseId) || !Number.isInteger(assignId)) notFound();

  const data = await requireDashboardData();
  const course = data.courses.find((c) => c.id === courseId);
  if (!course) notFound();

  const view = await loadCourseContents(courseId);
  if (view.status === "signed-out") redirect("/login");
  if (view.status === "expired") redirect("/api/auth/expired");

  const back = (
    <Link
      href={`/courses/${courseId}`}
      className="focusable inline-flex min-h-11 items-center rounded-sm hover:text-foreground lg:min-h-0"
    >
      {course.shortName}
    </Link>
  );

  if (view.status !== "ok") {
    return (
      <div>
        <Crumbs course={back} current="Assignment" />
        <div role="status" className="rounded-xl bg-warning/10 p-4 text-body ring-1 ring-warning/30">
          <p className="font-medium text-foreground">Couldn&apos;t load this assignment</p>
          <p className="mt-0.5 text-muted-foreground">
            {view.status === "error"
              ? view.message
              : "Your LMS account isn't connected, so assignment details can't be loaded."}
          </p>
        </div>
      </div>
    );
  }

  const a = courseAssignments(view.contents).find((x) => x.id === assignId);
  if (!a) notFound();

  const now = new Date();
  const state = assignmentState(a, now);

  return (
    <div className="min-w-0 max-w-3xl">
      <Crumbs course={back} current="Assignment" />
      <h1 className="break-words text-title font-semibold text-foreground">{a.name}</h1>
      <p className="mt-1.5 break-words text-body text-muted-foreground">{course.displayName ?? course.fullName}</p>
      <p className="mt-3 text-body font-medium">
        <StatusText tone={state.tone}>{state.label}</StatusText>
      </p>

      <Panel className="mt-6">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2.5 text-body">
        {a.openDate ? <Row label="Opened">{formatWhen(a.openDate, now)}</Row> : null}
        <Row label="Due">
          {a.dueDate ? (
            <>
              <span className="tabular-nums">{formatWhen(a.dueDate, now)}</span>
              <span className="text-muted-foreground"> ({relativeTo(a.dueDate, now)})</span>
              {a.extended ? <span className="text-muted-foreground">. Extension applied.</span> : null}
            </>
          ) : (
            <span className="text-muted-foreground">No due date</span>
          )}
        </Row>
        {a.cutoffDate ? (
          <Row label="Cut-off">
            <span className="tabular-nums">{formatWhen(a.cutoffDate, now)}</span>
            <span className="text-muted-foreground">. No submissions after this.</span>
          </Row>
        ) : null}
        <Row label="Maximum grade">
          {a.maxGrade ? <span className="tabular-nums">{a.maxGrade}</span> : <span className="text-muted-foreground">Not set</span>}
        </Row>
        <Row label="Submission">
          {a.submission === "submitted" ? (
            <>
              Submitted
              {a.submittedAt ? <span className="tabular-nums text-muted-foreground"> on {formatWhen(a.submittedAt, now)}</span> : null}
            </>
          ) : a.submission === "draft" ? (
            <>
              Draft saved, not submitted
              {a.submittedAt ? <span className="tabular-nums text-muted-foreground"> on {formatWhen(a.submittedAt, now)}</span> : null}
            </>
          ) : (
            <span className="text-muted-foreground">Nothing submitted</span>
          )}
        </Row>
        <Row label="Grade">
          {a.grade ? (
            <>
              <span className="font-medium tabular-nums">{a.grade.display}</span>
              {a.gradedAt ? <span className="tabular-nums text-muted-foreground">, graded {formatWhen(a.gradedAt, now)}</span> : null}
            </>
          ) : (
            <span className="text-muted-foreground">{a.submission === "submitted" ? "Awaiting grade" : "Not graded"}</span>
          )}
        </Row>
      </dl>
      </Panel>

      <Section title="Description" id="description" className="mt-10">
        {a.intro.length > 0 ? (
          <RichText blocks={a.intro} />
        ) : (
          <p className="text-body text-muted-foreground">The instructor hasn&apos;t added a description for this assignment.</p>
        )}
        {a.attachments.length > 0 ? (
          <div className="mt-4">
            <h3 className="mb-1.5 text-small font-semibold text-foreground">Attached files</h3>
            <FileList files={a.attachments} courseId={courseId} cmid={a.id} group="attachments" />
          </div>
        ) : null}
      </Section>

      <Section title="Your submission" id="submission" className="mt-10">
        {a.submittedFiles.length === 0 && a.submittedText.length === 0 ? (
          <p className="text-body text-muted-foreground">
            {a.submission === "none"
              ? "You haven't submitted anything for this assignment."
              : "The LMS doesn't list any files or text for your submission."}
          </p>
        ) : (
          <div className="space-y-3">
            <FileList files={a.submittedFiles} courseId={courseId} cmid={a.id} group="submitted" />
            {a.submittedText.length > 0 ? <RichText blocks={a.submittedText} /> : null}
          </div>
        )}
        <p className="mt-3 text-small text-muted-foreground">
          This view is read-only. Uploading or editing a submission isn&apos;t supported in the app yet.
        </p>
      </Section>

      <Section title="Feedback" id="feedback" className="mt-10">
        {a.feedback.length > 0 ? (
          <RichText blocks={a.feedback} />
        ) : (
          <p className="text-body text-muted-foreground">
            {a.grade
              ? "Your instructor didn't leave written feedback with this grade."
              : "Feedback appears here after your instructor grades the submission."}
          </p>
        )}
      </Section>
    </div>
  );
}

function Crumbs({ course, current }: { course: React.ReactNode; current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-small text-muted-foreground">
      <Link
        href="/courses"
        className="focusable inline-flex min-h-11 items-center rounded-sm hover:text-foreground lg:min-h-0"
      >
        Courses
      </Link>
      <span aria-hidden className="mx-2">
        /
      </span>
      {course}
      <span aria-hidden className="mx-2">
        /
      </span>
      <span aria-current="page">{current}</span>
    </nav>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </>
  );
}
