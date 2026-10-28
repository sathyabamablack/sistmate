"use client";

import * as React from "react";
import { Download, Flag } from "lucide-react";
import {
  EXAM_TYPE_LABELS,
  KIND_LABELS,
  KIND_PLURALS,
  PAPER_KINDS,
  REPORT_REASONS,
  type Paper,
  type PaperKind,
  type ReportReason,
} from "@usp/core/papers";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/Menu";
import { buttonClass } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { fileUrl, reportPaper, type PapersClient } from "./api";

/**
 * All / Past papers / Notes / Question banks, as toggle buttons that filter one list. With
 * `counts`, kinds with nothing in them are left out and the rest show how many there are.
 */
export function KindFilter({
  value,
  onChange,
  counts,
  all = true,
  className,
}: {
  value: PaperKind | null;
  onChange: (kind: PaperKind | null) => void;
  counts?: Partial<Record<PaperKind, number>>;
  /** Offer "All" (null). */
  all?: boolean;
  className?: string;
}) {
  const options: { key: PaperKind | null; label: string; count?: number }[] = [
    ...(all ? [{ key: null, label: "All" }] : []),
    ...PAPER_KINDS.filter((k) => !counts || (counts[k] ?? 0) > 0).map((k) => ({ key: k, label: KIND_PLURALS[k], count: counts?.[k] })),
  ];
  return (
    <div role="group" aria-label="Show" className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key ?? "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.key)}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-small font-medium transition-colors focusable sm:px-4 lg:min-h-9",
              active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {o.label}
            {o.count !== undefined ? (
              <span className={cn("text-micro font-normal tabular-nums", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const REPORT_LABELS: Record<ReportReason, string> = {
  wrong_course: "Wrong subject",
  unreadable: "Can't read it",
  not_a_paper: "Not what it says",
  duplicate: "Duplicate",
  other: "Something else",
};

/** "End semester · Nov 2024", "Notes · Unit 3: Trees", "Question bank · 2025". */
export function paperLabel(p: Pick<Paper, "kind" | "examType" | "year" | "month" | "topic">): string {
  if (p.kind !== "paper") return `${KIND_LABELS[p.kind]} · ${p.topic ?? p.year}`;
  return `${p.examType ? EXAM_TYPE_LABELS[p.examType] : KIND_LABELS.paper} · ${p.month ? `${MONTHS[p.month - 1]} ` : ""}${p.year}`;
}

/** A subject's items, under a small heading per kind once there is more than one kind. */
export function PaperSections({ client, papers }: { client: PapersClient; papers: Paper[] }) {
  const sections = PAPER_KINDS.map((kind) => ({ kind, papers: papers.filter((p) => p.kind === kind) })).filter((s) => s.papers.length);
  if (sections.length <= 1) return <PaperList client={client} papers={papers} />;
  return sections.map((s) => (
    <div key={s.kind} className="mt-3">
      <h3 className="text-small font-semibold text-muted-foreground">
        {KIND_PLURALS[s.kind]} <span className="font-normal tabular-nums">{s.papers.length}</span>
      </h3>
      <PaperList client={client} papers={s.papers} />
    </div>
  ));
}

/** "PDF" or "Word"; null for a library paper nobody has opened yet (its format isn't known). */
function fileKind(p: Pick<Paper, "fileType">): string | null {
  if (p.fileType === "pdf") return "PDF";
  if (p.fileType === "docx" || p.fileType === "doc") return "Word";
  return null;
}

export function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** One subject's papers or notes: what it is, how big, open it, flag it. */
export function PaperList({ client, papers }: { client: PapersClient; papers: Paper[] }) {
  const [reported, setReported] = React.useState<Record<string, string>>({});

  const report = async (id: string, reason: ReportReason) => {
    try {
      await reportPaper(client, id, reason);
      setReported((r) => ({ ...r, [id]: "Thanks, we'll take a look." }));
    } catch (err) {
      setReported((r) => ({ ...r, [id]: err instanceof Error ? err.message : "Couldn't send that." }));
    }
  };

  return (
    <ul className="divide-y divide-border">
      {papers.map((p) => (
        <li key={p.id} className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-body font-medium text-foreground">{paperLabel(p)}</p>
            <p className="text-small text-muted-foreground">
              {[
                fileKind(p),
                p.bytes > 0 ? formatBytes(p.bytes) : null,
                p.source === "autolib" ? "from the library" : "shared by a student",
                p.downloads > 0 ? `opened ${p.downloads.toLocaleString("en-IN")} ${p.downloads === 1 ? "time" : "times"}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              {reported[p.id] ? <span role="status"> · {reported[p.id]}</span> : null}
            </p>
          </div>
          <a
            href={fileUrl(client, p.id)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass("outline", "sm")}
            aria-label={`Open ${p.courseCode} ${paperLabel(p)}`}
          >
            <Download className="h-4 w-4" aria-hidden />
            {fileKind(p) === "Word" ? "Download" : "Open"}
          </a>
          <Menu>
            <MenuTrigger
              className={buttonClass("ghost", "icon")}
              aria-label={`Report ${p.courseCode} ${paperLabel(p)}`}
              disabled={Boolean(reported[p.id])}
            >
              <Flag className="h-4 w-4" aria-hidden />
            </MenuTrigger>
            <MenuContent align="end">
              {REPORT_REASONS.map((reason) => (
                <MenuItem key={reason} onSelect={() => void report(p.id, reason)}>
                  {REPORT_LABELS[reason]}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        </li>
      ))}
    </ul>
  );
}
