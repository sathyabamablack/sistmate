import Link from "@/components/ui/IntentLink";
import { SearchX } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";

export default function SubjectNotFound() {
  return (
    <div className="max-w-md py-12">
      <span className="mb-4 grid h-10 w-10 place-items-center rounded-full bg-accent text-accent-foreground">
        <SearchX className="h-5 w-5" aria-hidden />
      </span>
      <h1 className="text-title font-semibold text-foreground">Subject not found</h1>
      <p className="mt-2 text-body text-muted-foreground">
        Exam prep covers this semester&apos;s subjects from the ERP, and this one isn&apos;t among them.
      </p>
      <Link href="/prep" className={buttonClass("primary", "md", "mt-5")}>
        Back to exam prep
      </Link>
    </div>
  );
}
