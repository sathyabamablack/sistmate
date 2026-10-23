import Link from "@/components/ui/IntentLink";
import type { ReactNode } from "react";
import { BlackDot } from "@/components/black/BlackDot";
import { buttonClass } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

const wrap = "mx-auto w-full max-w-6xl px-4 sm:px-8";

export const PUBLIC_TOOLS = [
  { href: "/attendance-calculator", label: "Attendance calculator" },
  { href: "/cgpa-calculator", label: "CGPA calculator" },
  { href: "/grade-points", label: "Grade points" },
] as const;

const linkClass =
  "rounded-sm font-medium text-foreground underline decoration-border decoration-2 underline-offset-4 hover:decoration-foreground focusable";

/** Header and footer for the public, indexable pages. Every page links to its siblings. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border/70">
        <div className={cn(wrap, "flex h-14 items-center justify-between gap-4 sm:h-16")}>
          <Link href="/welcome" className="flex shrink-0 items-center gap-2.5 rounded-lg focusable">
            <Logo className="h-8 w-8" />
            <span aria-hidden className="font-display text-subheading font-semibold">
              Student Portal
            </span>
            <span className="sr-only">Student Portal home</span>
          </Link>
          <nav aria-label="Tools" className="hidden md:block">
            <ul className="flex items-center gap-1 text-small font-medium text-muted-foreground">
              {PUBLIC_TOOLS.map((t) => (
                <li key={t.href}>
                  <Link href={t.href} className="rounded-lg px-3 py-2 transition-colors hover:bg-muted hover:text-foreground focusable">
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <Link href="/login" className={buttonClass("primary", "sm")}>
            Sign in
          </Link>
        </div>
      </header>

      <main className={cn(wrap, "py-10 sm:py-14")}>{children}</main>

      <footer className="bg-surface-2">
        <div className={cn(wrap, "flex flex-col gap-6 py-10 sm:flex-row sm:items-start sm:justify-between")}>
          <p className="max-w-md text-small text-muted-foreground">
            An independent project. Not affiliated with Sathyabama Institute of Science and
            Technology; it only reads your own data. Your official grade sheet is the final word.
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-small">
            {PUBLIC_TOOLS.map((t) => (
              <li key={t.href}>
                <Link href={t.href} className={cn(linkClass, "inline-flex min-h-11 items-center lg:min-h-0")}>
                  {t.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/welcome" className={cn(linkClass, "inline-flex min-h-11 items-center lg:min-h-0")}>
                About the portal
              </Link>
            </li>
            <li>
              <Link href="/donate" className={cn(linkClass, "inline-flex min-h-11 items-center lg:min-h-0")}>
                Support
              </Link>
            </li>
            <li className="flex items-center">
              <BlackDot />
            </li>
          </ul>
        </div>
      </footer>
    </div>
  );
}

/** Question-and-answer list, one <details> per item, matching the welcome page. */
export function FaqList({ items }: { items: ReadonlyArray<{ q: string; a: string }> }) {
  return (
    <div className="divide-y divide-border border-y border-border">
      {items.map((f) => (
        <details key={f.q} className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-4 text-subheading font-semibold focusable [&::-webkit-details-marker]:hidden">
            {f.q}
          </summary>
          <p className="max-w-2xl pb-5 text-body leading-relaxed text-muted-foreground">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
