import { DurableObject } from "cloudflare:workers";
import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import { ADMIN_HTML } from "./admin";
import { parseAlert, parseCursor, parseSubscription, type Alert, type SubscriptionInput } from "./validate";

interface Env {
  STORE: DurableObjectNamespace<PushStore>;
  ALLOWED_ORIGINS: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_SUBJECT: string;
  ADMIN_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
}

interface SubRow extends Record<string, SqlStorageValue> {
  n: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Most subscribers kept. A free Durable Object holds this many rows comfortably. */
const MAX_SUBS = 100_000;
/**
 * Subscribers handled per /admin/send call. A free Worker may make 50 subrequests per request, and
 * each one here is a push (35) plus a few calls to the store, so a page stays safely under it.
 */
const PAGE = 35;
/** Wrong admin keys allowed in 10 minutes before the admin routes lock for everyone. */
const MAX_BAD_KEYS = 20;
const BAD_KEY_WINDOW_MS = 10 * 60 * 1000;

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...SECURITY_HEADERS, ...extra },
  });
}

/** A short, stable id for a subscription: the first 32 hex characters of SHA-256 of its endpoint. */
async function subscriptionId(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The subscriptions: one SQLite table in one Durable Object. Nothing about the person, only the push address. */
export class PushStore extends DurableObject<Env> {
  private sql: SqlStorage;
  private badKeys: number[] = [];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS subs (n INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, " +
        "endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created INTEGER NOT NULL)",
    );
  }

  count(): number {
    return this.sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM subs").one().c;
  }

  /** Adds or refreshes a subscription. "full" when the cap is reached and this one is new. */
  add(id: string, sub: SubscriptionInput): "ok" | "full" {
    const known = this.sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM subs WHERE id = ?", id).one().c > 0;
    if (!known && this.count() >= MAX_SUBS) return "full";
    this.sql.exec(
      "INSERT INTO subs (id, endpoint, p256dh, auth, created) VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(id) DO UPDATE SET endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth",
      id,
      sub.endpoint,
      sub.p256dh,
      sub.auth,
      Date.now(),
    );
    return "ok";
  }

  remove(id: string): void {
    this.sql.exec("DELETE FROM subs WHERE id = ?", id);
  }

  /** The next `limit` subscriptions after row number `after`, oldest first. */
  page(after: number, limit: number): SubRow[] {
    return this.sql
      .exec<SubRow>("SELECT n, endpoint, p256dh, auth FROM subs WHERE n > ? ORDER BY n LIMIT ?", after, limit)
      .toArray();
  }

  drop(numbers: number[]): void {
    for (const n of numbers) this.sql.exec("DELETE FROM subs WHERE n = ?", n);
  }

  /** True while too many wrong admin keys were tried recently. */
  locked(): boolean {
    const now = Date.now();
    this.badKeys = this.badKeys.filter((t) => now - t < BAD_KEY_WINDOW_MS);
    return this.badKeys.length >= MAX_BAD_KEYS;
  }

  noteBadKey(): void {
    this.badKeys.push(Date.now());
  }
}

function store(env: Env) {
  return env.STORE.get(env.STORE.idFromName("main"));
}

/** The caller's origin if it is one of our pages, else null. */
function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  return env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).includes(origin) ? origin : null;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** A small JSON body, or null. Reads at most `limit` characters so a huge body cannot cost memory. */
async function readJson(request: Request, limit = 2000): Promise<unknown> {
  const text = await request.text();
  if (text.length > limit) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function publicApi(request: Request, env: Env, path: string): Promise<Response> {
  const origin = allowedOrigin(request, env);
  if (!origin) return json({ error: "Not allowed from this page." }, 403);
  const cors = corsHeaders(origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, ...cors } });

  if (path === "/key" && request.method === "GET") {
    return json({ key: env.VAPID_PUBLIC_KEY }, 200, { ...cors, "Cache-Control": "public, max-age=3600" });
  }

  if (path === "/subscribe" && request.method === "POST") {
    const sub = parseSubscription(await readJson(request));
    if (!sub) return json({ error: "That does not look like a push subscription." }, 400, cors);
    const result = await store(env).add(await subscriptionId(sub.endpoint), sub);
    return result === "ok" ? json({ ok: true }, 201, cors) : json({ error: "Alerts are full right now." }, 507, cors);
  }

  if (path === "/unsubscribe" && request.method === "POST") {
    const body = (await readJson(request)) as { endpoint?: unknown } | null;
    if (!body || typeof body.endpoint !== "string" || body.endpoint.length > 700) {
      return json({ error: "Bad request." }, 400, cors);
    }
    await store(env).remove(await subscriptionId(body.endpoint));
    return json({ ok: true }, 200, cors);
  }

  return json({ error: "Not found." }, 404, cors);
}

