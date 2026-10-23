import Link from "@/components/ui/IntentLink";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10 text-center">
      <Logo className="h-12 w-12" />
      <Badge variant="muted" className="mt-8">
        Error 404
      </Badge>
      <h1 className="mt-4 text-title font-semibold text-foreground">Page not found</h1>
      <p className="mt-2 max-w-sm text-body text-muted-foreground">
        This page does not exist or has moved. Check the address, or go back to your dashboard.
      </p>
      <Link href="/" className={buttonClass("primary", "md", "mt-8")}>
        Back to dashboard
      </Link>
    </main>
  );
}
