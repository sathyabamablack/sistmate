import { NextResponse } from "next/server";
import { login } from "@/lib/session";
import { clientIp, rateLimited, rejectCrossOrigin } from "@/lib/http";
import { getPrefs } from "@/lib/prefs-server";

// Portal round-trips can be slow; stay within the free plan's limits.
export const maxDuration = 30;

export async function POST(req: Request) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const username = str(body.username).trim();
  const password = str(body.password);
  const lmsPassword = str(body.lmsPassword) || undefined;

  if (rateLimited(`${clientIp(req)}:${username.toLowerCase()}`)) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a few minutes so your portal account isn't locked." },
      { status: 429 },
    );
  }

  const result = await login({ username, password, lmsPassword });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    home: (await getPrefs()).home,
    lmsConnected: result.lmsConnected,
    lmsError: result.lmsError,
  });
}
