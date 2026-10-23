import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCache } from "../src/index";

let dir: string;
let clock: number;
const now = () => clock;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "usp-cache-test-"));
  clock = Date.now();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

const make = (extra: Parameters<typeof createCache>[0] = {}) => createCache({ dir, now, ...extra });
const failing = (message = "down") => async (): Promise<string> => {
  throw new Error(message);
};

describe("wrap basics", () => {
  it("returns a fresh value without calling fn again", async () => {
    const cache = make();
    const fn = vi.fn(async () => "a");
    expect(await cache.wrap("k", 1000, fn)).toBe("a");
    expect(await cache.wrap("k", 1000, fn)).toBe("a");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("refetches after expiry", async () => {
    const cache = make();
    const fn = vi.fn().mockResolvedValueOnce("a").mockResolvedValueOnce("b");
    await cache.wrap("k", 1000, fn);
    clock += 1001;
    expect(await cache.wrap("k", 1000, fn)).toBe("b");
  });

  it("survives a new instance via the disk tier", async () => {
    await make().set("k", { n: 1 }, 1000);
    expect(await make().get("k")).toEqual({ n: 1 });
  });
});

describe("set failures", () => {
  it("never fails a section and warns once when the directory is unusable", async () => {
    const blocker = join(dir, "not-a-dir");
    await writeFile(blocker, "x");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cache = createCache({ dir: join(blocker, "nested"), now });
    const fn = vi.fn(async () => 42);
    expect(await cache.wrap("a", 1000, fn)).toBe(42);
    expect(await cache.wrap("b", 1000, fn)).toBe(42);
    // Memory still serves the first value.
    expect(await cache.wrap("a", 1000, fn)).toBe(42);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("stale-while-error", () => {
  it("serves the expired entry and reports when it was stored", async () => {
    const cache = make();
    await cache.wrap("k", 1000, async () => "old");
    const savedAt = clock;
    clock += 5000;
    const onStale = vi.fn();
    const value = await cache.wrap("k", 1000, failing("ERP down"), { onStale });
    expect(value).toBe("old");
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(onStale.mock.calls[0]![0]).toMatchObject({ value: "old", storedAt: savedAt });
  });

  it("serves stale from disk after a restart", async () => {
    await make().wrap("k", 1000, async () => "old");
    clock += 5000;
    expect(await make().wrap("k", 1000, failing())).toBe("old");
  });

  it("propagates the error when nothing is stored", async () => {
    await expect(make().wrap("k", 1000, failing("boom"))).rejects.toThrow("boom");
  });

  it("does not serve stale for errors the caller excludes", async () => {
    const cache = make();
    await cache.wrap("k", 1000, async () => "old");
    clock += 5000;
    await expect(
      cache.wrap("k", 1000, failing("expired session"), { serveStaleOn: () => false }),
    ).rejects.toThrow("expired session");
  });

  it("stops serving entries older than maxStaleMs", async () => {
    const cache = make({ maxStaleMs: 10_000 });
    await cache.wrap("k", 1000, async () => "old");
    clock += 1000 + 10_001;
    await expect(cache.wrap("k", 1000, failing())).rejects.toThrow("down");
  });

  it("expire() keeps the value as a stale fallback but forces a refetch", async () => {
    const cache = make();
    await cache.wrap("k", 60_000, async () => "old");
    await cache.expire("k");
    expect(await cache.wrap("k", 60_000, async () => "new")).toBe("new");
    await cache.expire();
    expect(await cache.wrap("k", 60_000, failing())).toBe("new");
  });

  it("invalidate() removes the stale copy", async () => {
    const cache = make();
    await cache.wrap("k", 1000, async () => "old");
    await cache.invalidate("k");
    await expect(cache.wrap("k", 1000, failing())).rejects.toThrow("down");
  });
});

describe("in-flight de-duplication", () => {
  it("shares one fn call between concurrent wraps and notifies each caller", async () => {
    const cache = make();
    await cache.wrap("k", 1000, async () => "old");
    clock += 5000;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const fn = vi.fn(async (): Promise<string> => {
      await gate;
      throw new Error("down");
    });
    const a = vi.fn();
    const b = vi.fn();
    const pa = cache.wrap("k", 1000, fn, { onStale: a });
    const pb = cache.wrap("k", 1000, fn, { onStale: b });
    release();
    expect(await Promise.all([pa, pb])).toEqual(["old", "old"]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("shares a fresh result too", async () => {
    const cache = make();
    const fn = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 7;
    });
    const results = await Promise.all([1, 2, 3].map(() => cache.wrap("k", 1000, fn)));
    expect(results).toEqual([7, 7, 7]);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("negative cache", () => {
  it("re-throws a recent failure without calling fn, then retries after the window", async () => {
    const cache = make({ negativeTtlMs: 30_000 });
    const fn = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce("up");
    await expect(cache.wrap("k", 1000, fn)).rejects.toThrow("down");
    await expect(cache.wrap("k", 1000, fn)).rejects.toThrow("down");
    expect(fn).toHaveBeenCalledTimes(1);
    clock += 30_001;
    expect(await cache.wrap("k", 1000, fn)).toBe("up");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("is cleared by invalidate so Refresh always tries again", async () => {
    const cache = make();
    const fn = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue("up");
    await expect(cache.wrap("k", 1000, fn)).rejects.toThrow();
    await cache.invalidate("k");
    expect(await cache.wrap("k", 1000, fn)).toBe("up");
  });

  it("is cleared by expire too", async () => {
    const cache = make();
    const fn = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue("up");
    await expect(cache.wrap("k", 1000, fn)).rejects.toThrow();
    await cache.expire("k");
    expect(await cache.wrap("k", 1000, fn)).toBe("up");
  });

  it("can be disabled", async () => {
    const cache = make({ negativeTtlMs: 0 });
    const fn = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce("up");
    await expect(cache.wrap("k", 1000, fn)).rejects.toThrow();
    expect(await cache.wrap("k", 1000, fn)).toBe("up");
  });
});

describe("housekeeping", () => {
  it("caps in-memory entries, falling back to disk for evicted ones", async () => {
    const cache = make({ maxMemoryEntries: 2 });
    for (const k of ["a", "b", "c", "d"]) await cache.set(k, k.toUpperCase(), 1000);
    expect(await cache.get("a")).toBe("A");
    expect(await cache.get("d")).toBe("D");
  });

  it("prunes disk files past their stale window", async () => {
    const cache = make({ maxStaleMs: 1000 });
    await cache.set("old", 1, 100);
    expect(await readdir(dir)).toHaveLength(1);
    // Age the file on disk and move the clock past ttl + stale window.
    const longAgo = new Date(clock - 60_000);
    for (const name of await readdir(dir)) await utimes(join(dir, name), longAgo, longAgo);
    clock += 11 * 60 * 1000;
    await cache.set("new", 2, 100); // triggers an opportunistic prune
    await vi.waitFor(async () => expect(await readdir(dir)).toHaveLength(1));
    expect(await cache.get("new")).toBe(2);
  });
});
