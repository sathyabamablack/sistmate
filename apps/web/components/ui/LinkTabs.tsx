import Link from "@/components/ui/IntentLink";
import { cn } from "@/lib/utils";

/** Server-friendly tab strip: each tab is a link, the active one carries aria-current. */
export function LinkTabs({
  items,
  label,
  className,
}: {
  items: { href: string; label: string; active: boolean }[];
  label: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn("-mx-4 overflow-x-auto scrollbar-slim px-4 sm:mx-0 sm:px-0", className)}
    >
      <ul className="flex min-w-max gap-1.5">
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              scroll={false}
              aria-current={it.active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full px-4 text-small font-semibold transition-colors focusable lg:min-h-(--tab-h)",
                it.active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
