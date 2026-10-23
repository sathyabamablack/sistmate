"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

const overlayClass =
  "fixed inset-0 z-50 bg-foreground/45 backdrop-blur-[2px] data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out";

type Placement = "center" | "bottom" | "left";

type OutsideEvent = Parameters<
  NonNullable<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>["onInteractOutside"]>
>[0];

const placements: Record<Placement, string> = {
  center:
    "left-1/2 top-[12vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 rounded-2xl data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
  bottom:
    "inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl pb-safe data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out",
  left: "inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out",
};

/**
 * Modal built on Radix: focus trap, Escape, scroll lock and focus return come for free.
 * Always render a `DialogTitle` (use `className="sr-only"` to hide it visually).
 */
export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    placement?: Placement;
    /** Show the corner close button. */
    closeButton?: boolean;
  }
>(({ className, children, placement = "center", closeButton = true, onInteractOutside, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className={overlayClass} />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-50 bg-surface text-foreground shadow-pop outline-hidden",
        placements[placement as Placement],
        className,
      )}
      onInteractOutside={(event: OutsideEvent) => {
        onInteractOutside?.(event);
        // The walkthrough's popover and overlay sit outside the dialog; using them must not close it.
        if (event.target instanceof Element && event.target.closest("[data-tour-layer]")) event.preventDefault();
      }}
      {...props}
    >
      {children}
      {closeButton ? (
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focusable"
        >
          <X className="h-4 w-4" aria-hidden />
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";
