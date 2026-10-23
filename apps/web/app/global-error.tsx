"use client";

import { useEffect } from "react";
import "./globals.css";
import { RefreshCw } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { Panel } from "@/components/ui/Panel";

/**
 * Replaces the whole root layout when it fails, so it brings its own <html>
 * and <body>. Keep it free of anything that depends on providers, cookies or
 * data. Same rules as app/error.tsx: no error text, only the reference id.
 */
export default function GlobalError({
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
    <html lang="en">
      <head>
        <title>Something went wrong</title>
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground">
        <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
          <Logo className="h-10 w-10" />
          <Panel className="w-full max-w-md p-6 sm:p-8" role="alert">
            <h1 className="text-heading font-semibold text-foreground">Something went wrong</h1>
            <p className="mt-2 text-body text-muted-foreground">
              The app couldn&apos;t start. Nothing was changed on your college accounts. Trying
              again often fixes it.
            </p>
            {error.digest ? (
              <p className="mt-3 text-small tabular-nums text-muted-foreground">Reference: {error.digest}</p>
            ) : null}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button onClick={reset}>
                <RefreshCw className="h-4 w-4" aria-hidden />
                Try again
              </Button>
              <a href="/login" className={buttonClass("outline")}>
                Go to sign in
              </a>
            </div>
          </Panel>
        </main>
      </body>
    </html>
  );
}
