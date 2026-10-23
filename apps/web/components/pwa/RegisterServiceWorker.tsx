"use client";

import { useEffect } from "react";

/**
 * Registers `/sw.js` in production builds only (dev removes any stale one). The worker never caches pages
 * or API responses (see public/sw.js), it only provides an offline fallback.
 * Renders nothing and holds no state.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // A worker left on this origin by an earlier production run (same localhost port) would
      // keep serving old cached CSS to the dev server, so drop it and its caches.
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => void r.unregister()))
        .catch(() => {});
      if ("caches" in window) {
        caches
          .keys()
          .then((names) => names.filter((n) => n.startsWith("usp-")).forEach((n) => void caches.delete(n)))
          .catch(() => {});
      }
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          /* Registration is a progressive enhancement; ignore failures. */
        });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
