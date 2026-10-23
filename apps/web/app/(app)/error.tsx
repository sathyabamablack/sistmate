"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-md py-16">
      <h1 className="font-display text-title font-semibold text-foreground">Something went wrong</h1>
      <p className="mt-2 text-body text-muted-foreground">
        This page didn&apos;t load, and your data wasn&apos;t changed. The college portal may be
        slow or down. Try again in a moment.
      </p>
      {error.digest ? (
        <p className="mt-2 text-small tabular-nums text-muted-foreground">Reference: {error.digest}</p>
      ) : null}
      <Button className="mt-6" onClick={reset}>
        <RefreshCw className="h-4 w-4" aria-hidden />
        Try again
      </Button>
    </div>
  );
}
