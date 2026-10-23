import * as React from "react";
import { FileText, Folder } from "lucide-react";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { cn } from "@/lib/utils";

/*
  Small static pictures for "What you get", drawn with the design tokens and
  sample data. Decorative: the text beside each one says the same thing.
*/

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div aria-hidden className={cn("w-full max-w-md rounded-xl bg-surface p-5 shadow-rest sm:p-6", className)}>
      {children}
    </div>
  );
}

const SUBJECTS = [
  { name: "Data Structures", pct: 92, note: "Can skip 4" },
  { name: "Computer Networks", pct: 79, note: "Can skip 1" },
  { name: "Discrete Mathematics", pct: 71, note: "Attend 3 more", low: true },
] as const;

function Hour({ state }: { state: "P" | "A" | "-" }) {
  return (
    <span
      className={cn(
        "grid h-7 w-7 place-items-center rounded-md text-micro font-semibold",
        state === "P" && "bg-success/12 text-success",
        state === "A" && "bg-danger/10 text-danger",
        state === "-" && "border border-dashed border-border text-muted-foreground",
      )}
    >
      {state}
    </span>
  );
}

export function SkipVisual() {
  return (
    <Frame>
      <ul className="space-y-4">
        {SUBJECTS.map((s) => {
          const low = "low" in s && s.low;
          return (
            <li key={s.name}>
              <div className="flex items-baseline justify-between gap-3 text-small">
                <span className="truncate font-medium">{s.name}</span>
                <span className={cn("font-display font-semibold tabular-nums", low && "text-danger")}>{s.pct}%</span>
              </div>
              <ProgressBar value={s.pct} tone={low ? "danger" : "primary"} markAt={80} className="mt-2" />
              <p className={cn("mt-1.5 text-micro font-medium", low ? "text-danger" : "text-muted-foreground")}>{s.note}</p>
            </li>
          );
        })}
      </ul>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-small">
        <div>
          <p className="text-micro font-medium text-muted-foreground">Today, daily</p>
          <p className="mt-1 font-semibold text-success">Present</p>
        </div>
        <div>
          <p className="text-micro font-medium text-muted-foreground">Today, hour-wise</p>
          <p className="mt-1 flex gap-1">
            <Hour state="P" />
            <Hour state="P" />
            <Hour state="A" />
            <Hour state="-" />
          </p>
        </div>
      </div>
    </Frame>
  );
}

export function NextVisual() {
  return (
    <Frame className="space-y-3">
      <div className="rounded-lg bg-accent p-4 text-accent-foreground">
        <div className="flex items-baseline justify-between text-small">
          <span className="font-semibold">Now</span>
          <span className="tabular-nums opacity-80">10:00 to 10:50</span>
        </div>
        <p className="mt-1 font-display text-heading font-semibold">Data Structures</p>
        <p className="text-small opacity-80">Room 402, 18 minutes left</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface/70">
          <div className="h-full w-[64%] rounded-full bg-primary" />
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-3 rounded-lg border border-border p-4">
        <div className="min-w-0">
          <p className="text-small font-semibold text-muted-foreground">Next</p>
          <p className="mt-0.5 font-display text-subheading font-semibold">Operating Systems</p>
          <p className="text-small text-muted-foreground">Room 311</p>
        </div>
        <span className="shrink-0 font-display text-subheading font-semibold tabular-nums">11:00</span>
      </div>
      <p className="px-1 text-small text-muted-foreground">Then Computer Networks at 1:30, lab until 4:10.</p>
    </Frame>
  );
}

const GPAS = [
  { sem: "1", gpa: 8.29 },
  { sem: "2", gpa: 8.48 },
  { sem: "3", gpa: 8.3 },
  { sem: "4", gpa: 8.61 },
] as const;

export function CgpaVisual() {
  // Bars start at 7.5 so the differences between semesters are visible.
  const h = (g: number) => `${((g - 7.5) / 2.5) * 100}%`;
  return (
    <Frame>
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="text-small font-medium text-muted-foreground">CGPA after 4 semesters</p>
          <p className="font-display text-[3.25rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">8.42</p>
        </div>
        <div className="flex h-20 items-end gap-2">
          {GPAS.map((g) => (
            <div key={g.sem} className="flex h-full w-7 flex-col items-center justify-end gap-1">
              <div className="w-full rounded-t-md bg-primary/80" style={{ height: h(g.gpa) }} />
              <span className="text-micro text-muted-foreground">{g.sem}</span>
            </div>
          ))}
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-border pt-4 text-small">
        <dt className="text-muted-foreground">Grades</dt>
        <dd className="flex flex-wrap gap-1.5">
          {["A++", "A+", "A+", "B++", "B+"].map((g, i) => (
            <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-micro font-semibold">
              {g}
            </span>
          ))}
        </dd>
        <dt className="text-muted-foreground">Planner</dt>
        <dd className="font-medium">To reach 8.5, average 8.66 over the next two semesters.</dd>
      </dl>
    </Frame>
  );
}

const FILES = [
  { name: "Unit 3 notes.pdf", size: "2.1 MB" },
  { name: "Congestion control slides.pdf", size: "4.8 MB" },
] as const;

export function NotesVisual() {
  return (
    <Frame>
      <p className="font-display text-subheading font-semibold">Computer Networks</p>
      <ul className="mt-3 divide-y divide-border border-y border-border text-small">
        <li className="flex items-center gap-2.5 py-2.5 text-muted-foreground">
          <Folder className="h-4 w-4 shrink-0" />
          Unit 2: Network layer
        </li>
        <li className="py-2.5">
          <p className="flex items-center gap-2.5 font-medium">
            <Folder className="h-4 w-4 shrink-0 text-primary" />
            Unit 3: Transport layer
          </p>
          <ul className="mt-2 space-y-1.5 pl-6.5">
            {FILES.map((f) => (
              <li key={f.name} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{f.name}</span>
                </span>
                <span className="shrink-0 text-micro tabular-nums text-muted-foreground">{f.size}</span>
              </li>
            ))}
          </ul>
        </li>
      </ul>
      <div className="mt-3 flex items-center justify-between gap-3 text-small">
        <span className="font-medium">Assignment 2</span>
        <span className="rounded-full bg-warning/14 px-2 py-0.5 text-micro font-semibold text-warning">Due Friday</span>
      </div>
    </Frame>
  );
}
