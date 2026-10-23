"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { Panel } from "@/components/ui/Panel";

/**
 * Last-resort screen for errors outside the signed-in area (sign-in, welcome,
 * setup). It never prints the error text: that can contain details nobody
 * should see. Only the opaque reference id is shown, to quote when asking for help.
 */
export default function RootError({
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
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <Logo className="h-10 w-10" />
      <Panel className="w-full max-w-md p-6 sm:p-8" role="alert">
        <h1 className="text-heading font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-body text-muted-foreground">
          This page didn&apos;t load. Nothing was changed on your college accounts. It is usually a
          short hiccup, so trying again often works.
        </p>
        {error.digest ? (
          <p className="mt-3 text-small tabular-nums text-muted-foreground">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button onClick={reset}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Try again
          </Button>
          {/* A plain link on purpose: it must still work if client-side routing is what broke. */}
          <a href="/login" className={buttonClass("outline")}>
            Go to sign in
          </a>
        </div>
      </Panel>
    </main>
  );
}
