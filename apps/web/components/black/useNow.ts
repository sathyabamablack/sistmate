"use client";

import { useEffect, useState } from "react";

/**
 * The current time, ticking on the second boundary rather than drifting with setInterval.
 * It is null until mounted, so the server and the first client render agree.
 */
export function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      timer = setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    tick();
    return () => clearTimeout(timer);
  }, []);
  return now;
}
