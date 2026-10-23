"use client";

import * as React from "react";
import Link from "@/components/ui/IntentLink";
import { Search, Bell } from "lucide-react";
import type { Notification } from "@usp/core";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { groupNotices } from "@/lib/notice-format";
import { NoticeRow } from "./NoticeRow";

type Filter = "all" | "unread" | "erp" | "lms";

export function NoticeFeed({
  notifications,
  nowIso,
  lmsConnected,
}: {
  notifications: Notification[];
  nowIso: string;
  lmsConnected: boolean;
}) {
  const now = React.useMemo(() => new Date(nowIso), [nowIso]);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [open, setOpen] = React.useState<ReadonlySet<string>>(new Set());
  const [seen, setSeen] = React.useState<ReadonlySet<string>>(new Set());

  const sorted = React.useMemo(
    () => [...notifications].sort((a, b) => b.date.localeCompare(a.date)),
    [notifications],
  );
  const isUnread = (n: Notification) => !n.read && !seen.has(n.id);

  const counts = {
    all: sorted.length,
    unread: sorted.filter(isUnread).length,
    erp: sorted.filter((n) => n.source === "erp").length,
    lms: sorted.filter((n) => n.source === "lms").length,
  };
  const hasUnreadAtAll = notifications.some((n) => !n.read);

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    ...(hasUnreadAtAll ? [{ key: "unread" as const, label: "Unread" }] : []),
    { key: "erp", label: "ERP" },
    { key: "lms", label: "LMS" },
  ];
  const activeFilter = filters.some((f) => f.key === filter) ? filter : "all";

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((n) => {
      if (activeFilter === "unread" && (n.read || seen.has(n.id))) return false;
      if (activeFilter === "erp" && n.source !== "erp") return false;
      if (activeFilter === "lms" && n.source !== "lms") return false;
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) || (n.body?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [sorted, query, activeFilter, seen]);

  const groups = React.useMemo(() => groupNotices(filtered, now), [filtered, now]);

  const toggle = (n: Notification) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(n.id)) next.delete(n.id);
      else next.add(n.id);
      return next;
    });
    if (!n.read) setSeen((prev) => new Set(prev).add(n.id));
  };

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="No notices yet"
        description={
          lmsConnected
            ? "Nothing has been posted on the ERP or LMS for you. New notices show up here as soon as they are published."
            : "Nothing has been posted on the ERP for you, and your LMS isn't connected."
        }
        className="max-w-3xl"
      />
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles and text"
            aria-label="Search notifications"
            className="pl-9"
          />
        </div>

        <div role="group" aria-label="Filter notifications" className="flex flex-wrap gap-2">
          {filters.map((f) => {
            const active = activeFilter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-small font-medium transition-colors focusable lg:min-h-9",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "text-micro font-normal tabular-nums",
                    active ? "text-primary-foreground/80" : "text-muted-foreground",
                  )}
                >
                  {counts[f.key]}
                </span>
              </button>
            );
          })}
        </div>

        {!lmsConnected ? (
          <p className="text-small text-muted-foreground">
            Your LMS isn&apos;t connected, so only ERP notices are listed. To add LMS notices, go
            to the{" "}
            <Link
              href="/"
              className="rounded-sm font-medium text-primary underline underline-offset-4 focusable"
            >
              dashboard
            </Link>{" "}
            and sign in again from the Connect LMS card.
          </p>
        ) : null}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {filtered.length} of {notifications.length} notices shown
      </p>

      {groups.length > 0 ? (
        groups.map((g) => (
          <section key={g.key} aria-labelledby={`notices-${g.key}`}>
            <h2
              id={`notices-${g.key}`}
              className="mb-2 flex items-baseline gap-2 text-subheading font-semibold text-foreground"
            >
              {g.label}
              <span className="text-small font-normal tabular-nums text-muted-foreground">
                {g.items.length}
              </span>
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-rest">
              {g.items.map((n) => (
                <NoticeRow
                  key={n.id}
                  notice={n}
                  group={g.key}
                  now={now}
                  unread={isUnread(n)}
                  open={open.has(n.id)}
                  onToggle={() => toggle(n)}
                />
              ))}
            </ul>
          </section>
        ))
      ) : (
        <EmptyState
          icon={Bell}
          title="No matching notifications"
          description={
            query.trim()
              ? `Nothing contains "${query.trim()}" in this view. Try fewer words, or switch the filter to All.`
              : "Nothing in this view. Switch the filter to All to see every notice."
          }
        />
      )}
    </div>
  );
}
