"use client";

import * as React from "react";
import { FileText, Search } from "lucide-react";
import { EXAM_TYPES, EXAM_TYPE_LABELS, matchSubjects, type Paper } from "@usp/core/papers";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { listPapers, listSubjects, type PapersClient } from "./api";
import { PaperList } from "./PaperList";
import { UploadPaperDialog, type Subject } from "./UploadPaperDialog";

/**
 * Papers for this semester's subjects by default; typing searches every subject. Each subject
 * with no papers yet asks for one, since the collection grows from students sharing.
 */
export function PapersBrowser({
  client,
  subjects,
  initialQuery = "",
}: {
  client: PapersClient;
  subjects: Subject[];
  initialQuery?: string;
}) {
  const [query, setQuery] = React.useState(initialQuery);
  const [type, setType] = React.useState("");
  const [papers, setPapers] = React.useState<Paper[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const searching = query.trim().length >= 2;

  React.useEffect(() => {
    let live = true;
    const timer = window.setTimeout(
      () => {
        setError(null);
        // Searching matches the subject list in the browser, then asks for those subjects' papers.
        const codes = searching
          ? listSubjects(client).then((all) => matchSubjects(all, query.trim()).map((s) => s.code))
          : Promise.resolve(subjects.map((s) => s.code));
        codes
          .then((course) => (course.length ? listPapers(client, { course, type }) : []))
          .then((list) => live && setPapers(list))
          .catch((err: unknown) => live && setError(err instanceof Error ? err.message : "Couldn't load papers."));
      },
      searching ? 250 : 0,
    );
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [client, subjects, query, type, searching]);

  const groups = React.useMemo(() => {
    const byCode = new Map<string, { code: string; title: string; papers: Paper[] }>();
    if (!searching) for (const s of subjects) byCode.set(s.code, { code: s.code, title: s.title, papers: [] });
    for (const p of papers ?? []) {
      const g = byCode.get(p.courseCode) ?? { code: p.courseCode, title: p.courseTitle, papers: [] };
      g.papers.push(p);
      if (!g.title && p.courseTitle) g.title = p.courseTitle;
      byCode.set(p.courseCode, g);
    }
    // Subjects with papers first, then the ones still waiting for someone to share.
    return [...byCode.values()].sort((a, b) => Number(b.papers.length > 0) - Number(a.papers.length > 0));
  }, [papers, subjects, searching]);

  return (
    <div>
      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Field label="Search all subjects" htmlFor="papers-q">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="papers-q"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Subject code or name, e.g. SCSB1303"
              className="pl-9"
              autoComplete="off"
            />
          </div>
        </Field>
        <Field label="Kind" htmlFor="papers-type">
          <Select id="papers-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All kinds</option>
            {EXAM_TYPES.map((t) => (
              <option key={t} value={t}>
                {EXAM_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger/10 p-4 text-body text-danger">
          {error}
        </p>
      ) : papers === null ? (
        <div className="grid gap-3" aria-busy="true" aria-label="Loading papers">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={searching ? `No papers match “${query.trim()}”` : "No subjects to show"}
          description={searching ? "Try the subject code, or share a paper for it." : "Search for a subject code above."}
        >
          <div className="mt-4">
            <UploadPaperDialog client={client} subjects={subjects} />
          </div>
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {groups.map((g) => (
            <Panel key={g.code} aria-labelledby={`papers-${g.code}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 id={`papers-${g.code}`} className="font-display text-subheading font-semibold text-foreground">
                  {g.title || g.code}
                </h2>
                <span className="text-small tabular-nums text-muted-foreground">{g.code}</span>
              </div>
              {g.papers.length ? (
                <PaperList client={client} papers={g.papers} />
              ) : (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-body text-muted-foreground">No papers yet. Have one from a senior?</p>
                  <UploadPaperDialog client={client} subjects={subjects} defaultCode={g.code} />
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
