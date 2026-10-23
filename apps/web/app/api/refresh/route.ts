import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAuthenticated } from "@/lib/session";
import { invalidateDashboardData } from "@/lib/data";
import { rejectCrossOrigin } from "@/lib/http";

// Portal round-trips can be slow; stay within the free plan's limits.
export const maxDuration = 30;

/**
 * Marks this user's cached sections out of date and re-renders the authenticated
 * routes. Old copies are kept as a fallback, so if the portal is down the
 * student still sees their last data (with a "saved at" notice).
 */
export async function POST(req: Request) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await invalidateDashboardData({ keepStale: true });
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, refreshedAt: new Date().toISOString() });
}
