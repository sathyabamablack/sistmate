import type { Metadata } from "next";
import Link from "@/components/ui/IntentLink";
import { FaqList, PublicShell } from "@/components/public/PublicShell";
import { GpaCalculator } from "@/components/public/GpaCalculator";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/components/seo/JsonLd";
import { SupportNudge } from "@/components/support/SupportNudge";
import { buttonClass } from "@/components/ui/Button";
import { OG_IMAGES, SITE_URL } from "@/lib/site";

const TITLE = "Sathyabama GPA and CGPA calculator on the official grade scale";
const DESCRIPTION =
  "Add your courses, credits and grades to get your GPA on the Sathyabama scale (A++ = 10 to C = 6). Failed courses stay out of the formula until you clear them.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/cgpa-calculator" },
  robots: { index: true, follow: true },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/cgpa-calculator", images: OG_IMAGES },
};

const FAQ = [
  {
    q: "How is GPA calculated at Sathyabama?",
    a: "GPA = Σ (course credits × grade points) ÷ Σ course credits, over the courses you cleared in the semester. A++ is 10, A+ is 9, B++ is 8, B+ is 7 and C is 6.",
  },
  {
    q: "How do I calculate CGPA?",
    a: "Use the same formula over every course you have cleared, across all semesters. Enter all of them here as one list and the result is your CGPA.",
  },
  {
    q: "Is CGPA the average of my semester GPAs?",
    a: "No. It is weighted by credits, so a semester with more credits counts for more than one with fewer.",
  },
  {
    q: "What happens to a course I failed?",
    a: "Courses with RA are left out of both the top and bottom of the formula, so they do not lower your CGPA. Once you clear the course, it counts with the grade you earned.",
  },
  {
    q: "Can I get my CGPA without typing everything in?",
    a: "Yes. Sign in with your ERP account and the portal reads your results, credits and grades, then works out GPA, CGPA and what you need next semester.",
  },
] as const;

export default function CgpaCalculatorPage() {
  return (
    <PublicShell>
      <JsonLd data={faqSchema(FAQ)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Student Portal", url: `${SITE_URL}/welcome` },
          { name: "CGPA calculator", url: `${SITE_URL}/cgpa-calculator` },
        ])}
      />
      <h1 className="max-w-[18ch] font-display text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[3.25rem]">
        GPA and CGPA calculator
      </h1>
      <p className="mt-5 max-w-[56ch] text-subheading leading-relaxed text-muted-foreground">
        Add each course with its credits and grade. The result uses the official Sathyabama grade
        points and weights every course by its credits.
      </p>

      <div className="mt-10">
        <GpaCalculator />
        <SupportNudge href="/donate" className="mt-5" />
      </div>

      <section aria-labelledby="how-heading" className="mt-16 max-w-2xl">
        <h2 id="how-heading" className="text-title font-semibold">
          The formula
        </h2>
        <p className="mt-4 text-body leading-relaxed text-muted-foreground">
          GPA = Σ (credits × grade points) ÷ Σ credits. For three 3-credit courses graded A++, A+ and
          B++, that is (3×10 + 3×9 + 3×8) ÷ 9 = 9.00. See the full{" "}
          <Link href="/grade-points" className="font-medium text-foreground underline underline-offset-4">
            grade scale and pass rules
          </Link>
          .
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
          Use my real results
        </Link>
        <Link href="/attendance-calculator" className={buttonClass("outline", "md")}>
          Attendance calculator
        </Link>
      </section>
    </PublicShell>
  );
}
