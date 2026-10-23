// Cache files are runtime scratch data: every fs call is marked turbopackIgnore so
// the bundler doesn't trace (and ship) the whole project into server functions.
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";

/**
 * Options for {@link createCache}.
 */
export interface CacheOptions {
  /**
   * Directory where JSON cache files are persisted. Defaults to
   * `<process.cwd()>/data/cache` (which should be gitignored).
   */
  dir?: string;
  /**
   * Logical namespace. Keeps separate caches from colliding on disk and in
   * memory. Defaults to `"default"`.
   */
  namespace?: string;
  /**
   * How long an expired entry is kept around so {@link Cache.wrap} can serve it
   * when a refresh fails ("stale-while-error"). Defaults to 12 hours.
   */
  maxStaleMs?: number;
  /**
   * After `fn` fails, calls for the same key re-throw that failure for this
   * long instead of hitting the source again. Defaults to 30 seconds; `0`
   * disables it. Kept in memory only.
   */
  negativeTtlMs?: number;
  /** Upper bound on in-memory entries (oldest are dropped first). Defaults to 200. */
  maxMemoryEntries?: number;
  /** Clock, injectable for tests. Defaults to `Date.now`. */
  now?: () => number;
}

/** Details handed to {@link WrapOptions.onStale}. */
export interface StaleInfo<T> {
  /** The expired value being served. */
  value: T;
  /** Epoch ms when that value was stored. */
  storedAt: number;
  /** The error that stopped a refresh. */
  error: unknown;
}

/** Per-call options for {@link Cache.wrap}. */
export interface WrapOptions<T> {
  /**
   * Called when `fn` failed and an expired entry is served instead. Runs once
   * per `wrap` call, including calls that shared an in-flight refresh.
   */
  onStale?: (info: StaleInfo<T>) => void;
  /**
   * Return false for errors that must reach the caller even if a stale entry
   * exists (for example "the session has expired"). Defaults to serving stale
   * for every error.
   */
  serveStaleOn?: (error: unknown) => boolean;
}

/**
 * The public cache surface returned by {@link createCache}.
 */
export interface Cache {
  /** Returns the stored value if present and not expired, else `undefined`. */
  get<T>(key: string): Promise<T | undefined>;
  /**
   * Stores `value` under `key`, expiring `ttlMs` milliseconds from now. Never
   * throws: a read-only or full disk only means the entry lives in memory.
   */
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  /**
   * Returns the cached value if fresh; otherwise calls `fn`, stores its
   * result for `ttlMs`, and returns it.
   *
   * - Concurrent calls for the same key share a single `fn` invocation.
   * - If `fn` throws and an expired entry exists, that entry is returned and
   *   `opts.onStale` is told (unless `opts.serveStaleOn` rejects the error).
   * - If `fn` throws and nothing can be served, the error propagates, and for
   *   a short while later calls re-throw it without calling `fn` (negative cache).
   */
  wrap<T>(key: string, ttlMs: number, fn: () => Promise<T>, opts?: WrapOptions<T>): Promise<T>;
  /** Clears a single `key` (value, stale copy and remembered failure), or the entire namespace. */
  invalidate(key?: string): Promise<void>;
  /**
   * Marks `key` (or the whole namespace) expired so the next `wrap` refetches,
   * but keeps the old value as a stale fallback in case the refetch fails.
   * Also forgets remembered failures.
   */
  expire(key?: string): Promise<void>;
}

/** On-disk / in-memory entry shape. */
interface Entry<T> {
  value: T;
  /** Epoch milliseconds after which the entry is considered expired. */
  expiresAt: number;
  /** Epoch milliseconds when the entry was written (absent in older files). */
  storedAt?: number;
}

/** Narrowing type guard for a parsed, unknown entry. */
function isEntry(candidate: unknown): candidate is Entry<unknown> {
  if (typeof candidate !== "object" || candidate === null) {
    return false;
  }
  const record = candidate as Record<string, unknown>;
  return (
    "value" in record &&
    typeof record["expiresAt"] === "number" &&
    Number.isFinite(record["expiresAt"])
  );
}

const DEFAULT_MAX_STALE_MS = 12 * 60 * 60 * 1000;
const DEFAULT_NEGATIVE_TTL_MS = 30 * 1000;
const DEFAULT_MAX_MEMORY_ENTRIES = 200;
/** Disk pruning is opportunistic and runs at most this often. */
const PRUNE_INTERVAL_MS = 10 * 60 * 1000;

interface Resolved<T> {
  value: T;
  /** Set when `value` is an expired entry served because the refresh failed. */
  stale?: { storedAt: number; error: unknown };
}

/**
 * Creates a two-tier (in-memory + JSON file) local cache.
 *
 * The in-memory `Map` serves the hot path within a single process; the file
 * tier lets cached data survive dev-server restarts. Read/parse/write
 * failures on the cache path are treated as a miss and never throw — only
 * errors from the user-supplied `fn` in {@link Cache.wrap} can propagate, and
 * only when there is nothing stale to fall back on.
 *
 * On serverless hosts each warm instance has its own memory and its own temp
 * directory, so this is a per-instance cache, not a shared one.
 */
