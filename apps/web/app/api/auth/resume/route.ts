import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { login } from "@/lib/session";
import { checkRate, requestOrigin } from "@/lib/http";
import { clearRemembered, getRemembered, RESUMED_COOKIE } from "@/lib/remember";
import { getPrefs } from "@/lib/prefs-server";

export const maxDuration = 30;

/**
 * Quiet sign-in for a student who chose "Keep me signed in". The dashboard sends them here when
 * the ERP session is missing or has run out; this opens the sealed cookie on this device, signs in
 * again, and returns to the app. Wrong or changed password: the saved sign-in is dropped and the
 * login form is shown. A network or ERP outage keeps it, so the next visit tries again.
 */
export async function GET(req: Request) {
  const origin = requestOrigin(req);
  const toLogin = (expired: boolean) =>
    NextResponse.redirect(new URL(expired ? "/login?expired=1" : "/login", origin));

  const jar = await cookies();
  // Just resumed and still rejected: do not try again in a loop.
  if (jar.get(RESUMED_COOKIE)) return toLogin(true);

  const saved = await getRemembered();
  if (!saved) return toLogin(false);

  if (await checkRate(`resume:${saved.username.toLowerCase()}`, 8)) return toLogin(true);

  const result = await login({ username: saved.username, password: saved.password });
  if (!result.ok) {
    // Only a plain wrong-password answer ends the saved sign-in; outages leave it for next time.
    if (/wrong register number or password/i.test(result.error ?? "")) await clearRemembered();
    return toLogin(true);
  }

  const res = NextResponse.redirect(new URL((await getPrefs()).home || "/", origin));
  res.cookies.set(RESUMED_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https"),
    path: "/",
    maxAge: 60,
  });
  return res;
}
