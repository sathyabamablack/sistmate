import { ExternalLink } from "lucide-react";

/** The institute's own regulation PDF, the source for every rule summarised below. */
const REGULATIONS_URL = "https://sist.sathyabama.ac.in/syllabus2023/soc/becse-r2023regulation.pdf";

/**
 * "How this is calculated": the official Sathyabama grading rules in five short lines,
 * shown under the CGPA when grades are estimated from ERP marks. A native <details>,
 * so it works without script.
 */
export function HowCalculated() {
  return (
    <details className="group mt-3 border-t border-border pt-3">
      <summary className="focusable flex min-h-11 cursor-pointer list-none items-center justify-between rounded-sm text-small font-semibold text-foreground marker:content-none lg:min-h-9">
        How this is calculated
        <span className="text-small font-normal text-primary group-open:hidden">Show</span>
        <span className="hidden text-small font-normal text-primary group-open:inline">Hide</span>
      </summary>
      <ul className="mt-2 space-y-1.5 text-body leading-relaxed text-muted-foreground">
        <li>A++ 90%+ (10 points), A+ 80% (9), B++ 70% (8), B+ 60% (7), C 50% (6). Below 50% is RA.</li>
        <li>Pass: 50% of the total and 30% of the end-semester exam.</li>
        <li>GPA weights grade points by credits, over passed papers only.</li>
      </ul>
      <p className="mt-2 text-body text-muted-foreground">
        <a
          href={REGULATIONS_URL}
          target="_blank"
          rel="noreferrer"
          className="focusable inline-flex items-center gap-1 rounded-sm font-semibold text-primary underline underline-offset-4"
        >
          Academic Regulations 2023
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </p>
    </details>
  );
}
