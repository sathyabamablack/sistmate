"use client";

import * as React from "react";
import NextLink from "next/link";

type Props = React.ComponentProps<typeof NextLink>;

/**
 * `next/link` that prefetches when the student shows intent (pointer over it, a touch, or keyboard
 * focus) instead of as soon as it scrolls into view. Every page here is rendered per request, so a
 * viewport prefetch is a server run for each visible link, most of which are never followed; a
 * prefetch on intent still starts a few hundred milliseconds before the click.
 *
 * Used everywhere in place of `next/link`. An explicit `prefetch` prop wins.
 */
export default function IntentLink({ prefetch, onMouseEnter, onTouchStart, onFocus, ...rest }: Props) {
  const [intent, setIntent] = React.useState(false);
  const wake = () => {
    if (!intent) setIntent(true);
  };
  return (
    <NextLink
      {...rest}
      prefetch={prefetch !== undefined ? prefetch : intent ? null : false}
      onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
        wake();
        onMouseEnter?.(e);
      }}
      onTouchStart={(e: React.TouchEvent<HTMLAnchorElement>) => {
        wake();
        onTouchStart?.(e);
      }}
      onFocus={(e: React.FocusEvent<HTMLAnchorElement>) => {
        wake();
        onFocus?.(e);
      }}
    />
  );
}
