import * as React from "react";
import { linkify } from "@/lib/notice-format";

/** Plain text with http(s) URLs turned into links. Text is rendered as text, never as HTML. */
export function Linkified({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((seg, i) =>
        seg.type === "link" ? (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all rounded-sm text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary focusable"
          >
            {seg.value}
          </a>
        ) : (
          <React.Fragment key={i}>{seg.value}</React.Fragment>
        ),
      )}
    </>
  );
}
