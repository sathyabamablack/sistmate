"use client";

import Link from "@/components/ui/IntentLink";
import { usePathname } from "next/navigation";
import { NAV_GROUPS, NAV_ITEMS, isActivePath, navTourId } from "./nav";
import { cn } from "@/lib/utils";

/**
 * Desktop rail: icon over label, groups separated by a rule. The items are packed at their
 * least on a short window; any height beyond that is shared equally between the rows, so the
 * spacing opens up with the window for any number of items and nothing is ever pushed off the
 * bottom. Only a window too short for the packed rail scrolls (the nav in Sidebar).
 */
export function RailLinks() {
  const pathname = usePathname();

  return (
    <div className="flex min-h-[min(100%,46rem)] flex-col gap-1.5 [@media(min-height:760px)]:gap-3">
      {NAV_GROUPS.map((group, gi) => {
        const items = NAV_ITEMS.filter((i) => i.group === group && !i.skipInRail);
        return (
          <ul
            key={group}
            // Grow in proportion to the rows, so every row ends up the same height across groups.
            style={{ flexGrow: items.length }}
            className={cn(
              "flex flex-col",
              gi > 0 && "border-t border-border pt-1.5 [@media(min-height:760px)]:pt-3",
            )}
          >
            {items.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href} className="flex flex-1">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    data-tour={navTourId(item.href)}
                    className={cn(
                      "group flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-0.5 text-center text-micro focusable [@media(min-height:760px)]:gap-1 [@media(min-height:760px)]:py-1.5",
                      active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-6 w-12 place-items-center rounded-full transition-colors [@media(min-height:640px)]:h-7 [@media(min-height:760px)]:h-8",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "group-hover:bg-muted",
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    <span className="leading-tight">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        );
      })}
    </div>
  );
}

/** Grouped list used inside the phone "More" sheet. */
export function SheetLinks({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();

  return (
    <div className="space-y-5">
      {NAV_GROUPS.map((group) => (
        <div key={group}>
          <p className="mb-1 px-2 text-small font-medium text-muted-foreground">{group}</p>
          <ul className="grid grid-cols-1 gap-0.5 min-[480px]:grid-cols-2">
            {NAV_ITEMS.filter((i) => i.group === group && !i.skipInSheet).map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-lg px-2.5 text-body focusable",
                      active
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-foreground hover:bg-muted",
                    )}
                  >
                    <Icon
                      className={cn("h-[18px] w-[18px] shrink-0", !active && "text-muted-foreground")}
                      aria-hidden
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
