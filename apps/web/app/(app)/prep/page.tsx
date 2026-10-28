import type { Metadata } from "next";
import { NotebookPen } from "lucide-react";
import Link from "@/components/ui/IntentLink";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PrepList, type PrepRow } from "@/components/prep/PrepList";
import { papersAccess } from "@/lib/papers";
import { nextExamFor } from "@/lib/prep";
import { loadPrep } from "./load";

export const metadata: Metadata = { title: "Exam prep" };
export const dynamic = "force-dynamic";

export default async function PrepPage() {
  const [{ data, subjects, planner }, papers] = await Promise.all([loadPrep(), papersAccess()]);
  const now = new Date();
  const rows: PrepRow[] = subjects.map((s) => {
    const exam = nextExamFor(s, subjects, data.events, now);
    return { code: s.code, title: s.title, exam: exam ? `${exam.label} ${exam.when}` : null };
  });

  return (
    <div>
      <PageHeader
        title="Exam prep"
        description="Your subjects this semester: the exam marks each one needs and how far your revision has got."
      />
      {rows.length > 0 ? (
        <>
          <PrepList rows={rows} planner={planner} papers={papers} />
          <p className="mt-6 max-w-prose text-small text-muted-foreground">
            Marks needed are for the targets in your{" "}
            <Link href="/calculator" className="focusable rounded-sm font-medium text-foreground underline underline-offset-4">
              CGPA planner
            </Link>
            . Revision ticks are saved in this browser.
          </p>
        </>
      ) : (
        <EmptyState
          icon={NotebookPen}
          title="No subjects yet"
          description="Your current subjects come from the ERP's attendance list, which is empty right now. Try Refresh in a minute."
        />
      )}
    </div>
  );
}
