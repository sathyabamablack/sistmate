import type { Metadata, Viewport } from "next";
import { BlackCountdown } from "@/components/black/BlackCountdown";

export const metadata: Metadata = {
  title: { absolute: "Sathyabama Black" },
  description:
    "Opens Wed 28 Oct, 11:00 IST. Independent, and not affiliated with Sathyabama Institute of Science and Technology.",
  alternates: { canonical: "/black" },
  openGraph: {
    title: "Sathyabama Black",
    description: "Something different is coming. Stay curious.",
  },
  robots: { index: false, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function BlackPage() {
  return <BlackCountdown />;
}
