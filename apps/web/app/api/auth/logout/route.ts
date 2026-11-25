import { NextResponse } from "next/server";
import { logout } from "@/lib/session";
import { invalidateDashboardData } from "@/lib/data";
import { rejectCrossOrigin } from "@/lib/http";
import { clearRemembered } from "@/lib/remember";

export async function POST(req: Request) {
  const blocked = rejectCrossOrigin(req);
  if (blocked) return blocked;
  // Clear this user's cached data before the session (and its username) is gone.
  await invalidateDashboardData();
  await logout();
  await clearRemembered();
  return NextResponse.json({ ok: true });
}
