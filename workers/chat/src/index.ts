import { DurableObject } from "cloudflare:workers";
import { ADMIN_HTML } from "./admin";
import { blockReason, cleanText, cleanWord, MAX_LEN } from "./filter";

interface Env {
  ROOM: DurableObjectNamespace<ChatRoom>;
  ALLOWED_ORIGINS: string;
  ADMIN_KEY?: string;
}

interface Message {
  id: number;
  name: string;
  text: string;
  at: number;
}

/** What each socket remembers across hibernation. `voter` is a short hash of the browser token, held in memory only. */
interface Attachment {
  name: string;
  voter: string;
  last: number;
}

/** One poll at a time, kept in settings; ballots live in `votes`, one per browser. */
interface PollRow {
  id: number;
  q: string;
  opts: string[];
  closed: boolean;
  /** When set, the poll closes itself at this time (ms since epoch). */
  endsAt?: number;
}

interface PollView extends PollRow {
  counts: number[];
  total: number;
}

/** Room rules every page needs: the pause between messages, and read-only mode. */
interface RoomConfig {
  gap: number;
  locked: boolean;
}

type AdminAction =
  | { action: "list" }
  | { action: "delete"; id: number }
  | { action: "clear" }
  | { action: "enable" }
  | { action: "disable" }
  | { action: "say"; text: string }
  | { action: "pin"; text: string }
  | { action: "unpin" }
  | { action: "poll"; q: string; opts: string[]; minutes?: number }
  | { action: "endpoll" }
  | { action: "clearpoll" }
  | { action: "fx"; kind: "confetti" | "emoji"; emoji?: string }
  | { action: "mute"; name: string; purge?: boolean }
  | { action: "unmute"; name: string }
  | { action: "slow"; ms: number }
  | { action: "lock"; locked: boolean }
  | { action: "maintenance"; on: boolean }
  | { action: "words"; list: string[] };

const KEEP = 100;
const TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_GAP_MS = 3000;
const MIN_GAP_MS = 1000;
const MAX_GAP_MS = 60_000;
const MAX_POLL_MINUTES = 120;
const MAX_MUTED = 200;
const MAX_WORDS = 50;
/** Only these can rain down, so the admin page can't be used to push arbitrary text into everyone's browser. */
const EMOJIS = ["🎉", "🔥", "❤️", "👏", "😂", "🎓", "✨", "💯"];
/** Generated names look like quiet-otter-42; that is the only shape a mute can name. */
const GENERATED_NAME = /^[a-z]+-[a-z]+-\d{2}$/;
/**
 * No per-network limit: a hostel or campus shares one IP, and the Worker never reads IPs at all.
 * This is only a ceiling for the whole room, well under the platform's 32,768.
 */
const MAX_SOCKETS = 5000;
/** Admin text skips the public filter, so it has its own limits. The name can't clash with a generated one. */
const ADMIN_NAME = "admin";
const MAX_SAY = 500;
const MAX_PIN = 300;
const MAX_QUESTION = 140;
const MAX_OPTION = 60;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
/** Close codes the page understands: chat switched off, room full. */
const CLOSE_OFF = 4001;
const CLOSE_CROWDED = 4002;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

const hex = (bytes: Uint8Array, length: number) =>
  Array.from(bytes.slice(0, length))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** Admin text: the same one-line cleanup as chat, with its own length limit and no content filter. */
const adminText = (raw: unknown, max: number) => (typeof raw === "string" ? cleanText(raw, max) : "");

