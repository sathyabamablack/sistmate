"use client";

import * as React from "react";
import { Download, Flag } from "lucide-react";
import { EXAM_TYPE_LABELS, REPORT_REASONS, type Paper, type ReportReason } from "@usp/core/papers";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/Menu";
import { buttonClass } from "@/components/ui/Button";
import { fileUrl, reportPaper, type PapersClient } from "./api";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const REPORT_LABELS: Record<ReportReason, string> = {
  wrong_course: "Wrong subject",
  unreadable: "Can't read it",
  not_a_paper: "Not a question paper",
  duplicate: "Duplicate",
  other: "Something else",
};

export function paperLabel(p: Pick<Paper, "examType" | "year" | "month">): string {
  return `${EXAM_TYPE_LABELS[p.examType]} · ${p.month ? `${MONTHS[p.month - 1]} ` : ""}${p.year}`;
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

/** One subject's papers: what kind, when, how big, open it, flag it. */
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
