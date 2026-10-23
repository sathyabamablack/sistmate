import type { Metadata } from "next";
import { DonateLayout } from "@/components/public/DonateLayout";
import { PublicShell } from "@/components/public/PublicShell";

export const metadata: Metadata = {
  title: "Support the portal",
  description:
    "The Student Portal is free and made by a student. If it saves you time, you can chip in through UPI.",
  alternates: { canonical: "/donate" },
  // A thin page for search; people reach it from links on the portal itself.
  robots: { index: false, follow: true },
};

export default function DonatePage() {
  return (
    <PublicShell>
      <DonateLayout />
    </PublicShell>
  );
}
