"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { matchesQuery } from "@/lib/course-work";
import { fieldClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { FileTypeTile } from "./FileTypeTile";

/** One file for the flat "All files" view, prepared on the server. */
export interface MaterialFile {
  key: string;
  name: string;
  /** Download through the app's file route. */
  href: string;
  /** Same route with view=1, for PDFs, images and text; else null. */
  viewHref: string | null;
  /** "PDF", "PPT", "DOC"… */
  type: string;
  /** "2.6 MB, updated 22 Sep" */
  meta: string;
  unitName: string;
  moduleName: string;
  search: string;
}

type View = "unit" | "files";

const link =
  "focusable rounded-sm text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary";

/** Opens every collapsed <details> around an element so an in-page link lands on something visible. */
function openAround(el: HTMLElement): void {
  // A unit's id sits on the <section>; its body is the details inside.
  el.querySelector<HTMLDetailsElement>(":scope > details")?.setAttribute("open", "");
  let d = el.closest("details");
  while (d) {
    d.open = true;
    d = d.parentElement?.closest("details") ?? null;
  }
}

function idFromHash(hash: string): string | null {
  if (hash.length < 2) return null;
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return hash.slice(1);
  }
}

/**
 * The course's study material in two views: "By unit" (the server-rendered
 * units, passed as children) and "All files" (one flat list of every file).
 * Only one view's file links are in the page at a time: the unit list is hidden
 * with the `hidden` attribute and the flat list is rendered only while it is
 * shown. "Search this course" filters both. Without JavaScript every unit
 * simply shows.
 */
