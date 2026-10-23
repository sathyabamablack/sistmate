"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileNav } from "./MobileNav";
import { CommandPalette, type PaletteCourse, type PaletteNotice } from "./CommandPalette";
import { Tour } from "@/components/tour/Tour";

// Loaded after the page is interactive: it brings its own fonts and is shown at most once per session.
const BlackPopup = dynamic(() => import("@/components/black/BlackPopup").then((m) => m.BlackPopup), {
  ssr: false,
});

/**
 * The signed-in frame. Below lg: top bar, content, fixed bottom tab bar.
 * At lg and up: fixed icon rail on the left, top bar and content beside it.
 * Only one of the rail and the tab bar is ever displayed.
 */
export function AppShell({
  studentName,
  registerNumber,
  photoUrl,
  unreadCount = 0,
  paletteCourses,
  paletteNotices,
  erpUrl,
  lmsUrl,
  connectionStatus,
  children,
}: {
  studentName: string;
  registerNumber: string;
  photoUrl?: string;
  /** Notifications not yet marked read. */
  unreadCount?: number;
  /** Short, capped lists for the command palette. */
  paletteCourses?: PaletteCourse[];
  paletteNotices?: PaletteNotice[];
  /** Real ERP and Moodle addresses (http or https), read on the server. The links render outside <main>. */
  erpUrl?: string;
  lmsUrl?: string;
  /** Server-rendered "Connected until …" line for the account menu. */
  connectionStatus?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const openCommand = React.useCallback(() => {
    setMoreOpen(false);
    setCommandOpen(true);
  }, []);

  // Cmd/Ctrl-K toggles the command palette. Escape is handled by the dialog.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setMoreOpen(false);
        setCommandOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
      router.refresh();
    } catch {
      /* ignore network errors in UI */
    } finally {
      // Small delay so the spinner is perceptible.
      setTimeout(() => setRefreshing(false), 400);
    }
  }, [router]);

  const handleLogout = React.useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }, [router]);

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-70 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-small focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <Sidebar />

      <div className="flex min-h-dvh min-w-0 flex-col lg:pl-22">
        <Topbar
          studentName={studentName}
          registerNumber={registerNumber}
          photoUrl={photoUrl}
          unreadCount={unreadCount}
          onOpenCommand={openCommand}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          onLogout={handleLogout}
          erpUrl={erpUrl}
          lmsUrl={lmsUrl}
          connectionStatus={connectionStatus}
        />
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 outline-hidden sm:px-6 sm:pt-6 lg:px-8 lg:pb-16"
        >
          {children}
        </main>
      </div>

      <MobileNav moreOpen={moreOpen} onMoreOpenChange={setMoreOpen} erpUrl={erpUrl} lmsUrl={lmsUrl} />

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onRefresh={handleRefresh}
        courses={paletteCourses}
        notices={paletteNotices}
        erpUrl={erpUrl}
        lmsUrl={lmsUrl}
      />

      <Tour studentName={studentName} />
      <BlackPopup />
    </div>
  );
}
