import type { Metadata } from "next";
import Link from "@/components/ui/IntentLink";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { isAuthenticated } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;
  if (await isAuthenticated()) {
    redirect("/");
  }

  return (
    <AuthShell footnote="An independent dashboard over your own data. Not affiliated with your institution.">
      <h1 className="text-title font-semibold text-foreground">Sign in</h1>
      <p className="mt-2 text-body text-muted-foreground">
        Use your college ERP register number and password.
      </p>

      <div className="mt-8">
        <LoginForm expired={expired === "1"} />
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
