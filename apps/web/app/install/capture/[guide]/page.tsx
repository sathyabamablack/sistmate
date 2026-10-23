import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuidePlayer } from "@/components/guides/GuidePlayer";
import { GUIDE_IDS, isGuideId } from "@/lib/guides";

/**
 * Chromeless frame for scripts/record-guides.mjs: only the device, the step
 * captions and a title card, at a fixed size (720 x 1280 phone, 1280 x 720
 * laptop). The script starts playback with window.__guide.start(); add
 * ?autoplay=1 to watch it in a browser.
 */
export const metadata: Metadata = {
  title: "Guide video",
  robots: { index: false, follow: false },
};

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDE_IDS.map((guide) => ({ guide }));
}

export default async function GuideCapturePage({ params }: { params: Promise<{ guide: string }> }) {
  const { guide } = await params;
  if (!isGuideId(guide)) notFound();
  return <GuidePlayer guideId={guide} variant="capture" />;
}
