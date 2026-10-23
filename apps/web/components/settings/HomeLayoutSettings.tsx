"use client";

import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import {
  DASHBOARD_SECTIONS,
  HOME_PAGES,
  type DashboardSection,
  type HomePage,
} from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { usePrefsContext } from "./PrefsProvider";
import { SettingGroup } from "./SettingGroup";

const HOME_LABELS: Record<HomePage, string> = {
  "/": "Dashboard",
  "/attendance": "Attendance",
  "/timetable": "Timetable",
  "/courses": "Courses",
  "/notifications": "Notifications",
};

const SECTION_LABELS: Record<DashboardSection, string> = {
  today: "Today",
  glance: "At a glance",
  attendance: "Attendance",
  due: "Due soon",
  notices: "Notices",
  courses: "Courses",
};

/** Start page and the dashboard's section order and visibility. Reordering works by keyboard. */
export function HomeLayoutSettings() {
  const { prefs, update } = usePrefsContext();
  const uid = React.useId();
  const [announcement, setAnnouncement] = React.useState("");
  const { order, hidden } = prefs.dashboard;

  function setDashboard(next: { order: DashboardSection[]; hidden: DashboardSection[] }) {
    update({ dashboard: next });
  }

  function move(section: DashboardSection, delta: -1 | 1) {
    const from = order.indexOf(section);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, section);
    setDashboard({ order: next, hidden });
    setAnnouncement(`${SECTION_LABELS[section]} moved to position ${to + 1} of ${next.length}.`);
  }

  function toggle(section: DashboardSection, show: boolean) {
    const nextHidden = show ? hidden.filter((s) => s !== section) : [...hidden, section];
    setDashboard({ order, hidden: nextHidden });
    setAnnouncement(`${SECTION_LABELS[section]} ${show ? "shown" : "hidden"}.`);
  }

  const isDefaultLayout =
    hidden.length === 0 && order.every((s, i) => s === DASHBOARD_SECTIONS[i]);

  return (
    <div className="space-y-8">
      <SettingGroup
        id={`${uid}-home`}
        title="Start page"
        hint="The page the portal opens on after you sign in."
      >
        {() => (
          <div className="max-w-xs">
            <label htmlFor={`${uid}-home-select`} className="sr-only">
              Start page
            </label>
            <Select
              id={`${uid}-home-select`}
              value={prefs.home}
              onChange={(e) => update({ home: e.target.value as HomePage })}
            >
              {HOME_PAGES.map((page) => (
                <option key={page} value={page}>
                  {HOME_LABELS[page]}
                </option>
              ))}
            </Select>
          </div>
        )}
      </SettingGroup>

      <SettingGroup
        id={`${uid}-sections`}
        title="Dashboard sections"
        hint="Untick a section to hide it. Use the arrows to change the order."
      >
        {(labelId) => (
          <div className="space-y-3">
            <ul
              aria-labelledby={labelId}
              className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface"
            >
              {order.map((section, i) => {
                const shown = !hidden.includes(section);
                const name = SECTION_LABELS[section];
                const checkId = `${uid}-show-${section}`;
                return (
                  <li key={section} className="flex items-center gap-2 py-1 pr-2 pl-3">
                    <label
                      htmlFor={checkId}
                      className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3"
                    >
                      <input
                        id={checkId}
                        type="checkbox"
                        checked={shown}
                        onChange={(e) => toggle(section, e.target.checked)}
                        aria-label={`Show ${name}`}
                        className="h-5 w-5 shrink-0 cursor-pointer accent-primary"
                      />
                      <span
                        className={cn(
                          "text-body font-medium",
                          shown ? "text-foreground" : "text-muted-foreground line-through",
                        )}
                      >
                        {name}
                      </span>
                      {!shown ? <span className="text-small text-muted-foreground">Hidden</span> : null}
                    </label>
                    <span className="text-small tabular-nums text-muted-foreground" aria-hidden>
                      {i + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${name} up`}
                      aria-disabled={i === 0 || undefined}
                      className={cn(i === 0 && "opacity-40")}
                      onClick={() => move(section, -1)}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${name} down`}
                      aria-disabled={i === order.length - 1 || undefined}
                      className={cn(i === order.length - 1 && "opacity-40")}
                      onClick={() => move(section, 1)}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
            <p role="status" aria-live="polite" className="sr-only">
              {announcement}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-disabled={isDefaultLayout || undefined}
              className={cn(isDefaultLayout && "opacity-50")}
              onClick={() => {
                if (isDefaultLayout) return;
                setDashboard({ order: [...DASHBOARD_SECTIONS], hidden: [] });
                setAnnouncement("Dashboard sections restored to the default order.");
              }}
            >
              Restore default layout
            </Button>
          </div>
        )}
      </SettingGroup>
    </div>
  );
}
