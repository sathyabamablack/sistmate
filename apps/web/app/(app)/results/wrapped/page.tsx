import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "@/components/ui/IntentLink";
import { buttonClass } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { WrappedStory } from "@/components/wrapped/WrappedStory";
import { requireDashboardData } from "@/lib/data";
import { getPrefs } from "@/lib/prefs-server";
import { PORTAL_HOST } from "@/lib/guides";
import { buildWrapped } from "@/lib/wrapped";

export const metadata: Metadata = { title: "Semester wrapped" };
export const dynamic = "force-dynamic";

export default async function WrappedPage() {
  const [data, prefs] = await Promise.all([requireDashboardData(), getPrefs()]);
  const wrapped = buildWrapped({
    results: data.results,
    attendance: data.attendance,
    currentSemester: data.profile.semester,
    profileArrears: data.profile.arrears,
    threshold: prefs.attendanceThreshold,
  });

  if (!wrapped) {
    return (
      <div>
        <PageHeader title="Semester wrapped" />
        <EmptyState
          title="Nothing to wrap yet"
          description="Your recap appears here once a semester's results are published."
        >
          <Link href="/results" className={buttonClass("secondary", "md")}>
            Back to Results
          </Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto mb-3 flex w-full max-w-[25rem] items-center gap-1">
        <Link
          href="/results"
          aria-label="Back to Results"
          className="-ml-2.5 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focusable"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <h1 className="min-w-0 truncate text-heading font-semibold text-foreground">
          Semester {wrapped.semester} wrapped
        </h1>
      </div>
      <WrappedStory wrapped={wrapped} host={PORTAL_HOST} />
    </div>
  );
}