/** Compares hashes so the check takes the same time whatever the guess. */
async function keyMatches(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

const ADJECTIVES = [
  "quiet", "sleepy", "brave", "lucky", "salty", "chill", "fuzzy", "swift", "cosmic", "mellow", "sneaky", "sunny",
  "witty", "lazy", "bold", "zesty", "misty", "rusty", "jolly", "breezy", "spicy", "dreamy", "tiny", "wild",
];
const ANIMALS = [
  "otter", "panda", "falcon", "koala", "gecko", "lynx", "moose", "owl", "quokka", "raven", "sloth", "tiger",
  "walrus", "yak", "bison", "crane", "dingo", "ferret", "heron", "ibis", "lemur", "marmot", "newt", "puffin",
];

/** A stable anonymous name for a browser's random token, so a name can't be picked or copied. */
async function nameFor(token: string): Promise<string> {
  const [a = 0, b = 0, c = 0] = await sha256(`sistmate-chat:${token}`);
  return `${ADJECTIVES[a % ADJECTIVES.length]}-${ANIMALS[b % ANIMALS.length]}-${10 + (c % 90)}`;
}

export class ChatRoom extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL)",
    );
    this.sql.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS votes (voter TEXT PRIMARY KEY, opt INTEGER NOT NULL)");
  }

  private setting(key: string): string | null {
    return this.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key = ?", key).toArray()[0]?.value ?? null;
  }

  private save(key: string, value: string | null) {
    if (value === null) this.sql.exec("DELETE FROM settings WHERE key = ?", key);
    else this.sql.exec("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", key, value);
  }

  private list(key: string): string[] {
    try {
      const parsed: unknown = JSON.parse(this.setting(key) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }

  private config(): RoomConfig {
    const gap = Number(this.setting("gap"));
    return { gap: gap >= MIN_GAP_MS && gap <= MAX_GAP_MS ? gap : DEFAULT_GAP_MS, locked: this.setting("locked") === "1" };
  }

  private poll(): PollView | null {
    const raw = this.setting("poll");
    if (!raw) return null;
    const row = JSON.parse(raw) as PollRow;
    // A timed poll counts as closed the moment its time is up, even before the alarm has run.
    const closed = row.closed || (row.endsAt !== undefined && Date.now() >= row.endsAt);
    const counts = row.opts.map(() => 0);
    for (const { opt, n } of this.sql.exec<{ opt: number; n: number }>(
      "SELECT opt, COUNT(*) AS n FROM votes GROUP BY opt",
    )) {
      if (counts[opt] !== undefined) counts[opt] = n;
    }
    return { ...row, closed, counts, total: counts.reduce((a, b) => a + b, 0) };
  }

  /** Closes a timed poll for everyone when its time runs out. */
  async alarm() {
    const poll = this.poll();
    if (!poll?.endsAt || Date.now() < poll.endsAt) return;
    this.closePoll(poll);
  }

  private closePoll({ id, q, opts, endsAt }: PollRow) {
    this.save("poll", JSON.stringify({ id, q, opts, closed: true, endsAt } satisfies PollRow));
    this.broadcast({ t: "poll", poll: this.poll() });
  }

  private myVote(voter: string): number | null {
    return this.sql.exec<{ opt: number }>("SELECT opt FROM votes WHERE voter = ?", voter).toArray()[0]?.opt ?? null;
  }

  /** Stores a message, trims the table to the newest KEEP, and tells everyone. */
  private post(name: string, text: string, at: number) {
    const row = this.sql
      .exec<{ id: number }>("INSERT INTO messages (name, text, at) VALUES (?, ?, ?) RETURNING id", name, text, at)
      .one();
    this.sql.exec(
      "DELETE FROM messages WHERE id <= (SELECT id FROM messages ORDER BY id DESC LIMIT 1 OFFSET ?)",
      KEEP,
    );
    this.broadcast({ t: "msg", m: { id: row.id, name, text, at } satisfies Message });
  }

  private enabled(): boolean {
    const row = this.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key = 'enabled'").toArray()[0];
    return !row || row.value === "1";
  }

  private recent(): Message[] {
    this.sql.exec("DELETE FROM messages WHERE at < ?", Date.now() - TTL_MS);
    return this.sql
      .exec<{ id: number; name: string; text: string; at: number }>(
        "SELECT id, name, text, at FROM messages ORDER BY id DESC LIMIT ?",
        KEEP,
      )
      .toArray()
      .reverse();
  }

  private open(except?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws !== except && ws.readyState === WebSocket.OPEN);
  }

  private broadcast(payload: unknown, except?: WebSocket) {
    const text = JSON.stringify(payload);
    for (const ws of this.open(except)) {
      try {
        ws.send(text);
      } catch {
        /* closing; its close handler tidies up */
      }
    }
  }

  async fetch(req: Request): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair();

    if (!this.enabled()) {
      server.accept();
      server.close(CLOSE_OFF, "chat is off");
      return new Response(null, { status: 101, webSocket: client });
    }

    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
      server.accept();
      server.close(CLOSE_CROWDED, "chat is full");
      return new Response(null, { status: 101, webSocket: client });
    }

    const token = new URL(req.url).searchParams.get("t") ?? "";
    const id = /^[0-9a-f-]{36}$/i.test(token) ? token : crypto.randomUUID();
    const name = await nameFor(id);
    const voter = hex(await sha256(`sistmate-vote:${id}`), 8);

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ name, voter, last: 0 } satisfies Attachment);
    const online = this.open().length;
    server.send(
      JSON.stringify({
        t: "hello",
        name,
        online,
        history: this.recent(),
        pin: this.setting("pin"),
        poll: this.poll(),
        mine: this.myVote(voter),
        cfg: this.config(),
      }),
    );
    this.broadcast({ t: "online", n: online }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    if (typeof data !== "string" || data.length > 2000) return;
    let msg: { t?: unknown; text?: unknown; o?: unknown };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (!this.enabled()) {
      ws.close(CLOSE_OFF, "chat is off");
      return;
    }
    const att = ws.deserializeAttachment() as Attachment;

    if (msg.t === "vote") return this.vote(ws, att, msg.o);
    if (msg.t !== "send" || typeof msg.text !== "string") return;

    const now = Date.now();
    const err = (e: string) => ws.send(JSON.stringify({ t: "err", e }));
    const { gap, locked } = this.config();
    if (locked) return err("chat is read-only right now");
    if (this.list("muted").includes(att.name)) return err("you've been muted by the admin");
    if (now - att.last < gap) return err("slow down a sec");

    const text = cleanText(msg.text);
    if (!text) return msg.text.trim() ? err(`too long, ${MAX_LEN} characters max`) : undefined;
    const reason = blockReason(text, this.list("words"));
    if (reason) return err(reason);

    this.post(att.name, text, now);
    ws.serializeAttachment({ ...att, last: now } satisfies Attachment);
  }

  /** One ballot per browser; voting again moves it. */
  private vote(ws: WebSocket, att: Attachment, option: unknown) {
    const poll = this.poll();
    if (!poll || poll.closed || typeof option !== "number" || !Number.isInteger(option)) return;
    if (option < 0 || option >= poll.opts.length) return;
    this.sql.exec("INSERT OR REPLACE INTO votes (voter, opt) VALUES (?, ?)", att.voter, option);
    ws.send(JSON.stringify({ t: "voted", id: poll.id, o: option }));
    this.broadcast({ t: "poll", poll: this.poll() });
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      /* already closed */
    }
    this.broadcast({ t: "online", n: this.open(ws).length }, ws);
  }

  async webSocketError(ws: WebSocket) {
    this.broadcast({ t: "online", n: this.open(ws).length }, ws);
  }

  /** Called by the Worker after it has checked the admin key. */
  isMaintenance(): boolean {
    return this.setting("maintenance") === "1";
  }

  async admin(body: AdminAction) {
    switch (body.action) {
      case "delete":
        this.sql.exec("DELETE FROM messages WHERE id = ?", Number(body.id));
        this.broadcast({ t: "del", id: Number(body.id) });
        break;
      case "clear":
        this.sql.exec("DELETE FROM messages");
        this.broadcast({ t: "clear" });
        break;
      case "disable":
        this.sql.exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('enabled', '0')");
        for (const ws of this.open()) ws.close(CLOSE_OFF, "chat is off");
        break;
      case "enable":
        this.sql.exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('enabled', '1')");
        break;
      case "say": {
        const text = adminText(body.text, MAX_SAY);
        if (!text) return { error: `say something, up to ${MAX_SAY} characters` };
        this.post(ADMIN_NAME, text, Date.now());
        break;
      }
      case "pin": {
        const text = adminText(body.text, MAX_PIN);
        if (!text) return { error: `pin something, up to ${MAX_PIN} characters` };
        this.save("pin", text);
        this.broadcast({ t: "pin", text });
        break;
      }
      case "unpin":
        this.save("pin", null);
        this.broadcast({ t: "pin", text: null });
        break;
      case "poll": {
        const q = adminText(body.q, MAX_QUESTION);
        const opts = Array.isArray(body.opts) ? body.opts.map((o) => adminText(o, MAX_OPTION)).filter(Boolean) : [];
        if (!q) return { error: `ask a question, up to ${MAX_QUESTION} characters` };
        if (opts.length < MIN_OPTIONS || opts.length > MAX_OPTIONS) {
          return { error: `give ${MIN_OPTIONS} to ${MAX_OPTIONS} options, up to ${MAX_OPTION} characters each` };
        }
        const minutes = Number(body.minutes ?? 0);
        if (!Number.isFinite(minutes) || minutes < 0 || minutes > MAX_POLL_MINUTES) {
          return { error: `timer must be 0 to ${MAX_POLL_MINUTES} minutes` };
        }
        const endsAt = minutes > 0 ? Date.now() + Math.round(minutes * 60_000) : undefined;
        // The id keeps counting up, so a page never mistakes a new poll for the one it voted in.
        const id = Number(this.setting("pollid") ?? 0) + 1;
        this.save("pollid", String(id));
        this.sql.exec("DELETE FROM votes");
        this.save("poll", JSON.stringify({ id, q, opts, closed: false, endsAt } satisfies PollRow));
        if (endsAt) await this.ctx.storage.setAlarm(endsAt);
        else await this.ctx.storage.deleteAlarm();
        this.broadcast({ t: "poll", poll: this.poll() });
        break;
      }
      case "endpoll": {
        const poll = this.poll();
        if (!poll) return { error: "no poll running" };
        await this.ctx.storage.deleteAlarm();
        this.closePoll(poll);
        break;
      }
      case "clearpoll":
        await this.ctx.storage.deleteAlarm();
        this.sql.exec("DELETE FROM votes");
        this.save("poll", null);
        this.broadcast({ t: "poll", poll: null });
        break;
      case "fx": {
        if (body.kind === "emoji") {
          const emoji = EMOJIS.find((e) => e === body.emoji);
          if (!emoji) return { error: "pick one of the emoji on the page" };
          this.broadcast({ t: "fx", kind: "emoji", emoji });
        } else {
          this.broadcast({ t: "fx", kind: "confetti" });
        }
        break;
      }
      case "mute": {
        if (typeof body.name !== "string" || !GENERATED_NAME.test(body.name)) return { error: "that isn't a chat name" };
        const muted = this.list("muted");
        if (!muted.includes(body.name)) {
          if (muted.length >= MAX_MUTED) return { error: `can't mute more than ${MAX_MUTED} people` };
          this.save("muted", JSON.stringify([...muted, body.name]));
        }
        if (body.purge) {
          const ids = this.sql
            .exec<{ id: number }>("DELETE FROM messages WHERE name = ? RETURNING id", body.name)
            .toArray();
          for (const { id } of ids) this.broadcast({ t: "del", id });
        }
        break;
      }
      case "unmute":
        this.save("muted", JSON.stringify(this.list("muted").filter((n) => n !== body.name)));
        break;
      case "slow": {
        const ms = Math.round(Number(body.ms));
        if (!(ms >= MIN_GAP_MS && ms <= MAX_GAP_MS)) {
          return { error: `slow mode is ${MIN_GAP_MS / 1000} to ${MAX_GAP_MS / 1000} seconds` };
        }
        this.save("gap", String(ms));
        this.broadcast({ t: "cfg", ...this.config() });
        break;
      }
      case "maintenance":
        // The ERP app asks GET /maintenance; while this is on it shows this chat page instead of the app.
        this.save("maintenance", body.on ? "1" : null);
        break;
      case "lock":
        this.save("locked", body.locked ? "1" : null);
        this.broadcast({ t: "cfg", ...this.config() });
        break;
      case "words": {
        if (!Array.isArray(body.list)) return { error: "send a list of words" };
        const words = [...new Set(body.list.map((w) => (typeof w === "string" ? cleanWord(w) : "")).filter(Boolean))];
        if (words.length > MAX_WORDS) return { error: `up to ${MAX_WORDS} blocked words` };
        this.save("words", JSON.stringify(words));
        break;
      }
    }
    return {
      enabled: this.enabled(),
      maintenance: this.setting("maintenance") === "1",
      online: this.open().length,
      messages: this.recent(),
      pin: this.setting("pin"),
      poll: this.poll(),
      muted: this.list("muted"),
      words: this.list("words"),
      ...this.config(),
    };
  }
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    const room = env.ROOM.get(env.ROOM.idFromName("main"));

    if (url.pathname === "/ws") {
      if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
      const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
      if (!allowed.includes(req.headers.get("Origin") ?? "")) return new Response("Forbidden", { status: 403 });
      return room.fetch(req);
    }

    // Public, tiny, cacheable for a few seconds: the app's proxy polls this to know whether to show the chat page.
    if (url.pathname === "/maintenance" && req.method === "GET") {
      return new Response(JSON.stringify({ on: await room.isMaintenance() }), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=10",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (url.pathname === "/admin" && req.method === "GET") {
      return new Response(ADMIN_HTML, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex",
          "Referrer-Policy": "no-referrer",
          "Content-Security-Policy":
            "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
        },
      });
    }

    if (url.pathname === "/admin/api" && req.method === "POST") {
      const given = req.headers.get("Authorization") ?? "";
      if (!env.ADMIN_KEY || !(await keyMatches(given, `Bearer ${env.ADMIN_KEY}`))) {
        return json({ error: "wrong key" }, 401);
      }
      let body: AdminAction;
      try {
        body = await req.json();
      } catch {
        return json({ error: "bad request" }, 400);
      }
      return json(await room.admin(body));
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
