import { AlertCircle, CheckCircle2, Circle, Clock, Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "./format";

const icon: Record<Tone, { Icon: LucideIcon; className: string }> = {
  success: { Icon: CheckCircle2, className: "text-success" },
  danger: { Icon: AlertCircle, className: "text-danger" },
  warning: { Icon: Clock, className: "text-warning" },
  primary: { Icon: Info, className: "text-primary" },
  muted: { Icon: Circle, className: "text-muted-foreground" },
};

/** A status as icon plus text, so it never depends on colour alone. Only overdue/closed text is coloured. */
export function StatusText({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  const { Icon, className: iconClass } = icon[tone];
  return (
    <span
      className={cn(
        "inline-flex items-start gap-1.5",
        tone === "danger" ? "text-danger" : "text-foreground",
        className,
      )}
    >
      <Icon aria-hidden className={cn("mt-[3px] h-3.5 w-3.5 shrink-0", iconClass)} />
      <span className="min-w-0">{children}</span>
    </span>
  );
}
