import type { Metadata } from "next";
import Link from "@/components/ui/IntentLink";
import { SATHYABAMA_GRADE_SCALE } from "@usp/core";
import { FaqList, PublicShell } from "@/components/public/PublicShell";
import { JsonLd, breadcrumbSchema, faqSchema } from "@/components/seo/JsonLd";
import { buttonClass } from "@/components/ui/Button";
import { OG_IMAGES, SITE_URL } from "@/lib/site";

const TITLE = "Sathyabama grade points, pass marks and CGPA classes";
const DESCRIPTION =
  "The Sathyabama grade scale (A++ to RA) with grade points, the 50% pass rule, the 30% end-semester minimum, and the CGPA needed for each degree class.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/grade-points" },
  robots: { index: true, follow: true },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/grade-points", images: OG_IMAGES },
};

const CLASSES = [
  { cgpa: "9.0 and above", name: "First Class with Exemplary", rule: "Every course passed at first attempt, within 8 semesters" },
  { cgpa: "7.5 and above", name: "First Class with Distinction", rule: "Every course passed at first attempt, within 8 semesters" },
  { cgpa: "6.0 and above", name: "First Class", rule: "Every course passed, within 8 semesters" },
  { cgpa: "5.0 and above", name: "Second Class", rule: "Every course passed, within 12 semesters" },
] as const;

const FAQ = [
  {
    q: "What is the pass mark at Sathyabama?",
    a: "At least 50% of the total marks for the course, and at least 30% of the maximum in the end-semester exam. Both conditions must hold.",
  },
  {
    q: "What is RA?",
    a: "RA means reappear: the course total is below 50, or the end-semester minimum was not met. You rewrite the end-semester exam, and your continuous-assessment marks are kept.",
  },
  {
    q: "Does an RA lower my CGPA?",
    a: "No. RA, AAA, W and ABS are left out of both the top and the bottom of the formula, so a failed course does not count until you clear it.",
  },
  {
    q: "What CGPA do I need to graduate?",
    a: "The minimum CGPA for the degree is 5.0, with all courses cleared.",
  },
  {
    q: "Are these figures official?",
    a: "They follow the Sathyabama regulations (2019 and 2023). Your university grade sheet is the final authority.",
  },
] as const;

function rangeLabel(min: number, index: number): string {
  if (index === 0) return `${min}–100`;
  const upper = (SATHYABAMA_GRADE_SCALE[index - 1]?.min ?? 101) - 1;
  return `${min}–${upper}`;
}

export default function GradePointsPage() {
  return (
    <PublicShell>
      <JsonLd data={faqSchema(FAQ)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Student Portal", url: `${SITE_URL}/welcome` },
          { name: "Grade points", url: `${SITE_URL}/grade-points` },
        ])}
      />
      <h1 className="max-w-[20ch] font-display text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[3.25rem]">
        Sathyabama grade points and pass rules
      </h1>
      <p className="mt-5 max-w-[56ch] text-subheading leading-relaxed text-muted-foreground">
        Letter grades come from the course total out of 100. The same scale applies to Regulations 2019
        and 2023.
      </p>

      <section aria-labelledby="scale-heading" className="mt-12 max-w-2xl">
        <h2 id="scale-heading" className="text-title font-semibold">
          Grade scale
        </h2>
        <div className="mt-5 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-body">
            <caption className="sr-only">Grade, marks range and grade points</caption>
            <thead className="bg-surface-2 text-small text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Total (out of 100)</th>
                <th scope="col" className="px-4 py-3 font-medium">Grade</th>
                <th scope="col" className="px-4 py-3 font-medium">Grade points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SATHYABAMA_GRADE_SCALE.map((g, i) => (
                <tr key={g.grade}>
                  <td className="px-4 py-3 tabular-nums">{rangeLabel(g.min, i)}</td>
                  <th scope="row" className="px-4 py-3 font-semibold">
                    {g.grade === "RA" ? "RA (reappear)" : g.grade}
                  </th>
                  <td className="px-4 py-3 tabular-nums">{g.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-small text-muted-foreground">
          AAA (absent), W (withdrawal) and ABS (authorised break of study) also carry 0 points.
        </p>
      </section>

      <section aria-labelledby="pass-heading" className="mt-14 max-w-2xl">
        <h2 id="pass-heading" className="text-title font-semibold">
          Pass rules
        </h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-body leading-relaxed text-muted-foreground">
          <li>At least 50% of the course total (50 out of 100, or 25 out of 50 for a 1-credit lab).</li>
          <li>At least 30% of the maximum in the end-semester exam.</li>
          <li>Failed courses are retaken by rewriting the end-semester exam; internal marks are kept.</li>
          <li>Mandatory audit courses need 80% attendance and 50% in the LMS assignments. They carry no credit.</li>
        </ul>
      </section>

      <section aria-labelledby="gpa-heading" className="mt-14 max-w-2xl">
        <h2 id="gpa-heading" className="text-title font-semibold">
          GPA and CGPA
        </h2>
        <p className="mt-4 text-body leading-relaxed text-muted-foreground">
          GPA = Σ (credits × grade points) ÷ Σ credits, over the courses you cleared in the semester.
          CGPA is the same sum over all semesters. Courses with RA, AAA, W or ABS are excluded until you
          clear them.
        </p>
      </section>

      <section aria-labelledby="class-heading" className="mt-14 max-w-3xl">
        <h2 id="class-heading" className="text-title font-semibold">
          Degree classes
        </h2>
        <div className="mt-5 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-body">
            <caption className="sr-only">CGPA required for each degree class</caption>
            <thead className="bg-surface-2 text-small text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">CGPA</th>
                <th scope="col" className="px-4 py-3 font-medium">Class</th>
                <th scope="col" className="px-4 py-3 font-medium">Condition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {CLASSES.map((c) => (
                <tr key={c.name}>
                  <td className="px-4 py-3 tabular-nums">{c.cgpa}</td>
                  <th scope="row" className="px-4 py-3 font-semibold">{c.name}</th>
                  <td className="px-4 py-3 text-muted-foreground">{c.rule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="faq-heading" className="mt-14 max-w-3xl">
        <h2 id="faq-heading" className="text-title font-semibold">
          Questions
        </h2>
        <div className="mt-6">
          <FaqList items={FAQ} />
        </div>
      </section>

      <section className="mt-14 flex flex-wrap items-center gap-3">
        <Link href="/cgpa-calculator" className={buttonClass("primary", "md")}>
          Work out your CGPA
        </Link>
        <Link href="/attendance-calculator" className={buttonClass("outline", "md")}>
          Attendance calculator
        </Link>
      </section>
    </PublicShell>
  );
}
