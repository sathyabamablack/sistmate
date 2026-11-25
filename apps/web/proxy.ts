import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Maintenance mode. The switch lives on the chat Worker's /admin page ("maintenance mode"); the Worker
 * answers GET /maintenance with { on: boolean }. While it is on, every page load that needs a sign-in
 * shows the static chat page (public/maintenance.html) instead of the app; the public tools in
 * OPEN_PATHS keep working. MAINTENANCE=1 in the environment forces it on.
 *
 * Cost and safety: this only runs for page loads (see `config.matcher`), remembers the answer for 20 s
 * per server instance, and fails open: if the Worker can't be reached the app keeps working.
 */
const CHAT_API = (process.env.CHAT_API_URL || "https://sistmate-chat.sistmate-static.workers.dev").replace(/\/+$/, "");
const CACHE_MS = 20_000;

let cached = { on: false, at: 0 };

async function maintenanceOn(): Promise<boolean> {
  if (process.env.MAINTENANCE === "1") return true;
  if (Date.now() - cached.at < CACHE_MS) return cached.on;
  try {
    const res = await fetch(`${CHAT_API}/maintenance`, { cache: "no-store", signal: AbortSignal.timeout(800) });
    if (res.ok) {
      const body = (await res.json()) as { on?: unknown };
      cached = { on: body.on === true, at: Date.now() };
    } else {
      cached = { ...cached, at: Date.now() };
    }
  } catch {
    // Worker unreachable: keep the last answer (off at first) and try again in a moment.
    cached = { ...cached, at: Date.now() };
  }
  return cached.on;
}

/**
 * Pages that need no sign-in and no ERP data stay open during maintenance; the maintenance page links
 * to them. Their links back into the app (/login, /welcome) are plain <a> tags, so leaving one is a
 * full page load that comes through here, not a client-side navigation that would skip this check.
 */
const OPEN_PATHS = ["/attendance-calculator", "/cgpa-calculator", "/grade-points", "/install", "/offline"];

function isOpen(pathname: string): boolean {
  return OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(req: NextRequest) {
  if (isOpen(req.nextUrl.pathname)) return NextResponse.next();
  if (!(await maintenanceOn())) return NextResponse.next();
  const res = NextResponse.rewrite(new URL("/maintenance.html", req.url));
  // Never let a browser or the CDN keep the maintenance page once the switch goes off.
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  // Page loads only: not API calls, Next's static files, icons, the service worker or the page itself.
  matcher: [
    {
      source: "/((?!api/|_next/|maintenance\\.html|sw\\.js|sw-version\\.js|icons/|guides/|landing/|usp-assets\\.json|favicon).*)",
      has: [{ type: "header", key: "accept", value: ".*text/html.*" }],
    },
  ],
};
