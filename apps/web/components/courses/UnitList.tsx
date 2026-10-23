import * as React from "react";
import Link from "@/components/ui/IntentLink";
import {
  ChevronDown,
  ClipboardList,
  Folder,
  Info,
  Link2,
  ListChecks,
  MessagesSquare,
  Puzzle,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import type { CourseFile, CourseModule, CourseSection } from "@usp/core";
import { cn } from "@/lib/utils";
import { groupModules, moduleSearchText, quizLine, unitAnchor, unitStats } from "@/lib/course-work";
import { FileTypeTile } from "./FileTypeTile";
import { RichText } from "./RichText";
import { assignmentState, fileHref, fileTypeShort, formatDay, formatSize, isViewable } from "./format";

const link =
  "focusable rounded-sm text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary";
const touch = "pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center";
const titleClass = "break-words text-body font-medium text-foreground";

function hostOf(href: string): string {
  try {
    return new URL(href).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function IconTile({ Icon }: { Icon: LucideIcon }) {
  return (
    <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
      <Icon className="h-4 w-4" />
    </span>
  );
}

/** Moodle's own dates for a module ("Opened 6 Oct", "Added 2 Aug"). */
function datesText(m: CourseModule, now: Date): string {
  return m.dates.map((d) => `${d.label} ${formatDay(d.date, now)}`).join(", ");
}

/** Shared data-* hooks the search island (CourseMaterials) reads. */
function rowData(m: CourseModule, unitName: string) {
  return { "data-module": "", "data-kind": m.kind, "data-search": moduleSearchText(m, unitName) };
}

/* ---------------------------------- files --------------------------------- */

function FileRow({ f, courseId, cmid, index, now }: { f: CourseFile; courseId: number; cmid: number; index: number; now: Date }) {
  const nameId = `file-${cmid}-${index}`;
  const meta = [formatSize(f.size), f.modified ? `updated ${formatDay(f.modified, now)}` : ""].filter(Boolean).join(", ");
  return (
    <li className="flex min-w-0 items-start gap-3">
      <FileTypeTile type={fileTypeShort(f)} />
      <div className="min-w-0 flex-1">
        <a id={nameId} href={fileHref(courseId, cmid, "files", index)} className={cn(link, touch, "break-all text-body font-medium")}>
          {f.name}
        </a>
        {meta ? <p className="text-small tabular-nums text-muted-foreground">{meta}</p> : null}
      </div>
      {isViewable(f) ? (
        <a
          href={fileHref(courseId, cmid, "files", index, true)}
          target="_blank"
          rel="noopener"
          aria-describedby={nameId}
          className="focusable inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-small font-semibold text-primary hover:bg-muted lg:min-h-8"
        >
          View
        </a>
      ) : null}
    </li>
  );
}

function FileModule({ m, courseId, unitName, now }: { m: Extract<CourseModule, { kind: "resource" | "folder" }>; courseId: number; unitName: string; now: Date }) {
  const dates = datesText(m, now);
  return (
    <li {...rowData(m, unitName)} id={`module-${m.id}`} className="scroll-mt-24 py-row">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        {m.kind === "folder" ? <Folder aria-hidden className="h-4 w-4 shrink-0 self-center text-muted-foreground" /> : null}
        <span className={titleClass}>{m.name}</span>
        {m.kind === "folder" ? (
          <span className="text-small text-muted-foreground">
            Folder, {m.files.length} {m.files.length === 1 ? "file" : "files"}
          </span>
        ) : null}
        {dates ? <span className="text-small tabular-nums text-muted-foreground">{dates}</span> : null}
      </p>
      <RichText blocks={m.description} className="mt-1 text-muted-foreground" />
      {m.files.length > 0 ? (
        <ul className="mt-2.5 space-y-2.5">
          {m.files.map((f, i) => (
            <FileRow key={i} f={f} courseId={courseId} cmid={m.id} index={i} now={now} />
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-small text-muted-foreground">No files in this {m.kind === "folder" ? "folder" : "resource"}.</p>
      )}
    </li>
  );
}

/* ----------------------------- pages and links ---------------------------- */

function PageModule({ m, unitName, now }: { m: Extract<CourseModule, { kind: "page" | "url" }>; unitName: string; now: Date }) {
  const dates = datesText(m, now);
  return (
    <li {...rowData(m, unitName)} id={`module-${m.id}`} className="flex scroll-mt-24 gap-3 py-row">
      <IconTile Icon={m.kind === "page" ? ScrollText : Link2} />
      <div className="min-w-0 flex-1">
        {m.kind === "page" ? (
          <details className="group">
            <summary className="focusable -ml-1 flex cursor-pointer list-none items-start gap-2 rounded-sm py-0.5 pl-1 pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden
                className="mt-2 inline-block h-1.5 w-1.5 shrink-0 -rotate-45 border-b border-r border-muted-foreground transition-transform group-open:rotate-45"
              />
              <span className={titleClass}>{m.name}</span>
              <span className="mt-0.5 shrink-0 text-small text-muted-foreground group-open:hidden">Read</span>
            </summary>
            {dates ? <p className="text-small tabular-nums text-muted-foreground">{dates}</p> : null}
            <div className="mt-2 border-l border-border pl-4">
              <RichText blocks={m.content.length > 0 ? m.content : m.description} />
              {m.content.length === 0 && m.description.length === 0 ? (
                <p className="text-body text-muted-foreground">This page has no text.</p>
              ) : null}
            </div>
          </details>
        ) : (
          <>
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <a href={m.href} target="_blank" rel="noopener noreferrer" className={cn(link, touch, "break-all text-body font-medium")}>
                {m.name}
              </a>
              <span className="text-small text-muted-foreground">{hostOf(m.href)}</span>
              {dates ? <span className="text-small tabular-nums text-muted-foreground">{dates}</span> : null}
            </p>
            <RichText blocks={m.description} className="mt-1 text-muted-foreground" />
          </>
        )}
      </div>
    </li>
  );
}

/* --------------------------------- quizzes -------------------------------- */

function QuizModule({ m, unitName, now }: { m: Extract<CourseModule, { kind: "quiz" }>; unitName: string; now: Date }) {
  const q = quizLine(m, now);
  return (
    <li {...rowData(m, unitName)} id={`module-${m.id}`} className="flex scroll-mt-24 gap-3 py-row">
      <IconTile Icon={ListChecks} />
      <div className="min-w-0 flex-1">
        <p className={titleClass}>{m.name}</p>
        <p className="text-small tabular-nums text-muted-foreground">{[q.state, q.extra].filter(Boolean).join(". ")}</p>
        <RichText blocks={m.description} className="mt-1 text-muted-foreground" />
      </div>
    </li>
  );
}

/* ----------------------------- other activities --------------------------- */

const OTHER: Record<string, { label: string; Icon: LucideIcon }> = {
  assign: { label: "Assignment", Icon: ClipboardList },
  forum: { label: "Forum", Icon: MessagesSquare },
  other: { label: "Activity", Icon: Puzzle },
};

/** Assignments, forums and the rest: one quiet line each, nothing highlighted. */
function OtherModule({ m, courseId, unitName, now }: { m: CourseModule; courseId: number; unitName: string; now: Date }) {
  const { label, Icon } = OTHER[m.kind] ?? OTHER.other!;
  let title: React.ReactNode = <span className="font-medium text-foreground">{m.name}</span>;
  let status = "";
  if (m.kind === "assign") {
    if (m.assignment) {
      title = (
        <Link href={`/courses/${courseId}/assignments/${m.assignment.id}`} className={cn(link, touch, "font-medium")}>
          {m.assignment.name}
        </Link>
      );
      status = assignmentState(m.assignment, now).label;
    } else {
      status = "Details couldn't be loaded";
    }
  } else if (m.kind === "other") {
    status = `${m.modName}, not shown in the app yet`;
  }
  return (
    <li {...rowData(m, unitName)} id={`module-${m.id}`} className="flex scroll-mt-24 items-start gap-2.5 py-2 text-small">
      <Icon aria-hidden className="mt-[3px] h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 break-words">
        {title}
        <span className="text-muted-foreground">
          {" "}
          {label}
          {status ? <>, {status}</> : null}
        </span>
      </p>
    </li>
  );
}

function ModuleItem({ m, courseId, unitName, now }: { m: CourseModule; courseId: number; unitName: string; now: Date }) {
  switch (m.kind) {
    case "resource":
    case "folder":
      return <FileModule m={m} courseId={courseId} unitName={unitName} now={now} />;
    case "page":
    case "url":
      return <PageModule m={m} unitName={unitName} now={now} />;
    case "quiz":
      return <QuizModule m={m} unitName={unitName} now={now} />;
    case "label":
      return null;
    default:
      return <OtherModule m={m} courseId={courseId} unitName={unitName} now={now} />;
  }
}

/* ---------------------------------- units --------------------------------- */

function countsText(items: number, files: number): string {
  if (items === 0) return "Overview";
  const parts = [`${items} ${items === 1 ? "item" : "items"}`];
  if (files > 0) parts.push(`${files} ${files === 1 ? "file" : "files"}`);
  return parts.join(", ");
}

/**
 * The course's units as study sections. Each unit's h2 stays outside its
 * <details>, so it remains in the outline when the unit is collapsed. Units start
 * open: the material is what students come for. Inside, items are grouped by
 * kind (files, pages and links, quizzes, other activities), course order kept.
 */
export function UnitList({ sections, courseId, now }: { sections: CourseSection[]; courseId: number; now: Date }) {
  return (
    <div className="space-y-10">
      {sections.map((s) => {
        const anchor = unitAnchor(s);
        const st = unitStats(s);
        const { notes, groups } = groupModules(s.modules);
        return (
          <section key={s.id} id={anchor} data-unit="" aria-labelledby={`${anchor}-h`} className="scroll-mt-24">
            <h2 id={`${anchor}-h`} className="break-words text-heading font-semibold text-foreground">
              {s.name}
            </h2>
            <details open className="group/unit">
              <summary className="focusable -mx-2 mt-1 flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 text-small text-muted-foreground hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
                <span className="tabular-nums">{countsText(st.items, st.files)}</span>
                <span className="ml-auto inline-flex items-center gap-1">
                  <span className="group-open/unit:hidden">Show</span>
                  <span className="hidden group-open/unit:inline">Hide</span>
                  <ChevronDown aria-hidden className="h-4 w-4 transition-transform group-open/unit:rotate-180" />
                </span>
              </summary>

              <div className="mt-3 space-y-6">
                {s.summary.length > 0 ? <RichText blocks={s.summary} className="text-muted-foreground" /> : null}

                {notes.length > 0 ? (
                  <ul className="space-y-2">
                    {notes.map((m) => (
                      <li
                        key={m.id}
                        {...rowData(m, s.name)}
                        className="flex gap-2.5 rounded-lg bg-surface-2 px-3 py-2.5 text-body"
                      >
                        <Info aria-hidden className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                        <RichText blocks={m.description} className="min-w-0" />
                      </li>
                    ))}
                  </ul>
                ) : null}

                {groups.map((g) => (
                  <div key={g.key} data-group="">
                    <h3 className="text-small font-semibold text-muted-foreground">{g.label}</h3>
                    <ul className={cn("mt-1 divide-y divide-border", g.key === "other" && "divide-y-0")}>
                      {g.modules.map((m) => (
                        <ModuleItem key={m.id} m={m} courseId={courseId} unitName={s.name} now={now} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          </section>
        );
      })}
    </div>
  );
}
