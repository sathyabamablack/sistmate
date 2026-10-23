"use client";

import * as React from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { BookOpen, Compass, ExternalLink, Megaphone, RefreshCw, Search } from "lucide-react";
import { NAV_ITEMS } from "./nav";
import { safeHttpUrl } from "./external-links";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { useStartTour } from "@/components/tour/store";

export interface PaletteCourse {
  id: number;
  name: string;
}

export interface PaletteNotice {
  id: string;
  title: string;
  source: "erp" | "lms";
}

const groupClass =
  "px-1 pb-1 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-micro **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground";

const itemClass =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-body text-foreground aria-selected:bg-muted sm:min-h-10";

const EMPTY_COURSE_LIMIT = 6;

export function CommandPalette({
  open,
  onOpenChange,
  onRefresh,
  courses = [],
  notices = [],
  erpUrl,
  lmsUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh?: () => void;
  courses?: PaletteCourse[];
  notices?: PaletteNotice[];
  erpUrl?: string;
  lmsUrl?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        placement="center"
        closeButton={false}
        aria-describedby={undefined}
        // Sits above the walkthrough (z-60), so it stays usable while a tour step is showing.
        data-tour-allow
        className="z-60 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Search the portal</DialogTitle>
        <PaletteBody
          onOpenChange={onOpenChange}
          onRefresh={onRefresh}
          courses={courses}
          notices={notices}
          erpUrl={erpUrl}
          lmsUrl={lmsUrl}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while the dialog is open, so the query resets every time. */
function PaletteBody({
  onOpenChange,
  onRefresh,
  courses,
  notices,
  erpUrl,
  lmsUrl,
}: {
  onOpenChange: (open: boolean) => void;
  onRefresh?: () => void;
  courses: PaletteCourse[];
  notices: PaletteNotice[];
  erpUrl?: string;
  lmsUrl?: string;
}) {
  const router = useRouter();
  const startTour = useStartTour();
  const [search, setSearch] = React.useState("");
  const searching = search.trim().length > 0;

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  const openExternal = (href: string) => window.open(href, "_blank", "noopener,noreferrer");
  const externals = [
    { label: "Open ERP", keywords: "Sathyabama portal", href: safeHttpUrl(erpUrl) },
    { label: "Open LMS", keywords: "courses assignments", href: safeHttpUrl(lmsUrl) },
  ].filter((e): e is { label: string; keywords: string; href: string } => Boolean(e.href));

  return (
    <Command label="Search the portal" loop>
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <Command.Input
          autoFocus
          value={search}
          onValueChange={setSearch}
          placeholder="Jump to a page…"
          className="h-12 w-full bg-transparent text-base text-foreground outline-hidden placeholder:text-muted-foreground sm:text-body"
        />
        <kbd className="hidden rounded-md bg-muted px-1.5 py-0.5 font-sans text-micro font-medium text-muted-foreground sm:block">
          Esc
        </kbd>
      </div>
      <Command.List className="max-h-[min(22rem,60dvh)] overflow-y-auto scrollbar-slim p-2">
        <Command.Empty className="px-3 py-8 text-center text-small text-muted-foreground">
          No matches
        </Command.Empty>

        <Command.Group heading="Pages" className={groupClass}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Command.Item
                key={item.href}
                value={`${item.label} ${item.description}`}
                onSelect={() => run(() => router.push(item.href))}
                className={itemClass}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="shrink-0">{item.label}</span>
                <span className="hidden min-w-0 flex-1 truncate text-small text-muted-foreground sm:block">
                  {item.description}
                </span>
              </Command.Item>
            );
          })}
        </Command.Group>

        {courses.length > 0 ? (
          <Command.Group heading="Courses" className={groupClass}>
            {(searching ? courses : courses.slice(0, EMPTY_COURSE_LIMIT)).map((course) => (
              <Command.Item
                key={course.id}
                value={`course ${course.id} ${course.name}`}
                onSelect={() => run(() => router.push(`/courses/${course.id}`))}
                className={itemClass}
              >
                <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{course.name}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}

        {/* Browse-only: recent notices show before you type, so a query like "time" lands on pages first. */}
        {!searching && notices.length > 0 ? (
          <Command.Group heading="Recent notices" className={groupClass}>
            {notices.map((notice) => (
              <Command.Item
                key={notice.id}
                value={`notice ${notice.id} ${notice.title}`}
                onSelect={() => run(() => router.push("/notifications"))}
                className={itemClass}
              >
                <Megaphone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{notice.title}</span>
                <span className="shrink-0 text-small text-muted-foreground">
                  {notice.source === "lms" ? "LMS" : "ERP"}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}

        <Command.Group heading="Actions" className={groupClass}>
          {onRefresh ? (
            <Command.Item
              value="Refresh data reload sync"
              onSelect={() => run(onRefresh)}
              className={itemClass}
            >
              <RefreshCw className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="flex-1">Refresh data</span>
            </Command.Item>
          ) : null}
          {externals.map((e) => (
            <Command.Item
              key={e.label}
              value={`${e.label} ${e.keywords}`}
              onSelect={() => run(() => openExternal(e.href))}
              className={itemClass}
            >
              <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="flex-1">
                {e.label}
                <span className="sr-only"> (opens in a new tab)</span>
              </span>
            </Command.Item>
          ))}
          <Command.Item
            value="Take the tour walkthrough getting started guide help"
            onSelect={() => run(startTour)}
            className={itemClass}
          >
            <Compass className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex-1">Take the tour</span>
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command>
  );
}
