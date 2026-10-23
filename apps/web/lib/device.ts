/**
 * Best guess at the phone in hand, for picking which home-screen guide to show
 * first. Every page that uses it also lets the student switch.
 */

export type PhoneOs = "android" | "iphone";

const isIpadOs = (ua: string, touch: number) => /Macintosh/.test(ua) && touch > 1;

/** iPhones and iPads get the Safari guide; everything else the Chrome on Android one. */
export function detectPhoneOs(userAgent: string, maxTouchPoints = 0): PhoneOs {
  const ua = userAgent || "";
  return /iPhone|iPad|iPod/.test(ua) || isIpadOs(ua, maxTouchPoints) ? "iphone" : "android";
}

/** Deep links into /install: #android, #iphone. */
export function installTargetFromHash(hash: string): { os: PhoneOs } | null {
  switch (hash.replace(/^#/, "")) {
    case "android":
      return { os: "android" };
    case "iphone":
      return { os: "iphone" };
    default:
      return null;
  }
}
