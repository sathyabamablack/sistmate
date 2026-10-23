/**
 * Deployment self-check, shared by instrumentation.ts (boot log), GET
 * /api/health (JSON) and the public /setup page (plain-language checklist).
 *
 * Pure functions over an env object, no secrets in the output: values are
 * reduced to booleans and short, fixed sentences. Never echo env values.
 */

type Env = Record<string, string | undefined>;

export type DataSourceMode = "mock" | "live";

export interface ParsedDataSource {
  mode: DataSourceMode;
  /** The variable was exactly "mock" or "live". */
  exact: boolean;
  /** The variable was unset or empty. */
  unset: boolean;
  /** "live" was recognised but written with different case or spaces. */
  caseFixed: boolean;
}

/** DATA_SOURCE is case-insensitive ("Live" works); anything unknown means mock. */
export function parseDataSource(raw: string | undefined): ParsedDataSource {
  const value = (raw ?? "").trim();
  const lower = value.toLowerCase();
  const mode: DataSourceMode = lower === "live" ? "live" : "mock";
  const recognised = lower === "live" || lower === "mock";
  return {
    mode,
    exact: value === "live" || value === "mock",
    unset: value === "",
    caseFixed: recognised && value !== lower,
  };
}

export type CheckStatus = "ok" | "warn" | "fail";

export interface EnvCheck {
  id: "node" | "secret" | "dataSource" | "erp" | "lms";
  label: string;
  status: CheckStatus;
  /** One plain sentence describing what was found. */
  detail: string;
  /** The exact steps to fix it (only when status is not "ok"). */
  fix?: string;
}

export interface EnvReport {
  /** No check failed. Warnings (demo mode, LMS missing) do not count. */
  ok: boolean;
  dataSource: DataSourceMode;
  /** Long enough to be safe (always true outside production, where a dev key is used). */
  sessionSecretOk: boolean;
  erpConfigured: boolean;
  lmsConfigured: boolean;
  checks: EnvCheck[];
}

/**
 * Id of this build. next.config.mjs inlines NEXT_PUBLIC_BUILD_ID at build time (the literal
 * reference below is what lets Next replace it); on Vercel the git commit is the fallback.
 */
export function buildId(): string {
  return process.env.NEXT_PUBLIC_BUILD_ID || process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || "dev";
}

export const SECRET_GENERATOR = `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`;
export const MIN_NODE = { major: 20, minor: 9 } as const;

function parseHttpUrl(raw: string | undefined): { url: URL | null; present: boolean } {
  const value = (raw ?? "").trim();
  if (!value) return { url: null, present: false };
  try {
    const url = new URL(value);
    return { url: url.protocol === "http:" || url.protocol === "https:" ? url : null, present: true };
  } catch {
    return { url: null, present: true };
  }
}

function nodeAtLeast(version: string, major: number, minor: number): boolean {
  const [a = 0, b = 0] = version.replace(/^v/, "").split(".").map(Number);
  return a > major || (a === major && b >= minor);
}

