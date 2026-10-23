import type { Metadata } from "next";
import { WelcomeView, welcomeMetadata } from "../WelcomeView";

/**
 * /welcome for a browser that has a session cookie. next.config rewrites /welcome here at the
 * edge, so the address bar still says /welcome and the page stays static.
 */
export const metadata: Metadata = { ...welcomeMetadata, robots: { index: false, follow: true } };

export default function WelcomeMemberPage() {
  return <WelcomeView signedIn />;
}
