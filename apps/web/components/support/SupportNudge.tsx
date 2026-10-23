import Link from "@/components/ui/IntentLink";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One quiet line that points at the donate page. Signed-in screens go to /support (inside the
 * app shell); public pages go to /donate. Never shown on warning or error screens.
 */
export function SupportNudge({
  href = "/support",
  lead = "Free, and made by a student.",
  action = "Chip in",
  className,
}: {
  href?: string;
  lead?: string;
  action?: string;
  className?: string;
}) {
  return (
    <p className={cn("flex items-start gap-2 text-body text-muted-foreground", className)}>
      <Heart className="mt-1 h-4 w-4 shrink-0" aria-hidden />
      <span>
        {lead}{" "}
        <Link
          href={href}
          className="focusable inline-flex min-h-11 items-center rounded-sm font-medium text-foreground underline decoration-border decoration-2 underline-offset-4 hover:decoration-foreground lg:min-h-0"
        >
          {action}
        </Link>
      </span>
    </p>
  );
}
