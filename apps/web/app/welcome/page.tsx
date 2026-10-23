import type { Metadata } from "next";
import { WelcomeView, welcomeMetadata } from "./WelcomeView";

export const metadata: Metadata = welcomeMetadata;

export default function WelcomePage() {
  return <WelcomeView signedIn={false} />;
}
