import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/ui/IntentLink";
import { papersAccess } from "@/lib/papers";
import { PageHeader } from "@/components/ui/PageHeader";
import { ReviewQueue } from "@/components/papers/ReviewQueue";

export const metadata: Metadata = { title: "Review papers" };
export const dynamic = "force-dynamic";

/** Admins only (PAPERS_ADMINS); everyone else gets a plain 404. */
export default async function ReviewPapersPage() {
  const access = await papersAccess();
  if (!access?.isAdmin) notFound();

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-2 text-small text-muted-foreground">
        <Link href="/papers" className="focusable inline-flex min-h-11 items-center rounded-sm hover:text-foreground lg:min-h-0">
          Question papers
        </Link>
        <span aria-hidden className="mx-2">
          /
        </span>
        <span aria-current="page">Review</span>
      </nav>
      <PageHeader title="Review papers" description="Check each file opens and is what it says, fix the details, then approve or reject." />
      <ReviewQueue client={access} />
    </div>
  );
}
