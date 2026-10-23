"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Reloads the current URL. The service worker serves the offline page in
 * place of whatever page failed, so a reload retries the original page.
 * Also retries automatically once the browser reports it is back online.
 */
export function TryAgainButton() {
  useEffect(() => {
    const onOnline = () => window.location.reload();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return (
    <Button type="button" onClick={() => window.location.reload()}>
      <RotateCw className="h-4 w-4" aria-hidden />
      Try again
    </Button>
  );
}
