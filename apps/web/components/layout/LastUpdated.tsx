"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";

/**
 * "Updated 3 min ago" with a refresh action, in the top bar on every page. The age is worked out in
 * the browser and ticks every 30 s, so it stays right while the page sits open. Pressing it
 * refetches from the ERP.
 */
export function LastUpdated({
  fetchedAt,
  onRefresh,
  refreshing,
}: {
  fetchedAt?: string;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  // null until mounted, so the server HTML and the first browser render match.
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const age = now && fetchedAt ? relativeTime(fetchedAt, now, { pastOnly: true }) : "";
  const label = refreshing ? "Refreshing…" : age ? `Updated ${age}` : "Refresh";

  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={refreshing}
      aria-label={age ? `Data updated ${age}. Refresh data` : "Refresh data"}
      title="Refresh data"
      className="focusable inline-flex h-11 items-center gap-2 rounded-lg px-2.5 text-small text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60 lg:h-9"
    >
      <RefreshCw className={cn("h-[18px] w-[18px] shrink-0", refreshing && "animate-spin")} aria-hidden />
      <span className="hidden whitespace-nowrap sm:inline">{label}</span>
    </button>
  );
}
