import * as React from "react";

/** Logical size of the laptop canvas (lid and base), in rem so it follows the text-size setting. */
export const LAPTOP_CANVAS = { width: 65, height: 41 } as const;

/**
 * A generic, unbranded laptop drawn in CSS. The screen is 58.5 x 36.75rem;
 * children fill it.
 */
export function LaptopFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-x-[3rem] top-0 h-[39rem] rounded-t-[1.4rem] bg-[#121a18] px-[0.8rem] dark:bg-[#26322f] pb-[1.4rem] pt-[0.85rem] shadow-[0_24px_50px_-24px_hsl(171_40%_12%/0.5)] ring-1 ring-black/50 dark:ring-white/25">
        <span aria-hidden className="absolute left-1/2 top-[0.3rem] h-[0.3rem] w-[0.3rem] -translate-x-1/2 rounded-full bg-[#2b3633]" />
        <div className="relative h-full w-full overflow-hidden rounded-[0.35rem] bg-background">{children}</div>
      </div>
      {/* Base */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[2rem] rounded-b-[1.25rem] rounded-t-[0.25rem] bg-linear-to-b from-[#d9dfdc] to-[#a9b3af] shadow-[0_14px_24px_-14px_hsl(171_40%_12%/0.6)] dark:from-[#3a4542] dark:to-[#1f2826]"
      >
        <span className="absolute left-1/2 top-0 h-[0.45rem] w-[8rem] -translate-x-1/2 rounded-b-[0.6rem] bg-[#b4bdb9] dark:bg-[#2a3431]" />
      </div>
    </div>
  );
}