export function CourseMaterials({
  total,
  files,
  nav,
  children,
}: {
  /** Items in the course other than text notes. */
  total: number;
  files: MaterialFile[];
  /** Unit navigator, or null when the course has a single unit. */
  nav: React.ReactNode;
  children: React.ReactNode;
}) {
  const [view, setView] = React.useState<View>("unit");
  const [query, setQuery] = React.useState("");
  const unitsRef = React.useRef<HTMLDivElement>(null);
  const statusRef = React.useRef<HTMLParagraphElement>(null);
  const emptyRef = React.useRef<HTMLDivElement>(null);
  const wasActive = React.useRef(false);
  /** An in-page link that had to switch view or clear the search first; scrolled to after render. */
  const pendingTarget = React.useRef<string | null>(null);

  const q = query.trim();
  const shownFiles = q ? files.filter((f) => matchesQuery(f.search, q)) : files;

  // Unit view: hide rows, groups and units that don't match the search.
  React.useEffect(() => {
    const root = unitsRef.current;
    if (!root) return;
    const active = q.length > 0;
    let shown = 0;

    root.querySelectorAll<HTMLElement>("[data-unit]").forEach((unit) => {
      let unitHas = false;
      unit.querySelectorAll<HTMLElement>("[data-module]").forEach((row) => {
        const ok = !active || matchesQuery(row.dataset.search ?? "", q);
        row.hidden = !ok;
        if (ok) {
          unitHas = true;
          if (row.dataset.kind !== "label") shown++;
        }
      });
      unit.querySelectorAll<HTMLElement>("[data-group]").forEach((g) => {
        g.hidden = active && !g.querySelector("[data-module]:not([hidden])");
      });
      unit.hidden = active && !unitHas;
      const body = unit.querySelector<HTMLDetailsElement>(":scope > details");
      if (body) {
        // Remember what the student had open, show matches while searching, then put it back.
        if (active && !wasActive.current) body.dataset.wasOpen = String(body.open);
        if (active) body.open = unitHas;
        else if (wasActive.current) body.open = body.dataset.wasOpen !== "false";
      }
    });
    wasActive.current = active;

    if (statusRef.current) {
      statusRef.current.textContent = active
        ? shown === 0
          ? "No matches."
          : `Showing ${shown} of ${total} ${total === 1 ? "item" : "items"}.`
        : "";
    }
    if (emptyRef.current) emptyRef.current.hidden = !active || shown > 0;
  }, [q, total]);

  // After a view switch or a cleared search, finish the in-page jump that triggered it.
  React.useEffect(() => {
    const id = pendingTarget.current;
    if (!id || view !== "unit") return;
    pendingTarget.current = null;
    const el = document.getElementById(id);
    if (!el) return;
    openAround(el);
    el.scrollIntoView();
    history.replaceState(null, "", `#${id}`);
  }, [view, q]);

  // In-page links (unit chips, quiz rows) must work when their target is collapsed or hidden.
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
      const id = a ? idFromHash(a.getAttribute("href") ?? "") : null;
      const el = id ? document.getElementById(id) : null;
      if (!id || !el || !unitsRef.current?.contains(el)) return;
      if (el.closest("[hidden]")) {
        // Behind the other view or filtered out: show it first, then jump.
        e.preventDefault();
        pendingTarget.current = id;
        setView("unit");
        setQuery("");
        return;
      }
      openAround(el);
    };
    const onHash = () => {
      const id = idFromHash(window.location.hash);
      const el = id ? document.getElementById(id) : null;
      if (el) openAround(el);
    };
    document.addEventListener("click", onClick);
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  const clear = () => setQuery("");

  return (
    <div className={cn(nav ? "lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10" : undefined)}>
      {nav ? (
        <div className="mb-6 min-w-0 lg:sticky lg:top-6 lg:mb-0 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto scrollbar-slim">
          {nav}
        </div>
      ) : null}

      <div className="min-w-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="group" aria-label="Materials" className="inline-flex self-start rounded-lg bg-muted p-1">
            {(
              [
                { key: "unit", label: "By unit", count: null },
                { key: "files", label: "All files", count: files.length },
              ] as const
            ).map((v) => {
              const pressed = view === v.key;
              return (
                <button
                  key={v.key}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setView(v.key)}
                  className={cn(
                    "focusable inline-flex min-h-10 items-center gap-1.5 rounded-md px-3.5 text-small font-semibold transition-colors lg:min-h-8",
                    pressed ? "bg-surface text-foreground shadow-rest" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v.label}
                  {v.count !== null ? <span className="tabular-nums opacity-70">{v.count}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="relative sm:w-64">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search this course"
              placeholder="Search this course"
              autoComplete="off"
              className={cn(fieldClass, "pl-9")}
            />
          </div>
        </div>

        {/* Two live regions: the unit view's is written by the effect above, the file view's by React. */}
        <p
          ref={statusRef}
          role="status"
          aria-live="polite"
          hidden={view !== "unit"}
          className="mt-2 min-h-5 text-small text-muted-foreground"
        />
        <p
          role="status"
          aria-live="polite"
          hidden={view !== "files"}
          className="mt-2 min-h-5 text-small text-muted-foreground"
        >
          {q
            ? shownFiles.length === 0
              ? "No matches."
              : `Showing ${shownFiles.length} of ${files.length} ${files.length === 1 ? "file" : "files"}.`
            : null}
        </p>

        <div className="mt-3">
          <div ref={unitsRef} hidden={view !== "unit"}>
            <div ref={emptyRef} hidden>
              <NoMatches onClear={clear} />
            </div>
            {children}
          </div>

          {view === "files" ? (
            <section aria-labelledby="all-files-h">
              <h2 id="all-files-h" className="sr-only">
                All files
              </h2>
              {files.length === 0 ? (
                <p className="text-body text-muted-foreground">No files have been posted in this course yet.</p>
              ) : shownFiles.length === 0 ? (
                <NoMatches onClear={clear} />
              ) : (
                <ul className="divide-y divide-border border-y border-border">
                  {shownFiles.map((f) => (
                    <li key={f.key} className="flex min-w-0 items-start gap-3 py-row">
                      <FileTypeTile type={f.type} />
                      <div className="min-w-0 flex-1">
                        <a
                          id={`all-${f.key}`}
                          href={f.href}
                          className={cn(
                            link,
                            "break-all text-body font-medium pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center",
                          )}
                        >
                          {f.name}
                        </a>
                        <p className="break-words text-small text-muted-foreground">{f.unitName}</p>
                        {f.meta ? <p className="text-small tabular-nums text-muted-foreground">{f.meta}</p> : null}
                      </div>
                      {f.viewHref ? (
                        <a
                          href={f.viewHref}
                          target="_blank"
                          rel="noopener"
                          aria-describedby={`all-${f.key}`}
                          className="focusable inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-small font-semibold text-primary hover:bg-muted lg:min-h-8"
                        >
                          View
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-xl bg-surface-2 px-5 py-6">
      <p className="font-display text-subheading font-semibold text-foreground">Nothing matches</p>
      <p className="mt-1 text-small text-muted-foreground">Try a different word, such as a unit number or a file name.</p>
      <button
        type="button"
        onClick={onClear}
        className="focusable mt-3 inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-small font-semibold text-accent-foreground hover:bg-accent/70 lg:min-h-9"
      >
        Clear search
      </button>
    </div>
  );
}