export function createCache(opts: CacheOptions = {}): Cache {
  const dir = opts.dir ?? path.join(process.cwd(), "data", "cache");
  const namespace = opts.namespace ?? "default";
  const maxStaleMs = opts.maxStaleMs ?? DEFAULT_MAX_STALE_MS;
  const negativeTtlMs = opts.negativeTtlMs ?? DEFAULT_NEGATIVE_TTL_MS;
  const maxMemoryEntries = Math.max(1, opts.maxMemoryEntries ?? DEFAULT_MAX_MEMORY_ENTRIES);
  const now = opts.now ?? Date.now;

  const memory = new Map<string, Entry<unknown>>();
  const inFlight = new Map<string, Promise<Resolved<unknown>>>();
  const failures = new Map<string, { error: unknown; until: number }>();

  let warnedWrite = false;
  let lastPrune = 0;
  let pruning = false;

  /** Turns an arbitrary key into a filesystem-safe, namespaced basename. */
  function fileNameFor(key: string): string {
    const hash = createHash("sha256")
      .update(`${namespace}\u0000${key}`)
      .digest("hex");
    return `${namespace}.${hash}.json`;
  }

  function filePathFor(key: string): string {
    return path.join(dir, fileNameFor(key));
  }

  async function ensureDir(): Promise<void> {
    await fs.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
  }

  function isFresh(entry: Entry<unknown>): boolean {
    return entry.expiresAt > now();
  }

  /** Expired, but still inside the window where it may be served after a failure. */
  function isUsableStale(entry: Entry<unknown>): boolean {
    return entry.expiresAt + maxStaleMs > now();
  }

  async function readFromDisk(key: string): Promise<Entry<unknown> | undefined> {
    try {
      const raw = await fs.readFile(/*turbopackIgnore: true*/ filePathFor(key), "utf8");
      const parsed: unknown = JSON.parse(raw);
      return isEntry(parsed) ? parsed : undefined;
    } catch {
      // Missing file, unreadable file, or malformed JSON -> treat as a miss.
      return undefined;
    }
  }

  /** Inserts into memory, evicting the oldest entries beyond the cap. */
  function remember(key: string, entry: Entry<unknown>): void {
    memory.delete(key); // re-insert so Map order tracks recency of writes
    memory.set(key, entry);
    while (memory.size > maxMemoryEntries) {
      const oldest = memory.keys().next();
      if (oldest.done) break;
      memory.delete(oldest.value);
    }
  }

  /** Memory first, then disk. Returns the entry whether fresh, stale or beyond stale. */
  async function load(key: string): Promise<Entry<unknown> | undefined> {
    const cached = memory.get(key);
    if (cached !== undefined) return cached;
    const onDisk = await readFromDisk(key);
    if (onDisk !== undefined) remember(key, onDisk);
    return onDisk;
  }

  async function get<T>(key: string): Promise<T | undefined> {
    const entry = await load(key);
    if (entry === undefined) return undefined;
    if (isFresh(entry)) return entry.value as T;
    if (!isUsableStale(entry)) {
      // Too old to ever be served: drop it, best-effort.
      memory.delete(key);
      await removeFile(key);
    }
    return undefined;
  }

  async function set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const stamp = now();
    const entry: Entry<T> = { value, expiresAt: stamp + ttlMs, storedAt: stamp };
    remember(key, entry);
    failures.delete(key);
    try {
      await ensureDir();
      await fs.writeFile(/*turbopackIgnore: true*/ filePathFor(key), JSON.stringify(entry), "utf8");
    } catch (err) {
      // Read-only filesystem, full disk, bad path: the in-memory copy still works.
      if (!warnedWrite) {
        warnedWrite = true;
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(`[cache] Could not write to disk (${reason}). Using memory only.`);
      }
      return;
    }
    schedulePrune();
  }

  /** Removes disk entries that are past their stale window. Never throws. */
  function schedulePrune(): void {
    const stamp = now();
    if (pruning || stamp - lastPrune < PRUNE_INTERVAL_MS) return;
    lastPrune = stamp;
    pruning = true;
    void pruneDisk().finally(() => {
      pruning = false;
    });
  }

  async function pruneDisk(): Promise<void> {
    try {
      const prefix = `${namespace}.`;
      const names = await fs.readdir(/*turbopackIgnore: true*/ dir);
      const stamp = now();
      for (const name of names) {
        if (!name.startsWith(prefix) || !name.endsWith(".json")) continue;
        const file = path.join(/*turbopackIgnore: true*/ dir, name);
        try {
          // An entry expires no earlier than it was written, so a file touched
          // within the stale window can't be past it yet. Skip without reading.
          const { mtimeMs } = await fs.stat(/*turbopackIgnore: true*/ file);
          if (stamp - mtimeMs <= maxStaleMs) continue;
          const raw = await fs.readFile(/*turbopackIgnore: true*/ file, "utf8");
          const parsed: unknown = JSON.parse(raw);
          if (!isEntry(parsed) || parsed.expiresAt + maxStaleMs <= stamp) {
            await fs.rm(/*turbopackIgnore: true*/ file, { force: true });
          }
        } catch {
          // Unreadable or malformed: remove it, it can never be served.
          await fs.rm(/*turbopackIgnore: true*/ file, { force: true }).catch(() => undefined);
        }
      }
    } catch {
      // Directory absent or unreadable: nothing to prune.
    }
  }

  async function resolve<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
    serveStaleOn: (error: unknown) => boolean,
  ): Promise<Resolved<T>> {
    const entry = await load(key);
    if (entry !== undefined && isFresh(entry)) {
      return { value: entry.value as T };
    }

    // A recent failure: don't hit the source again yet.
    const failure = failures.get(key);
    const failed = (error: unknown): Resolved<T> => {
      if (entry !== undefined && isUsableStale(entry) && serveStaleOn(error)) {
        return {
          value: entry.value as T,
          stale: { storedAt: entry.storedAt ?? entry.expiresAt - ttlMs, error },
        };
      }
      throw error;
    };
    if (failure !== undefined) {
      if (failure.until > now()) return failed(failure.error);
      failures.delete(key);
    }

    try {
      const fresh = await fn();
      await set(key, fresh, ttlMs);
      return { value: fresh };
    } catch (error) {
      if (negativeTtlMs > 0) {
        failures.set(key, { error, until: now() + negativeTtlMs });
        while (failures.size > maxMemoryEntries) {
          const oldest = failures.keys().next();
          if (oldest.done) break;
          failures.delete(oldest.value);
        }
      }
      return failed(error);
    }
  }

  async function wrap<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
    wrapOpts: WrapOptions<T> = {},
  ): Promise<T> {
    const serveStaleOn = wrapOpts.serveStaleOn ?? (() => true);
    let shared = inFlight.get(key) as Promise<Resolved<T>> | undefined;
    if (shared === undefined) {
      const started: Promise<Resolved<T>> = resolve(key, ttlMs, fn, serveStaleOn).finally(() => {
        if (inFlight.get(key) === started) inFlight.delete(key);
      });
      inFlight.set(key, started as Promise<Resolved<unknown>>);
      shared = started;
    }
    const result = await shared;
    if (result.stale !== undefined) {
      try {
        wrapOpts.onStale?.({ value: result.value, storedAt: result.stale.storedAt, error: result.stale.error });
      } catch {
        // A faulty notice callback must never break the data path.
      }
    }
    return result.value;
  }

  async function removeFile(key: string): Promise<void> {
    try {
      await fs.rm(/*turbopackIgnore: true*/ filePathFor(key), { force: true });
    } catch {
      // Best-effort removal; a leftover file is harmless (treated as a miss).
    }
  }

  async function invalidate(key?: string): Promise<void> {
    if (key !== undefined) {
      memory.delete(key);
      failures.delete(key);
      await removeFile(key);
      return;
    }

    memory.clear();
    failures.clear();
    try {
      const names = await fs.readdir(/*turbopackIgnore: true*/ dir);
      const prefix = `${namespace}.`;
      await Promise.all(
        names
          .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
          .map((name) =>
            fs.rm(path.join(/*turbopackIgnore: true*/ dir, name), { force: true }).catch(() => undefined),
          ),
      );
    } catch {
      // Directory absent or unreadable: nothing persisted to clear.
    }
  }

  async function expire(key?: string): Promise<void> {
    if (key === undefined) {
      failures.clear();
      // Disk-only entries are picked up lazily; expire what is loaded, and the rest on read.
      for (const [k, entry] of memory) memory.set(k, { ...entry, expiresAt: Math.min(entry.expiresAt, now() - 1) });
      try {
        const names = await fs.readdir(/*turbopackIgnore: true*/ dir);
        const prefix = `${namespace}.`;
        await Promise.all(
          names
            .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
            .map((name) => expireFile(path.join(/*turbopackIgnore: true*/ dir, name))),
        );
      } catch {
        // Directory absent or unreadable.
      }
      return;
    }

    failures.delete(key);
    const entry = memory.get(key) ?? (await readFromDisk(key));
    if (entry === undefined) return;
    const expired: Entry<unknown> = { ...entry, expiresAt: Math.min(entry.expiresAt, now() - 1) };
    remember(key, expired);
    await expireFile(filePathFor(key), expired);
  }

  async function expireFile(file: string, known?: Entry<unknown>): Promise<void> {
    try {
      let entry = known;
      if (entry === undefined) {
        const parsed: unknown = JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ file, "utf8"));
        if (!isEntry(parsed)) return;
        entry = parsed;
      }
      const expired = { ...entry, expiresAt: Math.min(entry.expiresAt, now() - 1) };
      await fs.writeFile(/*turbopackIgnore: true*/ file, JSON.stringify(expired), "utf8");
    } catch {
      // Best-effort: worst case the entry just stays fresh until its TTL.
    }
  }

  return { get, set, wrap, invalidate, expire };
}

export default createCache;
