import type { Metadata } from "next";
import Link from "@/components/ui/IntentLink";
import { statSync } from "node:fs";
import path from "node:path";
import { Download } from "lucide-react";
import { InstallGuides } from "@/components/guides/InstallGuides";
import { ShareGuideButton } from "@/components/guides/ShareGuideButton";
import { buttonClass } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { GUIDE_IDS, guideVideoPaths, type GuideId } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Add to home screen",
  description:
    "A short animated guide to adding the Student Portal to the home screen of an Android phone or an iPhone.",
  alternates: { canonical: "/install" },
  robots: { index: true, follow: true },
};

interface VideoFile {
  href: string;
  format: "MP4" | "WebM";
  bytes: number;
}

/** The recorded files in public/guides (made by scripts/record-guides.mjs), read at build time. */
function videoFiles(id: GuideId): VideoFile[] {
  const paths = guideVideoPaths(id);
  const files: VideoFile[] = [];
  for (const [href, format] of [
    [paths.mp4, "MP4"],
    [paths.webm, "WebM"],
  ] as const) {
    try {
      const { size } = statSync(path.join(process.cwd(), "public", href));
      files.push({ href, format, bytes: size });
    } catch {
      /* not recorded yet */
    }
  }
  return files;
}

const formatSize = (bytes: number) =>
  bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;

function Downloads({ id }: { id: GuideId }) {
  const files = videoFiles(id);
  if (files.length === 0) return null;
  const hasMp4 = files.some((f) => f.format === "MP4");
  return (
    <div>
      <p className="text-small font-semibold text-foreground">Save or share the video</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {files.map((f) => (
          <li key={f.href}>
            <a href={f.href} download className={buttonClass("outline", "sm")}>
              <Download className="h-4 w-4" aria-hidden />
              Download video ({f.format}, {formatSize(f.bytes)})
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-small text-muted-foreground">
        {hasMp4
          ? "The MP4 plays on any phone and can be sent on WhatsApp."
          : "WebM plays in Chrome, Edge, Firefox and Android. Some apps and older iPhones may not play it."}
      </p>
    </div>
  );
}

export default function InstallPage() {
  const downloads = Object.fromEntries(GUIDE_IDS.map((id) => [id, <Downloads key={id} id={id} />]));

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="bg-accent text-accent-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <Link href="/welcome" className="flex items-center gap-2.5 rounded-lg focusable">
            <Logo className="h-8 w-8" />
            <span className="font-display text-subheading font-semibold">Student Portal</span>
          </Link>
          <Link href="/welcome#install" className={buttonClass("outline", "sm")}>
            Text steps
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-8 sm:pt-12">
        <h1 className="font-display text-title font-semibold sm:text-display">Add to home screen</h1>
        <p className="mt-3 max-w-2xl text-subheading leading-relaxed text-muted-foreground">
          Every tap, with the same steps written underneath.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <ShareGuideButton />
        </div>

        <div className="mt-10">
          <InstallGuides downloads={downloads} />
        </div>

        <p className="mt-16 max-w-2xl text-body leading-relaxed text-muted-foreground">
          Your browser&apos;s menus may look a little different.
        </p>
      </main>
    </div>
  );
}
