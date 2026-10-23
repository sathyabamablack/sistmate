import type { Metadata } from "next";
import { ShieldCheck, WifiOff } from "lucide-react";
import { TryAgainButton } from "@/components/pwa/TryAgainButton";
import { Logo } from "@/components/ui/Logo";
import { Panel } from "@/components/ui/Panel";

/*
 * Served by the service worker when a page can't be loaded. It is fully
 * static and contains no personal data, so it is the only page the worker
 * keeps on the device.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <Logo className="h-10 w-10" />

      <Panel className="w-full max-w-md animate-fade-in p-6 text-center sm:p-8">
        <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-foreground">
          <WifiOff className="h-7 w-7" aria-hidden />
        </span>

        <h1 className="text-heading font-semibold text-foreground">You&apos;re offline</h1>
        <p className="mt-2 text-body text-muted-foreground">
          The portal can&apos;t be reached. Check your internet connection and try again. This page
          reloads on its own once you&apos;re back online.
        </p>

        <div className="mt-6 flex items-start gap-3 rounded-lg bg-surface-2 px-4 py-3 text-left text-small">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">Your data stays private.</span> Marks,
            attendance and other personal details are never stored on this device, so they&apos;re
            only available while you&apos;re connected.
          </p>
        </div>

        <div className="mt-6">
          <TryAgainButton />
        </div>
      </Panel>
    </main>
  );
}
