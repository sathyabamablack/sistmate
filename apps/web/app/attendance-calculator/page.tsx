import type { Metadata } from "next";
import Link from "@/components/ui/IntentLink";
import { FaqList, PublicShell } from "@/components/public/PublicShell";
import { SkipCalculator } from "@/components/landing/SkipCalculator";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/components/seo/JsonLd";
import { SupportNudge } from "@/components/support/SupportNudge";
import { buttonClass } from "@/components/ui/Button";
import { OG_IMAGES, SITE_URL } from "@/lib/site";

const TITLE = "Sathyabama attendance calculator: how many classes can you skip?";
const DESCRIPTION =
  "Enter your hours attended and hours marked to see how many classes you can still skip, or how many you must attend, to stay on the 80% attendance line.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/attendance-calculator" },
  robots: { index: true, follow: true },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/attendance-calculator", images: OG_IMAGES },
};

const FAQ = [
  {
    q: "How is attendance percentage calculated?",
    a: "Hours attended divided by hours marked so far, times 100. If you attended 60 of 70 hours, that is 60 / 70 = 85.7%.",
  },
  {
    q: "How many hours can I skip and stay at 80%?",
    a: "With A hours attended and T hours marked, you can miss S more hours while A / (T + S) stays at or above 0.8. That works out to S = A × 1.25 − T, rounded down. For 60 attended of 70, S = 5.",
  },
  {
    q: "How many hours must I attend to get back to 80%?",
    a: "Attending X more hours in a row lifts you to 80% when (A + X) / (T + X) reaches 0.8, which is X = 4T − 5A, rounded up. For 40 attended of 60, X = 40.",
  },
  {
    q: "Does skipping one class cost one hour?",
    a: "A day can carry several hours, and the ERP counts each hour separately. Check the hours, not the days, and remember that today's hours usually appear in the evening.",
  },
  {
    q: "Can this read my real attendance?",
    a: "Yes. Sign in with your ERP account and the portal runs this for every subject at once, with today's attendance on the same page. This page needs no sign-in and stores nothing.",
  },
] as const;

export default function AttendanceCalculatorPage() {
  return (
    <PublicShell>
      <JsonLd data={faqSchema(FAQ)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Student Portal", url: `${SITE_URL}/welcome` },
          { name: "Attendance calculator", url: `${SITE_URL}/attendance-calculator` },
        ])}
      />
      <h1 className="max-w-[18ch] font-display text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[3.25rem]">
        Attendance calculator for the 80% line
      </h1>
      <p className="mt-5 max-w-[56ch] text-subheading leading-relaxed text-muted-foreground">
        Put in the hours you have attended and the hours marked so far. You get the number of classes
        you can still skip, or the number you need to attend to climb back to 80%.
      </p>

      <div className="mt-10">
        <SkipCalculator />
        <SupportNudge href="/donate" className="mt-5" />
      </div>

      <section aria-labelledby="how-heading" className="mt-16 max-w-2xl">
        <h2 id="how-heading" className="text-title font-semibold">
          How the numbers are worked out
        </h2>
        <ul className="mt-4 space-y-3 text-body leading-relaxed text-muted-foreground">
          <li>
            <span className="font-semibold text-foreground">Attendance %</span> = hours attended ÷
            hours marked × 100.
          </li>
          <li>
            <span className="font-semibold text-foreground">Hours you can skip</span> = attended × 1.25
            − marked, rounded down.
          </li>
          <li>
            <span className="font-semibold text-foreground">Hours you must attend</span> = 4 × marked
            − 5 × attended, rounded up, if you are below 80%.
          </li>
        </ul>
        <p className="mt-4 text-body leading-relaxed text-muted-foreground">
          Mandatory audit courses also need 80% attendance to pass. The ERP&apos;s own figures are the
          final word; this is a planning aid.
        </p>
      </section>

      <section aria-labelledby="faq-heading" className="mt-16 max-w-3xl">
        <h2 id="faq-heading" className="text-title font-semibold">
          Questions
        </h2>
        <div className="mt-6">
          <FaqList items={FAQ} />
        </div>
      </section>

      <section className="mt-16 flex flex-wrap items-center gap-3">
        <Link href="/login" className={buttonClass("primary", "md")}>
          See every subject at once
        </Link>
        <Link href="/cgpa-calculator" className={buttonClass("outline", "md")}>
          CGPA calculator
        </Link>
      </section>
    </PublicShell>
  );
}
