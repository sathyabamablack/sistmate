"use client";

import * as React from "react";

type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

interface ThemeContextValue {
  /** The theme actually applied right now. */
  theme: Theme;
  /** What the person chose. Light is the default; "system" follows the OS only when chosen. */
  preference: ThemePreference;
  toggle: () => void;
  setTheme: (t: Theme) => void;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "usp-theme";
/** Browser toolbar colours, matching --background in each theme. */
const THEME_COLOR: Record<Theme, string> = { light: "#f3f6f4", dark: "#0b1513" };

/*
 * The applied theme lives in the DOM (the `dark` class the boot script sets
 * before hydration) and the preference in localStorage; both are read as
 * external stores rather than mirrored into React state from an effect.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (readPreference() === "system") applyClass(systemTheme());
    listener();
  };
  mq.addEventListener("change", onSystem);
  return () => {
    listeners.delete(listener);
    mq.removeEventListener("change", onSystem);
  };
}

const systemTheme = (): Theme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

/** Everyone starts on light; dark or "system" only when the student picked it. */
function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "dark" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
}

function applyClass(t: Theme) {
  document.documentElement.classList.toggle("dark", t === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[t]);
}

const getThemeSnapshot = (): Theme =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";

const getServerTheme = (): Theme => "light";
const getServerPreference = (): ThemePreference => "light";

function applyPreference(p: ThemePreference) {
  try {
    // "system" is stored too, so the choice survives a reload (no key means light).
    localStorage.setItem(STORAGE_KEY, p);
  } catch {
    /* storage may be unavailable */
  }
  applyClass(p === "system" ? systemTheme() : p);
  listeners.forEach((l) => l());
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = React.useSyncExternalStore(subscribe, getThemeSnapshot, getServerTheme);
  const preference = React.useSyncExternalStore(subscribe, readPreference, getServerPreference);

  const toggle = React.useCallback(
    () => applyPreference(getThemeSnapshot() === "dark" ? "light" : "dark"),
    [],
  );

  const value = React.useMemo(
    () => ({ theme, preference, toggle, setTheme: applyPreference, setPreference: applyPreference }),
    [theme, preference, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/**
 * Inline script that runs before React hydrates, so there is no flash of the
 * wrong theme. Light unless the student chose dark, or chose "system" on a dark OS.
 */
export const themeBootScript = `
(function(){
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var dark = stored === 'dark' ||
      (stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    if (dark) {
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute('content', '${THEME_COLOR.dark}');
    }
  } catch (e) {}
})();
`;
