import type { Metadata } from "next";
import Link from "@/components/ui/IntentLink";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * Static on purpose: this page reads no cookie and no query on the server, so the CDN serves it and
 * no function runs per visit. The "session expired" note comes from ?expired=1 in the browser
 * (LoginForm). A signed-in visitor who opens /login simply sees the form; signing in again works.
 */
export default function LoginPage() {
  return (
    <AuthShell footnote="An independent dashboard over your own data. Not affiliated with your institution.">
      <h1 className="text-title font-semibold text-foreground">Sign in</h1>
      <p className="mt-2 text-body text-muted-foreground">
        Use your college ERP register number and password.
      </p>

      <div className="mt-8">
        <LoginForm />
      </div>

      <p className="mt-6 text-body text-muted-foreground">
        <Link
          href="/welcome"
          className="focusable inline-flex min-h-11 items-center rounded-md font-medium text-foreground underline underline-offset-4 lg:min-h-0"
        >
          What is this?
        </Link>
      </p>
    </AuthShell>
  );
}
