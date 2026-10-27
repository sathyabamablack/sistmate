"use client";

import * as React from "react";
import Link from "@/components/ui/IntentLink";
import type { Paper } from "@usp/core/papers";
import { Skeleton } from "@/components/ui/Skeleton";
import { listPapers, type PapersClient } from "./api";
import { PaperList } from "./PaperList";
import { UploadPaperDialog, type Subject } from "./UploadPaperDialog";

const SHOWN = 4;

/** "Previous papers" on a course page: the latest few for this subject, and a way to share one. */
export function CoursePapers({ client, subject, subjects }: { client: PapersClient; subject: Subject; subjects: Subject[] }) {
  const [papers, setPapers] = React.useState<Paper[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    listPapers(client, { course: [subject.code] })
      .then((list) => live && setPapers(list))
      .catch((err: unknown) => live && setError(err instanceof Error ? err.message : "Couldn't load papers."));
    return () => {
      live = false;
    };
  }, [client, subject.code]);

  const uploadSubjects = subjects.some((s) => s.code === subject.code) ? subjects : [subject, ...subjects];

  return (
    <section aria-labelledby="course-papers" className="mb-8">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 id="course-papers" className="font-display text-heading font-semibold text-foreground">
          Previous papers
        </h2>
        <UploadPaperDialog client={client} subjects={uploadSubjects} defaultCode={subject.code} />
      </div>
      {error ? (
        <p role="alert" className="text-body text-danger">
          {error}
        </p>
      ) : papers === null ? (
        <Skeleton className="mt-2 h-16" />
      ) : papers.length === 0 ? (
        <p className="text-body text-muted-foreground">No papers for {subject.code} yet. Share one if you have it.</p>
      ) : (
        <>
          <PaperList client={client} papers={papers.slice(0, SHOWN)} />
          {papers.length > SHOWN ? (
            <Link
              href={`/papers?q=${encodeURIComponent(subject.code)}`}
              className="focusable mt-1 inline-flex min-h-11 items-center rounded-sm text-small font-medium text-foreground underline underline-offset-4 lg:min-h-0"
            >
              All {papers.length} papers for {subject.code}
            </Link>
          ) : null}
        </>
      )}
    </section>
  );
}
