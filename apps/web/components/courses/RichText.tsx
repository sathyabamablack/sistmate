import * as React from "react";
import Link from "@/components/ui/IntentLink";
import type { Inline, RichBlock } from "@usp/core";
import { cn } from "@/lib/utils";

const linkClass =
  "focusable rounded-sm text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary";

function Runs({ runs }: { runs: Inline[] }) {
  return runs.map((r, i) => {
    let node: React.ReactNode = r.text;
    if (r.code) {
      node = <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{node}</code>;
    }
    if (r.bold) node = <strong className="font-semibold text-foreground">{node}</strong>;
    if (r.italic) node = <em>{node}</em>;
    if (r.href?.startsWith("/")) {
      node = (
        <Link href={r.href} className={linkClass}>
          {node}
        </Link>
      );
    } else if (r.href) {
      node = (
        <a href={r.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {node}
        </a>
      );
    }
    return <React.Fragment key={i}>{node}</React.Fragment>;
  });
}

/**
 * Renders sanitised course text. The input is plain data (see RichBlock), so
 * every character goes through React's text escaping; no HTML is injected.
 */
export function RichText({ blocks, className }: { blocks: RichBlock[]; className?: string }) {
  if (blocks.length === 0) return null;
  return (
    <div className={cn("space-y-2.5 text-body text-foreground/90", className)}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "paragraph":
            return (
              <p key={i} className="whitespace-pre-line break-words">
                <Runs runs={b.content} />
              </p>
            );
          case "heading":
            return (
              <p key={i} className="pt-1 text-body font-semibold text-foreground">
                <Runs runs={b.content} />
              </p>
            );
          case "list": {
            const List = b.ordered ? "ol" : "ul";
            return (
              <List
                key={i}
                className={cn("space-y-1 pl-5", b.ordered ? "list-decimal" : "list-disc", "marker:text-muted-foreground")}
              >
                {b.items.map((item, j) => (
                  <li key={j} className="break-words pl-0.5">
                    <Runs runs={item} />
                  </li>
                ))}
              </List>
            );
          }
          case "quote":
            return (
              <blockquote key={i} className="border-l-2 border-primary/30 pl-3 text-muted-foreground">
                <Runs runs={b.content} />
              </blockquote>
            );
          case "code":
            return (
              <pre
                key={i}
                className="scrollbar-slim overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-small leading-5"
              >
                {b.text}
              </pre>
            );
        }
      })}
    </div>
  );
}
