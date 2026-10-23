import { NextResponse } from "next/server";
import { buildId, checkEnvironment, probeReachability } from "@/lib/env-check";
import { clientIp, rateLimited } from "@/lib/http";

export const dynamic = "force-dynamic";
// The deep check waits at most 5 s per site, in parallel.
export const maxDuration = 15;

/**
 * Deployment health, for monitors and the CI smoke test. No sign-in needed, so
 * it only ever reports booleans, versions and times: never a secret, a URL or
 * a value from the environment.
 *
 * `?deep=1` additionally asks the ERP and Moodle front pages for any reply
 * (5 s limit, no cookies). A host that blocks datacenter traffic shows up as
 * reachable with status 403, 429 or 503.
 */
export async function GET(req: Request) {
  const report = checkEnvironment();
  const body: Record<string, unknown> = {
    ok: report.ok,
    dataSource: report.dataSource,
    sessionSecretOk: report.sessionSecretOk,
    erpConfigured: report.erpConfigured,
    lmsConfigured: report.lmsConfigured,
    node: process.version,
    buildId: buildId(),
    time: new Date().toISOString(),
  };

  if (new URL(req.url).searchParams.get("deep") === "1") {
    if (rateLimited(`health-deep:${clientIp(req)}`, 10)) {
      return NextResponse.json(
        { ...body, error: "Too many deep checks. Try again in a few minutes." },
        { status: 429, headers: { "Cache-Control": "no-store" } },
      );
    }
    const [erp, lms] = await Promise.all([
      report.erpConfigured && report.dataSource === "live"
        ? probeReachability(process.env.ERP_BASE_URL)
        : Promise.resolve(null),
      report.lmsConfigured && report.dataSource === "live"
        ? probeReachability(process.env.LMS_BASE_URL)
        : Promise.resolve(null),
    ]);
    body.deep = { erp, lms };
  }

  return NextResponse.json(body, {
    status: report.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
