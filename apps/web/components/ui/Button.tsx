import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
export type ButtonSize = "sm" | "md" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg text-small font-medium whitespace-nowrap transition-[background-color,color,transform] duration-150 focusable select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-accent text-accent-foreground hover:bg-accent/70",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  outline: "border border-input bg-surface text-foreground hover:bg-muted",
  danger: "bg-danger text-danger-foreground hover:bg-danger/90",
};

/**
 * Touch targets stay 44px for the whole touch layout and only tighten at `lg`,
 * where the sidebar replaces the tab bar and there is a mouse. Shrinking at
 * `md` left tablets with 32px targets inside the touch layout.
 */
const sizes: Record<ButtonSize, string> = {
  sm: "h-11 px-3 lg:h-8",
  md: "h-11 px-4 lg:h-10",
  icon: "h-11 w-11 lg:h-9 lg:w-9",
};

/** Class string for links that should look like buttons, so they match `Button` exactly. */
export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks clicks; the label stays so the width does not jump. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
