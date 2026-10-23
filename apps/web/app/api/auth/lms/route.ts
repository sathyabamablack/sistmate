import { NextResponse } from "next/server";
import { createLiveLmsAdapter } from "@usp/lms-adapter";
import { dataSource, getSession } from "@/lib/session";
import { invalidateDashboardData } from "@/lib/data";
import { clientIp, rateLimited, rejectCrossOrigin } from "@/lib/http";

export const maxDuration = 30;

/**
 * Connect Moodle after an ERP token sign-in. Moodle has no captcha, so the
 * password is exchanged server-side for a web-service token once — it is never
 * stored, logged, or returned.
 */
export async function POST(req: Request) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;

  const session = await getSession();
  if (!session.username) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (dataSource() !== "live" || !process.env.LMS_BASE_URL) {
    return NextResponse.json({ error: "The LMS isn't set up on this app." }, { status: 400 });
  }

  let password = "";
  try {
    const body = (await req.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    /* handled below */
  }
  if (!password) {
    return NextResponse.json({ error: "Enter your LMS password." }, { status: 400 });
  }

  if (rateLimited(`lms:${clientIp(req)}:${session.username.toLowerCase()}`)) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a few minutes so your LMS account isn't locked." },
      { status: 429 },
    );
  }

  const result = await createLiveLmsAdapter({ baseUrl: process.env.LMS_BASE_URL })
    .authenticate({ username: session.username, password })
    .catch((e: unknown) => ({
      ok: false as const,
      session: undefined,
      error: e instanceof Error ? e.message : "LMS sign-in failed.",
    }));

  if (!result.ok || !result.session) {
    return NextResponse.json({ error: result.error ?? "LMS sign-in failed." }, { status: 401 });
  }

  session.lmsToken = result.session;
  await session.save();
  await invalidateDashboardData();
  return NextResponse.json({ ok: true });
}
