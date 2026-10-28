"use client";

import * as React from "react";

const KEY = "usp:notice:back-online-2026-10-27";

/** One-off note that sign-in is working again after the 27 Oct pause; dismissed for good once read. */
export function BackNotice() {
  const [hidden, setHidden] = React.useState(true);
  /* eslint-disable react-hooks/set-state-in-effect -- storage is only readable after mount */
  React.useEffect(() => {
    try {
      setHidden(localStorage.getItem(KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* storage blocked: it just shows again next visit */
    }
  };

  return (
    <div role="status" className="mb-4 flex items-start gap-3 rounded-xl border border-border bg-card p-4">
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold">We&apos;re back :D</span>
        <span className="mt-0.5 block text-small text-muted-foreground">
          Sign-in is working again and your attendance, marks and timetable load like before. Thanks for waiting!
          If anything still looks off, sign out and back in.
        </span>
      </span>
      <button
        type="button"
        onClick={dismiss}
        className="focusable min-h-11 shrink-0 rounded-lg px-3 text-small font-medium text-muted-foreground hover:text-foreground lg:min-h-0"
      >
        Dismiss
      </button>
    </div>
  );
}
