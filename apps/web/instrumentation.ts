/**
 * Runs once when the server starts. Checks the deployment's environment
 * variables and writes plain, actionable lines to the log. It never throws:
 * a half-configured dev machine should still start, and in production the
 * public /setup page and /api/health show the same findings.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const globals = globalThis as typeof globalThis & { __uspBootChecked?: boolean };
  if (globals.__uspBootChecked) return;
  globals.__uspBootChecked = true;

  try {
    const { bootMessages, checkEnvironment } = await import("./lib/env-check");
    const report = checkEnvironment();
    for (const message of bootMessages(report)) {
      if (message.level === "error") console.error(message.text);
      else console.warn(message.text);
    }
    if (report.ok && report.dataSource === "live") {
      console.info("[setup] Live mode: environment looks good. Open /setup to double-check.");
    }
  } catch (err) {
    console.warn(`[setup] Could not check the environment: ${err instanceof Error ? err.message : String(err)}`);
  }
}
