import type { Metadata } from "next";
import { headers } from "next/headers";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { buildId, checkEnvironment, probeReachability, type CheckStatus, type EnvCheck, type Reachability } from "@/lib/env-check";
import { clientIp, rateLimited } from "@/lib/http";
import { buttonClass } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { Panel } from "@/components/ui/Panel";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export const metadata: Metadata = {
  title: "Setup check",
  robots: { index: false, follow: false },
};

const STATUS: Record<CheckStatus, { Icon: typeof CheckCircle2; className: string; label: string }> = {
  ok: { Icon: CheckCircle2, className: "text-success", label: "Good" },
  warn: { Icon: AlertTriangle, className: "text-warning", label: "Needs a look" },
  fail: { Icon: XCircle, className: "text-danger", label: "Must fix" },
};

/** Turns a reachability probe into the same green / amber / red vocabulary. */
function describeReach(name: string, reach: Reachability | null): EnvCheck | null {
  if (!reach) return null;
  const id = name === "ERP" ? "erp" : "lms";
  if (!reach.reachable) {
    return {
      id,
      label: `${name} reachable`,
      status: "fail",
      detail: `${name} did not answer within 5 seconds from this server.`,
      fix: `Check the address is right and the college site is up. If it works in your own browser but not here, the college may block this host. See "ERP may block cloud servers" in docs/DEPLOY.md for how to run the app on your own PC instead.`,
    };
  }
  if (reach.status !== undefined && [403, 429, 503].includes(reach.status)) {
    return {
      id,
      label: `${name} reachable`,
      status: "warn",
      detail: `${name} answered, but with HTTP ${reach.status}, which often means it blocks traffic from cloud servers.`,
      fix: `Sign-in uses your own browser, so you may still be fine. If sections fail to load after you connect, run the app on your own PC or a small server instead (docs/DEPLOY.md, "Self-hosting").`,
    };
  }
  return { id, label: `${name} reachable`, status: "ok", detail: `${name} answered from this server.` };
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ deep?: string }>;
}) {
  const { deep } = await searchParams;
  const report = checkEnvironment();
  const checks: EnvCheck[] = [...report.checks];
  let deepNote: string | null = null;

  if (deep === "1" && report.dataSource === "live") {
    const incoming = await headers();
    if (rateLimited(`setup-deep:${clientIp(new Request("http://local", { headers: incoming }))}`, 10)) {
      deepNote = "Too many connection tests. Wait a few minutes and try again.";
    } else {
      const [erp, lms] = await Promise.all([
        report.erpConfigured ? probeReachability(process.env.ERP_BASE_URL) : Promise.resolve(null),
        report.lmsConfigured ? probeReachability(process.env.LMS_BASE_URL) : Promise.resolve(null),
      ]);
      for (const extra of [describeReach("ERP", erp), describeReach("LMS", lms)]) {
        if (extra) checks.push(extra);
      }
    }
  }

  const failures = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warn").length;
  const overall: CheckStatus = failures ? "fail" : warnings ? "warn" : "ok";
  const OverallIcon = STATUS[overall].Icon;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:py-14">
      <header className="flex items-center gap-3">
        <Logo className="h-9 w-9" />
        <span className="font-display text-subheading font-semibold">Student Portal</span>
      </header>

      <div>
        <h1 className="text-title font-semibold text-foreground">Setup check</h1>
        <p className="mt-2 max-w-prose text-body text-muted-foreground">
          This page checks that your copy of the portal is set up correctly. It shows only yes or
          no answers. It never shows your passwords, keys or addresses.
        </p>
      </div>

      <Panel
        tone={overall === "fail" ? "danger" : overall === "warn" ? "warning" : "accent"}
        role="status"
        className="flex items-start gap-3"
      >
        <OverallIcon className={`mt-0.5 h-5 w-5 shrink-0 ${STATUS[overall].className}`} aria-hidden />
        <div>
          <p className="font-semibold text-foreground">
            {overall === "ok"
              ? "Everything looks good."
              : overall === "warn"
                ? "Working, with something worth a look."
                : "Something needs fixing before this will work."}
          </p>
          <p className="text-small text-muted-foreground">
            {report.dataSource === "live"
              ? "Live mode: the app reads your real ERP and LMS."
              : "Demo mode: the app shows sample data and any login works."}
          </p>
        </div>
      </Panel>

      <section aria-labelledby="checks-heading">
        <h2 id="checks-heading" className="text-heading font-semibold text-foreground">
          Checks
        </h2>
        <ul className="mt-3 divide-y divide-border">
          {checks.map((check) => {
            const { Icon, className, label } = STATUS[check.status];
            return (
              <li key={`${check.id}-${check.label}`} className="flex items-start gap-3 py-4">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${className}`} aria-hidden />
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {check.label}
                    <span className={`ml-2 text-small font-semibold ${className}`}>{label}</span>
                  </p>
                  <p className="mt-0.5 text-small text-muted-foreground">{check.detail}</p>
                  {check.fix ? (
                    <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-surface-2 px-3 py-2 text-small text-foreground">
                      <span className="font-semibold">How to fix: </span>
                      {check.fix}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {report.dataSource === "live" && deep !== "1" ? (
          <a href="/setup?deep=1" className={buttonClass("outline")}>
            Also test the connection to my college
          </a>
        ) : null}
        <a href="/login" className={buttonClass("primary")}>
          Go to sign in
        </a>
      </div>
      {deepNote ? (
        <p role="status" className="text-small text-warning">
          {deepNote}
        </p>
      ) : null}

      <p className="text-small text-muted-foreground">
        Changed a setting? In Vercel, settings only apply after you redeploy. Version {buildId()}.
        Programs and monitors can read the same facts at <code>/api/health</code>.
      </p>
    </main>
  );
}
