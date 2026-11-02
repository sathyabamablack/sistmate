"use client";

import * as React from "react";
import { CheckCircle2, Upload } from "lucide-react";
import { EXAM_TYPES, EXAM_TYPE_LABELS, KIND_LABELS, MAX_PAPER_BYTES, PAPER_KINDS, checkMeta, type ExamType, type PaperKind } from "@usp/core/papers";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Input";
import { labelClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { PapersError, uploadPaper, type PapersClient } from "./api";
import { imagesToPdf } from "./images-to-pdf";
import { FilePicker } from "./FilePicker";

export interface Subject {
  code: string;
  title: string;
}

const OTHER = "__other";
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const TRIGGER_LABELS: Record<PaperKind, string> = {
  paper: "Share a paper",
  notes: "Share notes",
  question_bank: "Share a question bank",
};

const SUBMIT_LABELS: Record<PaperKind, string> = {
  paper: "Share paper",
  notes: "Share notes",
  question_bank: "Share question bank",
};

/**
 * Share a past paper, notes or a question bank: say which first, pick the subject, then the
 * details that kind has (a paper's exam and date; notes' unit or topic), and attach a PDF or
 * photos. Photos become one PDF in the browser (images-to-pdf.ts). Everything waits for review.
 */
export function UploadPaperDialog({
  client,
  subjects,
  defaultCode,
  defaultKind,
  trigger,
}: {
  client: PapersClient;
  subjects: Subject[];
  defaultCode?: string;
  /** Preselects the kind each time the dialog opens, and names the default button after it. */
  defaultKind?: PaperKind;
  trigger?: React.ReactNode;
}) {
  const thisYear = new Date().getFullYear();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<PaperKind>(defaultKind ?? "paper");
  const [subject, setSubject] = React.useState(defaultCode ?? subjects[0]?.code ?? OTHER);
  const [otherCode, setOtherCode] = React.useState("");
  const [otherTitle, setOtherTitle] = React.useState("");
  const [examType, setExamType] = React.useState<ExamType>("end_sem");
  const [year, setYear] = React.useState(String(thisYear));
  const [month, setMonth] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const reset = () => {
    setFiles([]);
    setError(null);
    setDone(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const known = subjects.find((s) => s.code === subject);
    const meta = checkMeta({
      courseCode: known ? known.code : otherCode,
      courseTitle: known ? known.title : otherTitle,
      kind,
      examType,
      // Notes and question banks are dated the year they're shared.
      year: kind === "paper" ? year : "",
      month,
      topic,
    });
    if (!meta.ok) return setError(meta.error);
    if (files.length === 0) return setError("Attach the file: one PDF, or a photo of each page.");
    const pdfs = files.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length > 0 && files.length > 1) return setError("Attach one PDF, or photos only, not both.");

    setBusy(true);
    try {
      const pdf = pdfs[0] ?? (await imagesToPdf(files));
      if (pdf.size > MAX_PAPER_BYTES) throw new Error("That file is over 20 MB. Try photos instead; they get compressed.");
      await uploadPaper(client, meta.value, pdf);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof PapersError && err.status === 409
          ? "Someone has already shared this exact file. Thanks anyway!"
          : err instanceof Error
            ? err.message
            : "Upload failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next);
        if (next && defaultKind) setKind(defaultKind);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="secondary" size="sm">
            <Upload className="h-4 w-4" aria-hidden />
            {defaultKind ? TRIGGER_LABELS[defaultKind] : "Share papers or notes"}
          </Button>
        )}
      </DialogTrigger>
      {/* The form is taller than a phone screen once the keyboard is up: scroll inside the dialog. */}
      <DialogContent className="max-h-[84dvh] max-w-lg overflow-y-auto overscroll-contain p-5 sm:p-6">
        <DialogTitle className="pr-10 font-display text-heading font-semibold">Share papers or notes</DialogTitle>
        {done ? (
          <div role="status" className="mt-4">
            <p className="flex items-center gap-2 text-body font-medium text-foreground">
              <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
              Thanks! It&apos;s in the queue.
            </p>
            <p className="mt-1 text-body text-muted-foreground">
              It shows up for everyone once it has been checked, usually within a day.
            </p>
            <div className="mt-5 flex gap-2">
              <Button onClick={reset}>Share another</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-1" noValidate>
            <DialogDescription className="text-body text-muted-foreground">
              Past papers, notes and question banks all help. Everything is checked before it&apos;s shared, and your
              name isn&apos;t shown.
            </DialogDescription>

            <div className="mt-5 grid gap-4">
              <fieldset>
                <legend className={labelClass}>What are you sharing?</legend>
                {/* Native radios under each chip: arrow keys and screen readers work as usual. */}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {PAPER_KINDS.map((k) => (
                    <label key={k} className="relative">
                      <input
                        type="radio"
                        name="paper-kind"
                        value={k}
                        checked={kind === k}
                        onChange={() => setKind(k)}
                        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                      />
                      <span
                        className={cn(
                          "inline-flex min-h-11 items-center rounded-full px-4 text-small font-semibold transition-colors lg:min-h-9",
                          "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
                          kind === k
                            ? "bg-primary text-primary-foreground"
                            : "bg-surface text-foreground ring-1 ring-border peer-hover:bg-muted",
                        )}
                      >
                        {KIND_LABELS[k]}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <Field label="Subject" htmlFor="paper-subject">
                <Select id="paper-subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
                  {subjects.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} · {s.title}
                    </option>
                  ))}
                  <option value={OTHER}>Another subject…</option>
                </Select>
              </Field>
              {subject === OTHER ? (
                <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                  <Field label="Subject code" htmlFor="paper-code">
                    <Input
                      id="paper-code"
                      value={otherCode}
                      onChange={(e) => setOtherCode(e.target.value)}
                      placeholder="SCSB1303"
                      autoCapitalize="characters"
                      spellCheck={false}
                    />
                  </Field>
                  <Field label="Subject name" htmlFor="paper-title">
                    <Input id="paper-title" value={otherTitle} onChange={(e) => setOtherTitle(e.target.value)} />
                  </Field>
                </div>
              ) : null}

              {kind === "paper" ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Exam" htmlFor="paper-type">
                    <Select id="paper-type" value={examType} onChange={(e) => setExamType(e.target.value as ExamType)}>
                      {EXAM_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {EXAM_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Year" htmlFor="paper-year">
                    <Select id="paper-year" value={year} onChange={(e) => setYear(e.target.value)}>
                      {Array.from({ length: 12 }, (_, i) => thisYear - i).map((y) => (
                        <option key={y}>{y}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Month" htmlFor="paper-month">
                    <Select id="paper-month" value={month} onChange={(e) => setMonth(e.target.value)}>
                      <option value="">Not sure</option>
                      {MONTH_NAMES.map((m, i) => (
                        <option key={m} value={i + 1}>
                          {m}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              ) : (
                <Field label="Unit or topic" htmlFor="paper-topic" hint="Optional. For example, Unit 3, or Trees and graphs.">
                  <Input
                    id="paper-topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    maxLength={80}
                    aria-describedby="paper-topic-hint"
                  />
                </Field>
              )}

              <Field label="File" htmlFor="paper-file" hint="One PDF, or a photo of each page (they're compressed and joined into one PDF).">
                <FilePicker id="paper-file" files={files} onChange={setFiles} describedBy="paper-file-hint" />
              </Field>
            </div>

            {error ? (
              <p role="alert" className="mt-4 text-small text-danger">
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex gap-2">
              <Button type="submit" loading={busy}>
                {busy ? "Uploading…" : SUBMIT_LABELS[kind]}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
