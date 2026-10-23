import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "accent" | "warning" | "danger";

const tones: Record<Tone, string> = {
  default: "bg-surface shadow-rest",
  accent: "bg-accent text-accent-foreground",
  warning: "bg-warning/10 ring-1 ring-warning/30",
  danger: "bg-danger/8 ring-1 ring-danger/30",
};

/**
 * The one container. Use sparingly: one primary panel per screen, everything
 * else as plain sections. `padded` defaults to true.
 */
export function Panel({
  tone = "default",
  padded = true,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: Tone; padded?: boolean }) {
  return (
    <div className={cn("rounded-xl", tones[tone], padded && "p-4 sm:p-5", className)} {...props} />
  );
}
