import type { Metadata } from "next";
import Link from "@/components/ui/IntentLink";
import { Plus } from "lucide-react";
import { SkipCalculator } from "@/components/landing/SkipCalculator";
import { GetStarted } from "@/components/landing/GetStarted";
import { PhonePreview } from "@/components/landing/PhonePreview";
import { CgpaVisual, NextVisual, NotesVisual, SkipVisual } from "@/components/landing/FeatureVisuals";
import { BlackDot } from "@/components/black/BlackDot";
import { buttonClass } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { PUBLIC_TOOLS } from "@/components/public/PublicShell";
import { JsonLd, faqSchema } from "@/components/seo/JsonLd";
import { OG_IMAGES, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

const TITLE = "Student Portal: Sathyabama attendance, CGPA and LMS in one place";

export const welcomeMetadata: Metadata = {
  title: { absolute: TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/welcome" },
  robots: { index: true, follow: true },
  openGraph: { title: TITLE, description: SITE_DESCRIPTION, url: "/welcome", images: OG_IMAGES },
};

const APP_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: `${SITE_URL}/welcome`,
  description: SITE_DESCRIPTION,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Any (web, installable on Android and iPhone)",
  inLanguage: "en-IN",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
};

/** One container for every section, so all left edges line up. */
const wrap = "mx-auto w-full max-w-6xl px-4 sm:px-8";
/** Sections sit under a sticky header, so anchors stop short of it. */
const anchor = "scroll-mt-20";

const textLink =
  "rounded-sm font-medium text-foreground underline decoration-border decoration-2 underline-offset-4 hover:decoration-foreground focusable";

const FEATURES = [
  {
    q: "Can I skip?",
    body: "Every subject against the 80% line, with how many hours you can miss or need to attend. Today's attendance is on the same page.",
    Visual: SkipVisual,
  },
  {
    q: "What's next?",
    body: "Your section's week, with the class you are in and the one after it marked. Add it to your phone's calendar in one tap.",
    Visual: NextVisual,
  },
  {
    q: "Where's my CGPA?",
    body: "Results by semester, graded on the official scale and credit-weighted into GPA and CGPA. The planner works out what you need next.",
    Visual: CgpaVisual,
  },
  {
    q: "Where are my notes?",
    body: "Each LMS course with its units, files and assignment status. Download files without the LMS menus.",
    Visual: NotesVisual,
  },
] as const;

const PRIVACY_FACTS = [
  {
    lead: "Your password is never stored.",
    body: "It is used once to get a session from the ERP, then discarded.",
  },
  {
    lead: "The session lives in an encrypted cookie.",
    body: "It lasts 8 hours and only ever reads your own data.",
  },
  {
    lead: "There is no database.",
    body: "Pages are fetched when you open them and cached for a few minutes.",
  },
] as const;

const FAQ = [
  {
    q: "Is it official?",
    a: "No. It is an independent project and is not affiliated with Sathyabama or its ERP. It only reads what the ERP and LMS already show you.",
  },
  {
    q: "Is my password stored?",
    a: "No. It is exchanged once for a session and then discarded. Nothing is written to a database.",
  },
  {
    q: "Does it work on iPhone?",
    a: "Yes. Open it in Safari and add it to your Home Screen.",
  },
  {
    q: "Why does today's attendance appear after 7 pm?",
    a: "The ERP decides that. Day-wise attendance counts you present from 3 pm unless marked absent, and faculty usually post hour-wise attendance in the evening. Use Check again on the Attendance page.",
  },
  {
    q: "How accurate is the CGPA?",
    a: "It uses the official Sathyabama grade scale and your course credits, weighted the way the university does. Your official grade sheet is the final word.",
  },
] as const;

/**
 * The public overview. Rendered twice at build time, signed out (/welcome) and signed in
 * (/welcome/member, which next.config rewrites /welcome to when the session cookie is present),
 * so both are static files and a visit never runs a function.
 */
export function WelcomeView({ signedIn }: { signedIn: boolean }) {
  const cta = signedIn ? { href: "/", label: "Open your dashboard" } : { href: "/login", label: "Sign in" };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <JsonLd data={APP_SCHEMA} />
      <JsonLd data={faqSchema(FAQ)} />
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className={cn(wrap, "flex h-14 items-center justify-between gap-4 sm:h-16")}>
          <Link href="/welcome" className="flex shrink-0 items-center gap-2.5 rounded-lg focusable">
            <Logo className="h-8 w-8" />
            <span aria-hidden className="font-display text-subheading font-semibold">
              Student Portal
            </span>
          </Link>
          <nav aria-label="On this page" className="hidden md:block">
            <ul className="flex items-center gap-1 text-small font-medium text-muted-foreground">
              {[
                { href: "#features", label: "What you get" },
                { href: "#install", label: "Getting started" },
                { href: "#sign-in", label: "Privacy" },
              ].map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="rounded-lg px-3 py-2 transition-colors hover:bg-muted hover:text-foreground focusable">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <Link href={cta.href} className={buttonClass("primary", "sm")}>
            {cta.label}
          </Link>
        </div>
      </header>

      <main>
        {/* Hero: the calculator is the hero. */}
        <section aria-labelledby="hero-heading" className={cn(wrap, "pb-16 pt-10 sm:pb-24 sm:pt-16 lg:pt-14")}>
          <h1
            id="hero-heading"
            className="enter max-w-[13ch] font-display text-[2.75rem] font-semibold leading-[1] tracking-[-0.035em] sm:text-[4rem] lg:text-[4.75rem]"
          >
            Can you skip tomorrow&apos;s class?
          </h1>
          <p className="enter mt-5 max-w-[46ch] text-subheading leading-relaxed text-muted-foreground [--i:1] sm:text-heading sm:leading-relaxed">
            Put in your hours. Signed in, the portal does this for every subject automatically.
          </p>

          <div className="mt-10 sm:mt-12">
            <SkipCalculator
              footer={
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <Link href={cta.href} className={buttonClass("primary", "md", "md:h-11 md:px-5")}>
                      {cta.label}
                    </Link>
                    <a href="#install" className={buttonClass("outline", "md", "md:h-11 md:px-5")}>
                      Get started
                    </a>
                  </div>
                  <p className="mt-4 text-body text-muted-foreground">
                    Read-only. Not affiliated with Sathyabama.
                  </p>
                </>
              }
            />
          </div>
        </section>

        {/* See it on your phone */}
        <section aria-labelledby="preview-heading" className="bg-accent">
          <div className={cn(wrap, "py-16 sm:py-20 lg:py-24")}>
            <PhonePreview
              intro={
                <>
                  <h2 id="preview-heading" className="text-title font-semibold">
                    See it on your phone
                  </h2>
                  <p className="mt-3 max-w-md text-body leading-relaxed text-muted-foreground">
                    It installs like an app and opens on the page you need most.
                  </p>
                </>
              }
            />
          </div>
        </section>

        {/* What you get */}
        <section id="features" aria-labelledby="features-heading" className={cn(wrap, anchor, "py-16 sm:py-20 lg:py-28")}>
          <h2 id="features-heading" className="text-title font-semibold">
            What you get
          </h2>
          <ul className="mt-10 lg:mt-14">
            {FEATURES.map(({ q, body, Visual }, i) => (
              <li
                key={q}
                className="grid items-center gap-8 border-t border-border py-10 md:grid-cols-2 md:gap-14 lg:gap-20 lg:py-14"
              >
                <div className={cn("max-w-md", i % 2 === 1 && "md:order-2")}>
                  <h3 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.25rem]">{q}</h3>
                  <p className="mt-3 text-body leading-relaxed text-muted-foreground sm:text-subheading sm:leading-relaxed">{body}</p>
                </div>
                <div className={cn("flex", i % 2 === 1 ? "md:order-1 md:justify-start" : "md:justify-end")}>
                  <Visual />
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Set up */}
        <section id="install" aria-labelledby="install-heading" className={cn(anchor, "bg-surface-2")}>
          <div className={cn(wrap, "grid gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16 lg:py-24")}>
            <div className="lg:sticky lg:top-24 lg:self-start">
              <h2 id="install-heading" className="text-title font-semibold">
                Getting started
              </h2>
              <p className="mt-3 max-w-md text-body leading-relaxed text-muted-foreground">
                One sign-in. The other two steps are optional.
              </p>
            </div>
            <div className="min-w-0">
              <GetStarted />
            </div>
          </div>
        </section>

        {/* How sign-in works */}
        <section id="sign-in" aria-labelledby="sign-in-heading" className={cn(wrap, anchor)}>
          <div className="grid gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16 lg:py-24">
            <div>
              <h2 id="sign-in-heading" className="text-title font-semibold">
                Privacy
              </h2>
            </div>
            <div>
              <ul className="divide-y divide-border border-y border-border">
                {PRIVACY_FACTS.map((f) => (
                  <li key={f.lead} className="py-5 sm:py-6">
                    <p className="text-body leading-relaxed text-muted-foreground sm:text-subheading sm:leading-relaxed">
                      <span className="font-semibold text-foreground">{f.lead}</span> {f.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Questions */}
        <section id="questions" aria-labelledby="questions-heading" className={cn(wrap, anchor)}>
          <div className="grid gap-10 border-t border-border py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16 lg:py-24">
            <h2 id="questions-heading" className="text-title font-semibold">
              Questions
            </h2>
            <div className="divide-y divide-border border-y border-border">
              {FAQ.map((f) => (
                <details key={f.q} className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-4 text-subheading font-semibold focusable [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <Plus
                      className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45"
                      aria-hidden
                    />
                  </summary>
                  <p className="max-w-2xl pb-5 pr-9 text-body leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final call to action: quiet on purpose; the hero is the loud part. */}
        <section aria-labelledby="final-heading" className={wrap}>
          <div className="flex flex-col gap-6 border-t border-border py-16 sm:py-20 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 id="final-heading" className="max-w-[20ch] text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.25rem]">
                {signedIn ? "Your dashboard is ready." : "See your own numbers against the line."}
              </h2>
              <p className="mt-3 max-w-md text-body leading-relaxed text-muted-foreground">
                {signedIn ? "Pick up where you left off." : "Use the ERP account you already have."}
              </p>
            </div>
            <Link href={cta.href} className={buttonClass("primary", "md", "self-start md:h-11 md:self-auto md:px-5")}>
              {cta.label}
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-surface-2">
        <div className={cn(wrap, "flex flex-col gap-6 py-10 sm:flex-row sm:items-start sm:justify-between")}>
          <div className="flex max-w-md items-start gap-3 text-small text-muted-foreground">
            <Logo className="mt-0.5 h-7 w-7 shrink-0" />
            <p>
              An independent project. Not affiliated with Sathyabama Institute of Science
              and Technology; it only reads your own data.
            </p>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-small">
            {PUBLIC_TOOLS.map((t) => (
              <li key={t.href}>
                <Link href={t.href} className={cn(textLink, "inline-flex min-h-11 items-center lg:min-h-0")}>
                  {t.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/donate" className={cn(textLink, "inline-flex min-h-11 items-center lg:min-h-0")}>
                Support
              </Link>
            </li>
            <li>
              <Link href="/install" className={cn(textLink, "inline-flex min-h-11 items-center lg:min-h-0")}>
                Add to home screen
              </Link>
            </li>
            <li className="flex items-center">
              <BlackDot />
            </li>
          </ul>
        </div>
      </footer>
    </div>
  );
}
