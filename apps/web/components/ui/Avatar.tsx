"use client";

import * as React from "react";
import { cn, initials } from "@/lib/utils";

/** Profile photo with an initials fallback when the image is missing or fails to load. */
export function Avatar({
  name,
  src,
  className,
}: {
  name: string;
  src?: string;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement>(null);

  // An image can fail before hydration, when React has no onError listener yet.
  React.useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center bg-accent text-small font-semibold text-accent-foreground",
          className,
        )}
        aria-hidden
      >
        {initials(name)}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- data: URL from the ERP
    <img
      ref={imgRef}
      src={src}
      alt=""
      aria-hidden
      onError={() => setFailed(true)}
      className={cn("shrink-0 object-cover ring-1 ring-border", className)}
    />
  );
}
