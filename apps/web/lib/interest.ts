import { createHash } from "node:crypto";

/**
 * The "I'm interested" counter on the Sathyabama Black page: one anonymous vote per browser.
 *
 * The browser keeps a random token in localStorage and sends it; only a salted hash of that token is
 * stored (never an IP address, name or register number), in a Redis set so a repeat tap cannot count
 * twice. There is no database in this app, so the set lives in Upstash Redis (or Vercel KV, which uses
 * the same REST API) when its environment variables are set. In development an in-memory set stands in.
 * In production with no store configured the counter reports itself as unavailable and the page hides
 * the button rather than take votes it cannot keep.
 */

export const INTEREST_KEY = "usp:black:interested";

const TOKEN_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

export function isValidToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

/** A stable, non-reversible member for the set. The salt keeps the hash useless outside this app. */
export function memberFor(token: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${token}`).digest("hex").slice(0, 32);
}

export interface InterestStore {
  add(member: string): Promise<number>;
  remove(member: string): Promise<number>;
  count(): Promise<number>;
}

/** An in-memory set. Fine for development and tests; on serverless every instance would have its own. */
export function memoryStore(): InterestStore {
  const members = new Set<string>();
  return {
    async add(member) {
      members.add(member);
      return members.size;
    },
    async remove(member) {
      members.delete(member);
      return members.size;
    },
    async count() {
      return members.size;
    },
  };
}

type Fetch = typeof fetch;

/** Upstash's REST pipeline: several commands in one request, answered in order. */
export function upstashStore(url: string, token: string, fetchImpl: Fetch = fetch): InterestStore {
  const run = async (commands: string[][]): Promise<number[]> => {
    const res = await fetchImpl(`${url.replace(/\/+$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`interest store replied ${res.status}`);
    const answers = (await res.json()) as { result?: unknown; error?: string }[];
    return answers.map((a) => {
      if (a.error) throw new Error("interest store rejected a command");
      return Number(a.result ?? 0);
    });
  };
  return {
    async add(member) {
      return (await run([["SADD", INTEREST_KEY, member], ["SCARD", INTEREST_KEY]]))[1] ?? 0;
    },
    async remove(member) {
      return (await run([["SREM", INTEREST_KEY, member], ["SCARD", INTEREST_KEY]]))[1] ?? 0;
    },
    async count() {
      return (await run([["SCARD", INTEREST_KEY]]))[0] ?? 0;
    },
  };
}

let devStore: InterestStore | undefined;

/** The store to use, or null when this deployment has none (the counter is then switched off). */
export function getInterestStore(env: NodeJS.ProcessEnv = process.env): InterestStore | null {
  const url = env.UPSTASH_REDIS_REST_URL?.trim() || env.KV_REST_API_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim() || env.KV_REST_API_TOKEN?.trim();
  if (url && token) return upstashStore(url, token);
  if (env.NODE_ENV !== "production") return (devStore ??= memoryStore());
  return null;
}
