"use client";

import * as React from "react";
import Link from "@/components/ui/IntentLink";
import { KIND_PLURALS, PAPER_KINDS, type Paper, type PaperKind } from "@usp/core/papers";
import { Skeleton } from "@/components/ui/Skeleton";
import { listPapers, type PapersClient } from "./api";
import { KindFilter, PaperList } from "./PaperList";
import { UploadPaperDialog, type Subject } from "./UploadPaperDialog";

const SHOWN = 4;

/**
 * "Previous papers" on a course page: the latest few for this subject, and a way to share one.
 * Once the subject also has notes or question banks, a filter switches between the kinds, so the
 * section stays the same height.
 */
export function CoursePapers({ client, subject, subjects }: { client: PapersClient; subject: Subject; subjects: Subject[] }) {
  const [papers, setPapers] = React.useState<Paper[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<PaperKind | null>(null);

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
  const counts: Partial<Record<PaperKind, number>> = {};
  for (const p of papers ?? []) counts[p.kind] = (counts[p.kind] ?? 0) + 1;
  const kinds = PAPER_KINDS.filter((k) => counts[k]);
  const mixed = kinds.length > 1;
  // The kind on show: the one picked, else past papers when there are any.
  const kind = picked && counts[picked] ? picked : (kinds[0] ?? "paper");
  const shown = mixed ? (papers ?? []).filter((p) => p.kind === kind) : (papers ?? []);
  const plural = mixed || kind !== "paper" ? KIND_PLURALS[kind].toLowerCase() : "papers";

  return (
    <section aria-labelledby="course-papers" className="mb-8">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 id="course-papers" className="font-display text-heading font-semibold text-foreground">
          {kinds.some((k) => k !== "paper") ? "Papers and notes" : "Previous papers"}
        </h2>
        <UploadPaperDialog client={client} subjects={uploadSubjects} defaultCode={subject.code} defaultKind={mixed ? kind : undefined} />
      </div>
      {error ? (
        <p role="alert" className="text-body text-danger">
          {error}
        </p>
      ) : papers === null ? (
        <Skeleton className="mt-2 h-16" />
      ) : papers.length === 0 ? (
        <p className="text-body text-muted-foreground">Nothing for {subject.code} yet. Share papers or notes if you have them.</p>
      ) : (
        <>
          {mixed ? <KindFilter value={kind} onChange={(k) => setPicked(k)} counts={counts} all={false} className="mt-2" /> : null}
          <PaperList client={client} papers={shown.slice(0, SHOWN)} />
          {shown.length > SHOWN ? (
            <Link
              href={`/papers?q=${encodeURIComponent(subject.code)}${mixed ? `&kind=${kind}` : ""}`}
              className="focusable mt-1 inline-flex min-h-11 items-center rounded-sm text-small font-medium text-foreground underline underline-offset-4 lg:min-h-0"
            >
              All {shown.length} {plural} for {subject.code}
            </Link>
          ) : null}
        </>
      )}
    </section>
  );
}
