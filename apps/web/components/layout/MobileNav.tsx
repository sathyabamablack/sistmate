"use client";

import * as React from "react";
import Link from "@/components/ui/IntentLink";
import { usePathname } from "next/navigation";
import { ExternalLink, Heart, Menu } from "lucide-react";
import { TAB_ITEMS, isActivePath, navTourId } from "./nav";
import { SheetLinks } from "./NavLinks";
import { EXTERNAL_LINK_PROPS, safeHttpUrl } from "./external-links";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";

/**
 * Phone navigation (below lg): a fixed bottom tab bar with the four everyday
 * pages, and a "More" button that opens a bottom sheet listing every page.
 * The whole bar is display:none at lg and up, where the rail takes over.
 */
export function MobileNav({
  moreOpen,
  onMoreOpenChange,
  erpUrl,
  lmsUrl,
}: {
  moreOpen: boolean;
  onMoreOpenChange: (open: boolean) => void;
  erpUrl?: string;
  lmsUrl?: string;
}) {
  const portals = [
    { label: "Open ERP", href: safeHttpUrl(erpUrl) },
    { label: "Open LMS", href: safeHttpUrl(lmsUrl) },
  ].filter((p): p is { label: string; href: string } => Boolean(p.href));
  const pathname = usePathname();
  // "More" reads as selected when the current page is one only the sheet lists.
  const inMore = !TAB_ITEMS.some((i) => isActivePath(pathname, i.href));

  // The sheet is a phone affordance; close it if the window grows into the rail layout.
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) onMoreOpenChange(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [onMoreOpenChange]);

  return (
    <Dialog open={moreOpen} onOpenChange={onMoreOpenChange}>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-safe lg:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {TAB_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  data-tour={navTourId(item.href)}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 text-micro focusable",
                    active ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  <TabIcon active={active}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </TabIcon>
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <DialogTrigger asChild>
              <button
                type="button"
                aria-label="Open navigation"
                className={cn(
                  "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-micro focusable",
                  inMore ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                <TabIcon active={inMore}>
                  <Menu className="h-5 w-5" aria-hidden />
                </TabIcon>
                <span aria-hidden>More</span>
              </button>
            </DialogTrigger>
          </li>
        </ul>
      </nav>

      <DialogContent placement="bottom" className="p-4 pt-5 lg:hidden" aria-describedby={undefined}>
        <DialogTitle className="px-2 font-display text-heading font-semibold">Navigation</DialogTitle>
        <Link
          href="/support"
          onClick={() => onMoreOpenChange(false)}
          aria-current={isActivePath(pathname, "/support") ? "page" : undefined}
          className="mt-3 flex min-h-14 items-center gap-3 rounded-lg bg-accent px-3 py-2 text-accent-foreground focusable"
        >
          <Heart className="h-[18px] w-[18px] shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="block text-body font-semibold">Support the portal</span>
            <span className="block text-small opacity-80">Free, and made by a student. Chip in.</span>
          </span>
        </Link>
        <nav aria-label="All pages" className="mt-4">
          <SheetLinks onNavigate={() => onMoreOpenChange(false)} />
        </nav>
        {portals.length > 0 ? (
          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-1 px-2 text-small font-medium text-muted-foreground">Original portals</p>
            <ul className="grid grid-cols-1 gap-0.5 min-[480px]:grid-cols-2">
              {portals.map((p) => (
                <li key={p.label}>
                  <a
                    href={p.href}
                    {...EXTERNAL_LINK_PROPS}
                    className="flex min-h-11 items-center gap-3 rounded-lg px-2.5 text-body text-foreground hover:bg-muted focusable"
                  >
                    <ExternalLink className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />
                    <span>
                      {p.label}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TabIcon({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "grid h-7 w-14 place-items-center rounded-full transition-colors",
        active && "bg-accent text-accent-foreground",
      )}
    >
      {children}
    </span>
  );
}
