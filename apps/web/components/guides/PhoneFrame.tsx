import * as React from "react";

/** Logical size of the phone canvas (frame included), in rem so it follows the text-size setting. */
export const PHONE_CANVAS = { width: 24.5, height: 50 } as const;

/**
 * A generic, unbranded phone drawn in CSS. The screen is 22.5 x 48rem; children
 * fill it. `os` only changes the camera cut-out (punch hole or island).
 */
export function PhoneFrame({ os, children }: { os: "android" | "ios"; children: React.ReactNode }) {
  return (
    <div className="absolute inset-y-0 left-[0.5rem] right-[0.5rem]">
      {/* Side buttons */}
      <span aria-hidden className="absolute -right-[0.2rem] top-[8rem] h-[4.5rem] w-[0.3rem] rounded-r-md bg-[#26302e] dark:bg-[#3a4744]" />
      <span aria-hidden className="absolute -left-[0.2rem] top-[7rem] h-[2.75rem] w-[0.3rem] rounded-l-md bg-[#26302e] dark:bg-[#3a4744]" />
      <span aria-hidden className="absolute -left-[0.2rem] top-[10.5rem] h-[2.75rem] w-[0.3rem] rounded-l-md bg-[#26302e] dark:bg-[#3a4744]" />
      <div className="relative h-full w-full rounded-[3.25rem] bg-[#121a18] p-[0.5rem] dark:bg-[#26322f] shadow-[0_30px_60px_-20px_hsl(171_40%_12%/0.45),0_10px_20px_-10px_hsl(171_40%_12%/0.3)] ring-1 ring-black/50 dark:ring-white/25">
        <div className="relative h-full w-full overflow-hidden rounded-[2.75rem] bg-background">
          {children}
          {os === "ios" ? (
            <span aria-hidden className="absolute left-1/2 top-[0.55rem] z-50 h-[1.75rem] w-[6.5rem] -translate-x-1/2 rounded-full bg-black" />
          ) : (
            <span aria-hidden className="absolute left-1/2 top-[0.6rem] z-50 h-[0.8rem] w-[0.8rem] -translate-x-1/2 rounded-full bg-black" />
          )}
        </div>
      </div>
    </div>
  );
}
