"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ListFilter } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { MAX_HIDDEN_COURSES, updatePrefs, type CourseFilter, type Prefs } from "@/lib/prefs";
import { useTourState } from "@/components/tour/store";

export interface ChooserCourse {
  id: number;
  name: string;
  code: string;
  /** "Opened 3 hours ago", or null. */
  opened: string | null;
}

/**
 * Lets the student pick which Moodle courses are listed. Moodle returns courses
 * from every semester, so old subjects would otherwise clutter Courses, the
 * dashboard and the command palette. Saved in the preferences cookie.
 */
export function CourseChooser({
  courses,
  prefs,
  thisSemester,
  defaultOpen = false,
}: {
  courses: ChooserCourse[];
  prefs: Prefs;
  /** Ids matching this semester's ERP subjects by code or title. Empty when nothing matches. */
  thisSemester: number[];
  /** Opened from a link such as /courses?choose=1 (Settings). */
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const touring = useTourState().run !== null;
  const [open, setOpen] = React.useState(defaultOpen);
  const fromLink = React.useRef(defaultOpen);
  const [pending, startTransition] = React.useTransition();
  const shownNow = React.useCallback(() => {
    const hidden = new Set(prefs.hiddenCourses);
    return new Set(courses.filter((c) => !hidden.has(c.id)).map((c) => c.id));
  }, [courses, prefs.hiddenCourses]);
  const [checked, setChecked] = React.useState<Set<number>>(shownNow);
  const [filter, setFilter] = React.useState<CourseFilter>(prefs.courseFilter);
  const uid = React.useId();

  /** Leaves /courses?choose=1 once the dialog is done, so a reload doesn't reopen it. */
  const finish = (refresh: boolean) => {
    startTransition(() => {
      if (fromLink.current) {
        fromLink.current = false;
        router.replace("/courses", { scroll: false });
      } else if (refresh) {
        router.refresh();
      }
    });
  };

  const onOpenChange = (next: boolean) => {
    if (next) {
      setChecked(shownNow());
      setFilter(prefs.courseFilter);
    }
    setOpen(next);
    if (!next) finish(false);
  };

  const toggle = (id: number, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const save = () => {
    const listed = new Set(courses.map((c) => c.id));
    // Start from the cookie as it is now, so other preferences saved since this page rendered are kept.
    updatePrefs((current) => {
      // Keep hidden ids for courses the LMS didn't return this time.
      const kept = current.hiddenCourses.filter((id) => !listed.has(id));
      const hiddenCourses = [
        ...kept,
        ...courses.filter((c) => !checked.has(c.id)).map((c) => c.id),
      ].slice(0, MAX_HIDDEN_COURSES);
      return { hiddenCourses, courseFilter: filter };
    });
    setOpen(false);
    finish(true);
  };

  const noteId = `${uid}-note`;

  return (
    // During the walkthrough the chooser is not modal, so the tour's popover beside it stays usable and readable.
    <Dialog open={open} onOpenChange={onOpenChange} modal={!touring}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" loading={pending} data-tour="choose-courses">
          {pending ? null : <ListFilter className="h-4 w-4" aria-hidden />}
          Choose courses
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[80dvh] flex-col overflow-hidden" data-tour="course-chooser">
        <div className="px-5 pb-3 pt-5 pr-14">
          <DialogTitle className="text-heading font-semibold text-foreground">
            Choose courses
          </DialogTitle>
          <DialogDescription className="mt-1 text-body text-muted-foreground">
            The LMS lists every semester you have been enrolled in.
          </DialogDescription>
          <div role="radiogroup" aria-label="Which courses to list" className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              role="radio"
              aria-checked={filter === "current"}
              variant={filter === "current" ? "secondary" : "ghost"}
              size="sm"
              disabled={thisSemester.length === 0}
              aria-describedby={noteId}
              data-tour="this-semester"
              onClick={() => {
                setFilter("current");
                setChecked(new Set(thisSemester));
              }}
            >
              This semester
            </Button>
            <Button
              type="button"
              role="radio"
              aria-checked={filter === "all"}
              variant={filter === "all" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => {
                setFilter("all");
                setChecked(new Set(courses.map((c) => c.id)));
              }}
            >
              Every semester
            </Button>
          </div>
          <p id={noteId} className="mt-2 text-body text-muted-foreground">
            {thisSemester.length === 0
              ? "No course matches this semester's ERP subjects, so pick them by hand."
              : `This semester is the ${thisSemester.length} ${
                  thisSemester.length === 1 ? "course" : "courses"
                } on your attendance and timetable.`}
          </p>
        </div>

        {/* A <fieldset> will not shrink inside a flex column, so the scrolling lives on this wrapper. */}
        <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain border-y border-border px-5 py-2">
          <fieldset className="min-w-0">
            <legend className="sr-only">Courses to show</legend>
            <ul className="divide-y divide-border">
              {courses.map((c) => {
                const id = `${uid}-c${c.id}`;
                return (
                  <li key={c.id}>
                    <label
                      htmlFor={id}
                      className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg py-2.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                    >
                      <input
                        id={id}
                        type="checkbox"
                        checked={checked.has(c.id)}
                        onChange={(e) => toggle(c.id, e.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="block break-words text-body font-medium text-foreground">
                          {c.name}
                        </span>
                        <span className="block text-small text-muted-foreground">
                          <span className="tabular-nums">{c.code}</span>
                          {c.opened
                            ? `, ${c.opened.charAt(0).toLowerCase()}${c.opened.slice(1)}`
                            : null}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-4">
          <p
            className="mr-auto text-small tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            {checked.size} of {courses.length} shown
          </p>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" size="sm" onClick={save} data-tour="save-courses">
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
