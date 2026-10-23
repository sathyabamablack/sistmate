import * as React from "react";
import { AlertCircle, CheckCircle2, Clock, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "muted"
  | "outline";

/** Status variants carry colour + icon + text, so meaning never depends on colour alone. */
const statusIcon = {
  primary: Info,
  success: CheckCircle2,
  warning: Clock,
  danger: AlertCircle,
} as const;

const variants: Record<Variant, string> = {
  default: "bg-muted text-foreground",
  primary: "bg-accent text-accent-foreground",
  success: "bg-success/12 text-success",
  warning: "bg-warning/14 text-warning",
  danger: "bg-danger/10 text-danger",
  muted: "bg-muted text-muted-foreground",
  outline: "border border-border text-muted-foreground",
};

export function Badge({
  className,
  variant = "default",
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  const Icon = variant in statusIcon ? statusIcon[variant as keyof typeof statusIcon] : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-micro font-semibold tabular-nums",
        variants[variant],
        className,
      )}
      {...props}
    >
      {Icon ? <Icon className="h-3 w-3 shrink-0" aria-hidden /> : null}
      {children}
    </span>
  );
}
