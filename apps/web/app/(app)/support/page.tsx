import type { Metadata } from "next";
import { DonateLayout } from "@/components/public/DonateLayout";

export const metadata: Metadata = { title: "Support" };

/** The signed-in copy of /donate, so the tab bar and top bar stay in place. */
export default function SupportPage() {
  return <DonateLayout backHref="/" />;
}
