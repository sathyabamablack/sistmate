import Link from "@/components/ui/IntentLink";
import { Heart } from "lucide-react";
import { DonateCard } from "@/components/public/DonateCard";
import { buttonClass } from "@/components/ui/Button";
import { DONATIONS_OPEN } from "@/lib/donate";

const POINTS = [
  { lead: "It stays free.", body: "Nothing is locked behind a donation." },
  { lead: "It pays for running the site.", body: "Hosting, the domain and the time spent keeping up with ERP changes." },
  { lead: "It is optional.", body: "Using the portal is enough. Sharing it with a friend helps just as much." },
] as const;

/**
 * The donate screen, shared by the public /donate page and the signed-in /support page.
 * Phone: headline, amount picker, then the pitch (the left wrapper is `contents`, so its
 * children join the grid and can be ordered). Desktop: two plain columns, no row spanning.
 */
export function DonateLayout({ backHref = "/welcome" }: { backHref?: string }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-x-16">
      <div className="contents lg:col-start-1 lg:row-start-1 lg:block">
        <div className="order-1">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-small font-medium text-accent-foreground">
            <Heart className="h-4 w-4" aria-hidden /> Support the portal
          </span>
          <h1 className="mt-5 max-w-[14ch] font-display text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[3.5rem]">
            Found it useful? Chip in.
          </h1>
        </div>

        <div className="order-3 lg:mt-5">
          <p className="max-w-[46ch] text-subheading leading-relaxed text-muted-foreground">
            The portal is free and built by a student. A small tip through UPI keeps it online and
            keeps it updated when the ERP changes.
          </p>

          <ul className="mt-8 divide-y divide-border border-y border-border">
            {POINTS.map((p) => (
              <li key={p.lead} className="py-4">
                <p className="text-body leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">{p.lead}</span> {p.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="order-2 lg:col-start-2 lg:row-start-1">
        {DONATIONS_OPEN ? (
          <DonateCard />
        ) : (
          <div className="rounded-xl border border-border bg-surface p-6 sm:p-8">
            <h2 className="text-heading font-semibold">Tips are not open yet</h2>
            <p className="mt-2 text-body leading-relaxed text-muted-foreground">
              Thank you for thinking of it. Check back soon, or share the portal with a friend.
            </p>
            <Link href={backHref} className={buttonClass("outline", "md", "mt-5")}>
              Back to the portal
            </Link>
          </div>
        )}
        <p className="mt-4 text-small leading-relaxed text-muted-foreground">
          Payments go directly to the maker&apos;s UPI account. They are tips, not purchases, and are
          not refundable. This is an independent project, not affiliated with Sathyabama.
        </p>
      </div>
    </div>
  );
}
