import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A collapsed block for options that exist but should not greet the student:
 * appearance, layout, formulas. Keeps the feature one tap away without letting
 * it set the tone of the page.
 *
 * The title is a real heading, so collapsing a section never takes it out of
 * the page outline a screen reader walks. `<summary>` takes phrasing content
 * intermixed with heading content, so the icon, the heading and the hint are
 * its direct children (a wrapping `<div>`/`<span>` around the heading would be
 * invalid and the parser would move it out of the summary).
 */
export function Disclosure({
  title,
  hint,
  children,
  className,
  id,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <details id={id} className={cn("group border-t border-border", className)}>
      <summary className="focusable grid min-h-14 cursor-pointer list-none grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-2 py-2 text-left marker:content-none [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="col-start-1 row-start-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden
        />
        <h2 className="col-start-2 row-start-1 text-heading font-semibold text-foreground">
          {title}
        </h2>
        {hint ? (
          <span className="col-start-2 row-start-2 text-small text-muted-foreground">{hint}</span>
        ) : null}
      </summary>
      <div className="pb-2 pt-4">{children}</div>
    </details>
  );
}
