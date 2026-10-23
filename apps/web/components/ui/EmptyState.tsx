import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** An honest empty state: say what is missing, why, and what to do next. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col items-start rounded-xl bg-surface-2 px-5 py-6 sm:px-6", className)}>
      {Icon ? (
        <span className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-accent text-accent-foreground">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      ) : null}
      <p className="font-display text-subheading font-semibold text-foreground">{title}</p>
      {description ? (
        <div className="mt-1.5 max-w-prose text-small leading-relaxed text-muted-foreground">
          {description}
        </div>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
