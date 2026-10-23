"use client";

import * as React from "react";
import Link from "@/components/ui/IntentLink";
import { Search } from "lucide-react";
import { matchesQuery } from "@/lib/course-work";
import { fieldClass } from "@/components/ui/field";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { cn } from "@/lib/utils";

export interface CourseCardData {
  id: number;
  name: string;
  code: string;
  category: string | null;
  /** Moodle's completion percentage, or null when the course doesn't track it. */
  progress: number | null;
  grade: string | null;
  /** "4 units, 9 files" when the course's contents are already loaded, else null. */
  materials: string | null;
  /** "Opened 3 hours ago", or null when Moodle doesn't say. */
  opened: string | null;
  /** Lower-case name, code and category for the search box. */
  search: string;
}

/** The search box appears only when there are enough courses to need it. */
const SEARCH_FROM = 5;

/**
 * The course list as a grid of cards: one column on phones, two at md, three at
 * xl. Each card has a single link (the course name), stretched over the card.
 */
export function CourseGrid({ cards }: { cards: CourseCardData[] }) {
  const [query, setQuery] = React.useState("");
  const q = query.trim();
  const shown = q ? cards.filter((c) => matchesQuery(c.search, q)) : cards;

  return (
    <section aria-label="Your courses">
      {cards.length >= SEARCH_FROM ? (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:w-72">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search courses"
              placeholder="Search by name or code"
              autoComplete="off"
              className={cn(fieldClass, "pl-9")}
            />
          </div>
          <p role="status" aria-live="polite" className="text-small text-muted-foreground">
            {q ? `${shown.length} of ${cards.length} ${cards.length === 1 ? "course" : "courses"} match` : ""}
          </p>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <div className="rounded-xl bg-surface-2 px-5 py-6">
          <p className="font-display text-subheading font-semibold text-foreground">No course matches</p>
          <p className="mt-1 text-small text-muted-foreground">Try part of the course name or its code.</p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="focusable mt-3 inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-small font-semibold text-accent-foreground hover:bg-accent/70 lg:min-h-9"
          >
            Clear search
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => (
            <CourseCard key={c.id} c={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CourseCard({ c }: { c: CourseCardData }) {
  return (
    <li className="relative flex min-w-0 flex-col rounded-xl bg-surface p-4 shadow-rest transition-colors hover:bg-surface-2/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring sm:p-5">
      <p className="flex min-w-0 flex-wrap gap-x-3 text-small text-muted-foreground">
        <span className="font-medium tabular-nums text-foreground/80">{c.code}</span>
        {c.category ? <span className="min-w-0 break-words">{c.category}</span> : null}
      </p>
      <h2 className="mt-1 break-words font-display text-subheading font-semibold text-foreground">
        <Link
          href={`/courses/${c.id}`}
          className="rounded-sm outline-hidden after:absolute after:inset-0 after:rounded-xl after:content-['']"
        >
          {c.name}
        </Link>
      </h2>

      <div className="mt-auto pt-4">
        {c.progress === null ? (
          <p className="text-small text-muted-foreground">Progress not tracked</p>
        ) : (
          <div className="flex items-center gap-3">
            <ProgressBar value={c.progress} className="h-1.5 flex-1" aria-label={`${c.name} progress`} />
            <span className="w-10 shrink-0 text-right text-small font-semibold tabular-nums text-foreground">
              {c.progress}%
            </span>
          </div>
        )}
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-small text-muted-foreground">
          {c.grade ? (
            <span>
              Grade <span className="font-medium tabular-nums text-foreground">{c.grade}</span>
            </span>
          ) : null}
          {c.materials ? <span className="tabular-nums">{c.materials}</span> : null}
          {c.opened ? <span>{c.opened}</span> : null}
        </p>
      </div>
    </li>
  );
}
