import Link from "@/components/ui/IntentLink";
import { RailLinks } from "./NavLinks";
import { Logo } from "@/components/ui/Logo";

/**
 * Desktop rail (lg and up). Fixed width, no collapse state, so there is nothing
 * to flash on load. Hidden with display:none below lg, where the tab bar takes over.
 */
export function Sidebar() {
  return (
    <div className="fixed inset-y-0 left-0 z-30 hidden w-22 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-14 shrink-0 items-center justify-center">
        <Link href="/" aria-label="Student Portal home" className="rounded-lg focusable">
          <Logo className="h-8 w-8" />
        </Link>
      </div>
      {/* RailLinks shares spare height between the rows. A window too short for the packed rail scrolls, with a slim bar. */}
      <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-1 scrollbar-slim">
        <RailLinks />
      </nav>
    </div>
  );
}
