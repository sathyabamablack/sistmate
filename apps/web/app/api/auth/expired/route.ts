import { NextResponse } from "next/server";
import { logout } from "@/lib/session";
import { invalidateDashboardData } from "@/lib/data";
import { isSameOriginNavigation, requestOrigin } from "@/lib/http";

/**
 * Landing point when the portal rejects the stored session. Clears it (only
 * possible in a route handler, not during render) and returns to sign-in.
 *
 * This is a GET because the dashboard layout redirects here, but it changes
 * state, so it only acts when the browser says the request came from this
 * site (or the user's own address bar). A third-party page embedding it in an
 * <img> or a link would otherwise be able to sign the student out; those get a
 * page with a button instead, and the button is a same-origin click.
 */
export async function GET(req: Request) {
  if (!isSameOriginNavigation(req)) {
    return new Response(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Sign out</title></head>` +
        `<body style="font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;line-height:1.5">` +
        `<h1 style="font-size:1.25rem">Continue to sign in</h1>` +
        `<p>Your session needs to be reset before you can sign in again.</p>` +
        `<p><a href="/api/auth/expired" style="display:inline-block;padding:.6rem 1rem;border-radius:.5rem;background:#1f5d4a;color:#fff;text-decoration:none">Continue</a></p>` +
        `</body></html>`,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  }
  await invalidateDashboardData();
  await logout();
  return NextResponse.redirect(new URL("/login?expired=1", requestOrigin(req)));
}
