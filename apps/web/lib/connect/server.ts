import "server-only";

import { dataSource, getSession } from "@/lib/session";
import { connectionState, type ConnectionState } from "./jwt";

/**
 * Server-side read of the ERP connection. The token is read from the sealed
 * session cookie only to take its expiry; it is never returned or rendered.
 */
export async function getConnectionState(): Promise<ConnectionState | null> {
  if (dataSource() !== "live") return null;
  const session = await getSession();
  if (!session.username) return null;
  let token: string | undefined;
  try {
    const parsed = JSON.parse(session.erpSession ?? "{}") as { token?: unknown };
    token = typeof parsed.token === "string" ? parsed.token : undefined;
  } catch {
    token = undefined;
  }
  return connectionState(token);
}
