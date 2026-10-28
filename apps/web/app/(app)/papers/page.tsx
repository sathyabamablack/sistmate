import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { PAPER_KINDS } from "@usp/core/papers";
import Link from "@/components/ui/IntentLink";
import { requireDashboardData } from "@/lib/data";
import { erpSubjects } from "@/lib/course-names";
import { papersAccess } from "@/lib/papers";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClass } from "@/components/ui/Button";
import { PapersBrowser } from "@/components/papers/PapersBrowser";
import { UploadPaperDialog } from "@/components/papers/UploadPaperDialog";

export const metadata: Metadata = { title: "Question papers" };
export const dynamic = "force-dynamic";

export default async function PapersPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  const { q, kind } = await searchParams;
  const initialKind = PAPER_KINDS.find((k) => k === kind) ?? null;
  const data = await requireDashboardData();
  const subjects = erpSubjects(data.attendance, data.timetable);
  const access = await papersAccess();

  return (
    <div>
      <PageHeader
        title="Question papers"
        description="Past exam papers, notes and question banks for your subjects, shared by students."
        actions={
          access ? (
            <>
              {access.isAdmin ? (
                <Link href="/papers/review" className={buttonClass("outline", "sm")}>
                  Review queue
                </Link>
              ) : null}
              <UploadPaperDialog client={access} subjects={subjects} />
            </>
          ) : null
        }
      />
      {access ? (
        <PapersBrowser
          client={access}
          subjects={subjects}
          initialQuery={typeof q === "string" ? q.slice(0, 60) : ""}
          initialKind={initialKind}
        />
      ) : (
        <EmptyState
          icon={FileText}
          title="Question papers aren't available yet"
          description="This part of the portal is still being set up. Check back soon."
        />
      )}
      <p className="mt-8 max-w-prose text-small text-muted-foreground">
        Everything here is shared by students and checked before it appears. Only signed-in students can open it. If
        something here shouldn&apos;t be, use the flag next to it and it will be reviewed.
      </p>
    </div>
  );
}
