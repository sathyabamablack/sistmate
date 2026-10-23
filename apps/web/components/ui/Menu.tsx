"use client";

import * as React from "react";
import * as M from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export const MenuRadioGroup = M.RadioGroup;

export const MenuContent = React.forwardRef<
  React.ElementRef<typeof M.Content>,
  React.ComponentPropsWithoutRef<typeof M.Content>
>(({ className, sideOffset = 8, align = "end", ...props }, ref) => (
  <M.Portal>
    <M.Content
      ref={ref}
      sideOffset={sideOffset}
      align={align}
      className={cn(
        "z-50 min-w-56 rounded-xl bg-surface p-1.5 text-foreground shadow-pop ring-1 ring-border",
        "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
        className,
      )}
      {...props}
    />
  </M.Portal>
));
MenuContent.displayName = "MenuContent";

const itemClass =
  "relative flex min-h-11 cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 text-small outline-hidden data-[highlighted]:bg-muted data-[disabled]:opacity-50 lg:min-h-9";

export const MenuItem = React.forwardRef<
  React.ElementRef<typeof M.Item>,
  React.ComponentPropsWithoutRef<typeof M.Item> & { danger?: boolean }
>(({ className, danger, ...props }, ref) => (
  <M.Item ref={ref} className={cn(itemClass, danger && "text-danger", className)} {...props} />
));
MenuItem.displayName = "MenuItem";

export const MenuRadioItem = React.forwardRef<
  React.ElementRef<typeof M.RadioItem>,
  React.ComponentPropsWithoutRef<typeof M.RadioItem>
>(({ className, children, ...props }, ref) => (
  <M.RadioItem ref={ref} className={cn(itemClass, "pr-8", className)} {...props}>
    {children}
    <M.ItemIndicator className="absolute right-2.5">
      <Check className="h-4 w-4 text-primary" aria-hidden />
    </M.ItemIndicator>
  </M.RadioItem>
));
MenuRadioItem.displayName = "MenuRadioItem";

export const MenuLabel = React.forwardRef<
  React.ElementRef<typeof M.Label>,
  React.ComponentPropsWithoutRef<typeof M.Label>
>(({ className, ...props }, ref) => (
  <M.Label
    ref={ref}
    className={cn("px-2.5 py-1.5 text-micro font-semibold text-muted-foreground", className)}
    {...props}
  />
));
MenuLabel.displayName = "MenuLabel";

export const MenuSeparator = ({ className }: { className?: string }) => (
  <M.Separator className={cn("my-1.5 h-px bg-border", className)} />
);