/** Constant-time comparison of the supplied key with the real one (both hashed first, so lengths match). */
async function keyMatches(supplied: string, real: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(supplied)),
    crypto.subtle.digest("SHA-256", enc.encode(real)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

type SendResult = "sent" | "gone" | "failed";

async function sendOne(
  row: SubRow,
  alert: Alert,
  tag: string,
  vapid: { subject: string; publicKey: string; privateKey: string },
): Promise<SendResult> {
  try {
    const subscription: PushSubscription = {
      endpoint: row.endpoint,
      expirationTime: null,
      keys: { p256dh: row.p256dh, auth: row.auth },
    };
    const init = await buildPushPayload(
      { data: { title: alert.title, body: alert.body, url: alert.url, tag }, options: { ttl: 86_400, urgency: "normal" } },
      subscription,
      vapid,
    );
    const res = await fetch(row.endpoint, init);
    // Always read the body so the connection is released.
    await res.arrayBuffer().catch(() => undefined);
    if (res.status >= 200 && res.status < 300) return "sent";
    // 404 and 410: the browser removed the subscription. Forget it.
    if (res.status === 404 || res.status === 410) return "gone";
    return "failed";
  } catch {
    return "failed";
  }
}

async function adminApi(request: Request, env: Env, path: string): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Not found." }, 404);
  if (!env.ADMIN_KEY) return json({ error: "Admin is not set up." }, 503);
  const room = store(env);
  if (await room.locked()) return json({ error: "Too many wrong keys. Try again in a few minutes." }, 429);
  const supplied = request.headers.get("x-admin-key") ?? "";
  if (!(await keyMatches(supplied, env.ADMIN_KEY))) {
    await room.noteBadKey();
    return json({ error: "Wrong key." }, 401);
  }

  if (path === "/admin/count") return json({ count: await room.count() });

  if (path === "/admin/send") {
    if (!env.VAPID_PRIVATE_KEY) return json({ error: "The push key is not set up." }, 503);
    const body = (await readJson(request, 4000)) as { cursor?: unknown; id?: unknown } | null;
    const alert = parseAlert(body);
    if (!alert || !body) return json({ error: "Check the title, message and link." }, 400);
    const tag = typeof body.id === "string" && /^[A-Za-z0-9-]{1,40}$/.test(body.id) ? body.id : "alert";
    const vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };

    const rows = await room.page(parseCursor(body.cursor), PAGE);
    const results = await Promise.all(rows.map((row) => sendOne(row, alert, tag, vapid)));
    const gone = rows.filter((_, i) => results[i] === "gone").map((r) => r.n);
    if (gone.length > 0) await room.drop(gone);
    const last = rows[rows.length - 1];
    return json({
      sent: results.filter((r) => r === "sent").length,
      failed: results.filter((r) => r === "failed").length,
      removed: gone.length,
      next: rows.length === PAGE && last ? last.n : null,
      total: await room.count(),
    });
  }

  return json({ error: "Not found." }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    try {
      if (path === "/") return new Response("sistmate push", { headers: { "Content-Type": "text/plain", ...SECURITY_HEADERS } });
      if (path === "/admin" && request.method === "GET") {
        return new Response(ADMIN_HTML, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy":
              "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            "X-Robots-Tag": "noindex",
            ...SECURITY_HEADERS,
          },
        });
      }
      if (path.startsWith("/admin/")) return await adminApi(request, env, path);
      return await publicApi(request, env, path);
    } catch {
      return json({ error: "Something went wrong." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
