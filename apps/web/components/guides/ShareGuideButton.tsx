"use client";

import * as React from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** Shares the /install address with the phone's share sheet, or copies it where there is none. */
export function ShareGuideButton({ path = "/install" }: { path?: string }) {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  const share = async () => {
    const url = new URL(path, window.location.origin).toString();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Install guide · Student Portal",
          text: "Short videos showing how to install the Student Portal on a phone or laptop.",
          url,
        });
        return;
      } catch (err) {
        // Closing the share sheet is not an error worth reporting.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2500);
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={share}>
        {state === "copied" ? <Check className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
        Share this guide
      </Button>
      <span role="status" className="text-small font-medium text-muted-foreground">
        {state === "copied" ? "Link copied" : state === "failed" ? "Could not copy. The address is shown in your address bar." : ""}
      </span>
    </>
  );
}
