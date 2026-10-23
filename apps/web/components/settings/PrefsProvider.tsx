"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { clearPrefs, readPrefs, savePrefs, DEFAULT_PREFS, type Prefs } from "@/lib/prefs";

interface PrefsContextValue {
  prefs: Prefs;
  /** Saves the change to the cookie at once; the page re-renders from the server shortly after. */
  update: (patch: Partial<Prefs>) => void;
  /** Clears the preferences cookie (not the theme, grade template or credit corrections). */
  reset: () => void;
  pending: boolean;
}

const PrefsContext = React.createContext<PrefsContextValue | null>(null);

/** How long to wait for further changes (a dragged slider) before asking the server to re-render. */
const REFRESH_DELAY_MS = 300;

/**
 * Holds the student's preferences on the Settings page. Every change is written to
 * the `usp-prefs` cookie straight away (which also updates the <html> attributes, so
 * the look changes instantly) and followed by a debounced `router.refresh()` so
 * server-rendered pages pick the new values up.
 */
export function PrefsProvider({ initial, children }: { initial: Prefs; children: React.ReactNode }) {
  const router = useRouter();
  const [prefs, setPrefs] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();
  const latest = React.useRef(initial);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refreshSoon = React.useCallback(
    (delay: number) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => startTransition(() => router.refresh()), delay);
    },
    [router],
  );

  React.useEffect(() => () => clearTimeout(timer.current), []);

  const update = React.useCallback(
    (patch: Partial<Prefs>) => {
      // The walkthrough saves its own state from elsewhere; never write back a stale copy of it.
      const next = { ...latest.current, onboarding: readPrefs().onboarding, ...patch };
      latest.current = next;
      setPrefs(next);
      savePrefs(next);
      refreshSoon(REFRESH_DELAY_MS);
    },
    [refreshSoon],
  );

  const reset = React.useCallback(() => {
    latest.current = DEFAULT_PREFS;
    setPrefs(DEFAULT_PREFS);
    clearPrefs();
    refreshSoon(0);
  }, [refreshSoon]);

  const value = React.useMemo(() => ({ prefs, update, reset, pending }), [prefs, update, reset, pending]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefsContext(): PrefsContextValue {
  const ctx = React.useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefsContext must be used within PrefsProvider");
  return ctx;
}
