"use client";

import * as React from "react";
import { ExternalLink, Inbox } from "lucide-react";
import { EXAM_TYPES, EXAM_TYPE_LABELS, checkMeta, type Paper } from "@usp/core/papers";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClass } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { fileUrl, moderatePaper, reviewQueue, type PapersClient } from "./api";
import { formatBytes, paperLabel } from "./PaperList";

type Reports = Record<string, { reason: string; n: number }[]>;

/** Admins: new uploads and imports waiting for a look, then approved papers someone reported. */
export function ReviewQueue({ client }: { client: PapersClient }) {
  const [papers, setPapers] = React.useState<Paper[] | null>(null);
  const [reports, setReports] = React.useState<Reports>({});
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    reviewQueue(client)
      .then(({ papers, reports }) => {
        const byPaper: Reports = {};
        for (const r of reports) (byPaper[r.paper_id] ??= []).push({ reason: r.reason, n: r.n });
        setReports(byPaper);
        setPapers(papers);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't load the queue."));
  }, [client]);

  if (error) {
    return (
      <p role="alert" className="rounded-xl bg-danger/10 p-4 text-body text-danger">
        {error}
      </p>
    );
  }
  if (papers === null) return <Skeleton className="h-40" />;
  if (papers.length === 0) return <EmptyState icon={Inbox} title="Nothing to review" description="New uploads and reported papers show up here." />;

  return (
    <div className="grid gap-4">
      <p className="text-small text-muted-foreground">{papers.length} waiting</p>
      {papers.map((p) => (
        <ReviewItem
          key={p.id}
          client={client}
          paper={p}
          reports={reports[p.id] ?? []}
          onDone={() => setPapers((list) => (list ?? []).filter((x) => x.id !== p.id))}
        />
      ))}
    </div>
  );
}

function ReviewItem({
  client,
  paper,
  reports,
  onDone,
}: {
  client: PapersClient;
  paper: Paper;
  reports: { reason: string; n: number }[];
  onDone: () => void;
}) {
  const [form, setForm] = React.useState({
    courseCode: paper.courseCode,
    courseTitle: paper.courseTitle,
    examType: paper.examType,
    year: String(paper.year),
    month: paper.month ? String(paper.month) : "",
  });
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const id = `review-${paper.id}`;
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const run = async (action: "save" | "approve" | "reject") => {
    setMessage(null);
    setBusy(action);
    try {
      if (action !== "reject") {
        const meta = checkMeta(form);
        if (!meta.ok) throw new Error(meta.error);
        await moderatePaper(client, paper.id, { action: "update", meta: meta.value });
      }
      if (action === "approve") await moderatePaper(client, paper.id, { action: "approve" });
      if (action === "reject") await moderatePaper(client, paper.id, { action: "reject", reason: reason.trim() || "Not usable" });
      if (action === "save") setMessage("Saved.");
      else onDone();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`${id}-title`} className="font-display text-subheading font-semibold text-foreground">
          {paper.courseCode} · {paperLabel(paper)}
        </h2>
        <Badge variant={paper.status === "pending" ? "warning" : "danger"}>{paper.status === "pending" ? "New" : "Reported"}</Badge>
        <Badge variant="muted">{paper.source}</Badge>
      </div>
      <p className="mt-1 text-small text-muted-foreground">
        {formatBytes(paper.bytes)} · added {new Date(paper.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
        {paper.sourceRef ? ` · ${paper.sourceRef}` : ""}
      </p>
      {reports.length ? (
        <p className="mt-1 text-small text-danger">Reported: {reports.map((r) => `${r.reason.replace(/_/g, " ")} (${r.n})`).join(", ")}</p>
      ) : null}

      <a href={fileUrl(client, paper.id)} target="_blank" rel="noopener noreferrer" className={buttonClass("outline", "sm", "mt-3")}>
        <ExternalLink className="h-4 w-4" aria-hidden />
        Open file
      </a>

      <div className="mt-4 grid gap-3 sm:grid-cols-[9rem_1fr]">
        <Field label="Code" htmlFor={`${id}-code`}>
          <Input id={`${id}-code`} value={form.courseCode} onChange={set("courseCode")} spellCheck={false} />
        </Field>
        <Field label="Subject name" htmlFor={`${id}-name`}>
          <Input id={`${id}-name`} value={form.courseTitle} onChange={set("courseTitle")} />
        </Field>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Kind" htmlFor={`${id}-type`}>
          <Select id={`${id}-type`} value={form.examType} onChange={set("examType")}>
            {EXAM_TYPES.map((t) => (
              <option key={t} value={t}>
                {EXAM_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Year" htmlFor={`${id}-year`}>
          <Input id={`${id}-year`} inputMode="numeric" value={form.year} onChange={set("year")} />
        </Field>
        <Field label="Month (1-12)" htmlFor={`${id}-month`}>
          <Input id={`${id}-month`} inputMode="numeric" value={form.month} onChange={set("month")} />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <Button onClick={() => void run("approve")} loading={busy === "approve"} disabled={busy !== null}>
          Approve
        </Button>
        <Button variant="outline" onClick={() => void run("save")} loading={busy === "save"} disabled={busy !== null}>
          Save details
        </Button>
        <div className="flex flex-1 flex-wrap items-end gap-2 sm:justify-end">
          <Field label="Reject reason" htmlFor={`${id}-reason`} className="min-w-48 flex-1 sm:max-w-64">
            <Input id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Blurry, wrong subject…" />
          </Field>
          <Button variant="danger" onClick={() => void run("reject")} loading={busy === "reject"} disabled={busy !== null}>
            Reject
          </Button>
        </div>
      </div>
      {message ? (
        <p role="status" className="mt-3 text-small text-muted-foreground">
          {message}
        </p>
      ) : null}
    </Panel>
  );
}
