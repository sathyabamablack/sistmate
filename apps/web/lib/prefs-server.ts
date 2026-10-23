import "server-only";

import { cookies } from "next/headers";
import { PREFS_COOKIE, parsePrefs, type Prefs } from "./prefs";

/** The student's saved preferences, or the defaults. Server components only. */
export async function getPrefs(): Promise<Prefs> {
  return parsePrefs((await cookies()).get(PREFS_COOKIE)?.value);
}