export function checkEnvironment(
  env: Env = process.env,
  nodeVersion: string = process.version,
): EnvReport {
  const production = env.NODE_ENV === "production";
  const source = parseDataSource(env.DATA_SOURCE);
  const live = source.mode === "live";
  const checks: EnvCheck[] = [];

  // Node
  const nodeOk = nodeAtLeast(nodeVersion, MIN_NODE.major, MIN_NODE.minor);
  checks.push(
    nodeOk
      ? { id: "node", label: "Node.js version", status: "ok", detail: `Running Node ${nodeVersion.replace(/^v/, "")}.` }
      : {
          id: "node",
          label: "Node.js version",
          status: "warn",
          detail: `Running Node ${nodeVersion.replace(/^v/, "")}; this app needs ${MIN_NODE.major}.${MIN_NODE.minor} or newer.`,
          fix: "In Vercel: Project Settings, General, Node.js Version, choose 20.x or newer, then redeploy. Self-hosting: install Node 20 (see .nvmrc).",
        },
  );

  // Session secret
  const secret = env.SESSION_SECRET ?? "";
  const secretLongEnough = secret.length >= 32;
  const sessionSecretOk = secretLongEnough || !production;
  checks.push(
    secretLongEnough
      ? { id: "secret", label: "Session secret", status: "ok", detail: "SESSION_SECRET is set and long enough." }
      : production
        ? {
            id: "secret",
            label: "Session secret",
            status: "fail",
            detail: secret
              ? "SESSION_SECRET is set but shorter than 32 characters, so nobody can sign in."
              : "SESSION_SECRET is not set, so nobody can sign in.",
            fix: `Generate a random value by running this on any computer with Node: ${SECRET_GENERATOR}  Then in Vercel open Project Settings, Environment Variables, add SESSION_SECRET with that value, and redeploy. Self-hosting: put SESSION_SECRET=<value> in apps/web/.env.local and restart.`,
          }
        : {
            id: "secret",
            label: "Session secret",
            status: "warn",
            detail: "SESSION_SECRET is not set; development uses an insecure built-in key. Fine locally, never in production.",
            fix: `Set SESSION_SECRET in apps/web/.env.local. Generate one with: ${SECRET_GENERATOR}`,
          },
  );

  // Data source
  if (source.mode === "live" && source.exact) {
    checks.push({ id: "dataSource", label: "Data source", status: "ok", detail: "DATA_SOURCE is live: your real ERP is used." });
  } else if (source.mode === "live") {
    checks.push({
      id: "dataSource",
      label: "Data source",
      status: "warn",
      detail: "DATA_SOURCE is understood as live, but it is not written exactly as lowercase live.",
      fix: "Set DATA_SOURCE to exactly: live",
    });
  } else if (source.unset) {
    checks.push({
      id: "dataSource",
      label: "Data source",
      status: "warn",
      detail: "DATA_SOURCE is not set, so the app shows demo data only (any login works).",
      fix: "To use your real ERP set DATA_SOURCE to: live  (in Vercel: Project Settings, Environment Variables, then redeploy).",
    });
  } else if (source.exact || source.caseFixed) {
    checks.push({
      id: "dataSource",
      label: "Data source",
      status: "warn",
      detail: "DATA_SOURCE is mock: the app shows demo data only (any login works).",
      fix: "To use your real ERP set DATA_SOURCE to: live  (in Vercel: Project Settings, Environment Variables, then redeploy).",
    });
  } else {
    checks.push({
      id: "dataSource",
      label: "Data source",
      status: "warn",
      detail: "DATA_SOURCE has a value this app does not recognise, so it falls back to demo data.",
      fix: "Set DATA_SOURCE to exactly live (real ERP) or mock (demo data).",
    });
  }

  // ERP
  const erp = parseHttpUrl(env.ERP_BASE_URL);
  if (!live) {
    checks.push({ id: "erp", label: "ERP address", status: "ok", detail: "Not needed in demo mode." });
  } else if (erp.url) {
    checks.push({
      id: "erp",
      label: "ERP address",
      status: erp.url.protocol === "https:" ? "ok" : "warn",
      detail:
        erp.url.protocol === "https:"
          ? "ERP_BASE_URL is set."
          : "ERP_BASE_URL uses plain http, so your session token would travel unencrypted.",
      fix: erp.url.protocol === "https:" ? undefined : "Use the https:// address of your ERP.",
    });
  } else {
    checks.push({
      id: "erp",
      label: "ERP address",
      status: "fail",
      detail: erp.present ? "ERP_BASE_URL is not a valid web address." : "ERP_BASE_URL is not set, so no data can be loaded.",
      fix: "Set ERP_BASE_URL to your college ERP address, for example https://erp.sathyabama.ac.in (no trailing path), then redeploy.",
    });
  }

  // LMS
  const lms = parseHttpUrl(env.LMS_BASE_URL);
  if (!live) {
    checks.push({ id: "lms", label: "LMS address", status: "ok", detail: "Not needed in demo mode." });
  } else if (lms.url) {
    checks.push({ id: "lms", label: "LMS address", status: "ok", detail: "LMS_BASE_URL is set." });
  } else {
    checks.push({
      id: "lms",
      label: "LMS address",
      status: "warn",
      detail: lms.present
        ? "LMS_BASE_URL is not a valid web address, so LMS courses are switched off."
        : "LMS_BASE_URL is not set, so LMS courses are switched off. Everything from the ERP still works.",
      fix: "Set LMS_BASE_URL to your LMS address, for example https://sathyabama.cognibot.in, then redeploy.",
    });
  }

  return {
    ok: checks.every((c) => c.status !== "fail"),
    dataSource: source.mode,
    sessionSecretOk,
    erpConfigured: Boolean(erp.url),
    lmsConfigured: Boolean(lms.url),
    checks,
  };
}

export interface Reachability {
  reachable: boolean;
  /** HTTP status when the server answered at all. 403/429/503 from a host often means it blocks datacenter traffic. */
  status?: number;
}

/**
 * Asks the site's front page for any answer (no cookies, no credentials). Any HTTP
 * response counts as reachable; only network failure or timeout does not.
 */
export async function probeReachability(
  baseUrl: string | undefined,
  timeoutMs = 5000,
  fetchImpl: typeof fetch = fetch,
): Promise<Reachability> {
  const { url } = parseHttpUrl(baseUrl);
  if (!url) return { reachable: false };
  try {
    const res = await fetchImpl(url.origin + "/", {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "UnifiedStudentPortal-healthcheck" },
    });
    await res.body?.cancel().catch(() => undefined);
    return { reachable: true, status: res.status };
  } catch {
    return { reachable: false };
  }
}

/** Boot-time log lines for instrumentation.ts. Errors and warnings only. */
export function bootMessages(report: EnvReport): { level: "error" | "warn"; text: string }[] {
  return report.checks
    .filter((c) => c.status !== "ok")
    .map((c) => ({
      level: c.status === "fail" ? ("error" as const) : ("warn" as const),
      text: `[setup] ${c.label}: ${c.detail}${c.fix ? ` Fix: ${c.fix}` : ""}`,
    }));
}
