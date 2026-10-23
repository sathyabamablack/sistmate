import { NextResponse } from "next/server";
import { clientIp, rateLimited, rejectCrossOrigin } from "@/lib/http";
import { getInterestStore, isValidToken, memberFor } from "@/lib/interest";

export const dynamic = "force-dynamic";

/**
 * The Sathyabama Black "I'm interested" counter (see lib/interest.ts). Public and anonymous: the
 * browser's random token is hashed with the session secret before it is stored.
 *
 *   GET     -> { enabled, count }
 *   POST    -> { enabled, count }   body { token }: counts this browser once
 *   DELETE  -> { enabled, count }   body { token }: takes it back
 */

const NO_STORE = { "Cache-Control": "no-store" };

const unavailable = () => NextResponse.json({ enabled: false, count: 0 }, { headers: NO_STORE });

export async function GET() {
  const store = getInterestStore();
  if (!store) return unavailable();
  try {
    const count = await store.count();
    // Shared caching: the CDN answers polls for 30 s, then serves the old count while one request
    // refreshes it, so a busy launch page runs this function at most about twice a minute.
    return NextResponse.json(
      { enabled: true, count },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" } },
    );
  } catch {
    return unavailable();
  }
}

async function vote(req: Request, change: "add" | "remove") {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  const store = getInterestStore();
  if (!store) return unavailable();
  // Best-effort and per instance, like the login throttle: it stops a loop, not a determined script.
  if (rateLimited(`interest:${clientIp(req)}`, 40)) {
    return NextResponse.json({ error: "Slow down." }, { status: 429, headers: NO_STORE });
  }
  let token: unknown;
  try {
    token = ((await req.json()) as { token?: unknown }).token;
  } catch {
    token = undefined;
  }
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400, headers: NO_STORE });
  }
  try {
    const member = memberFor(token, process.env.SESSION_SECRET ?? "usp-interest");
    const count = change === "add" ? await store.add(member) : await store.remove(member);
    return NextResponse.json({ enabled: true, count }, { headers: NO_STORE });
  } catch {
    return unavailable();
  }
}

export const POST = (req: Request) => vote(req, "add");
export const DELETE = (req: Request) => vote(req, "remove");
