import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** proxy.ts keeps a module-level cache, so each test loads a fresh copy. */
async function loadProxy() {
  vi.resetModules();
  return (await import("../../proxy")).proxy;
}

function page(path: string) {
  return new NextRequest(`https://sistmate.vercel.app${path}`, { headers: { accept: "text/html" } });
}

/** NextResponse.rewrite / next() mark themselves with these middleware headers. */
const rewrittenTo = (res: Response) => res.headers.get("x-middleware-rewrite");
const passedThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("proxy maintenance mode", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ on: false })));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("lets every page through while maintenance is off", async () => {
    const proxy = await loadProxy();
    for (const path of ["/", "/login", "/attendance"]) {
      const res = await proxy(page(path));
      expect(passedThrough(res)).toBe(true);
    }
  });

  it("shows the maintenance page for signed-in pages while it is on", async () => {
    vi.stubEnv("MAINTENANCE", "1");
    const proxy = await loadProxy();
    for (const path of ["/", "/login", "/welcome", "/attendance", "/papers", "/results/wrapped"]) {
      const res = await proxy(page(path));
      expect(rewrittenTo(res)).toBe("https://sistmate.vercel.app/maintenance.html");
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("keeps the public tools open while it is on, without asking the Worker", async () => {
    vi.stubEnv("MAINTENANCE", "1");
    const proxy = await loadProxy();
    for (const path of [
      "/attendance-calculator",
      "/cgpa-calculator",
      "/grade-points",
      "/install",
      "/install/capture/android",
      "/offline",
    ]) {
      const res = await proxy(page(path));
      expect(passedThrough(res), path).toBe(true);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not open look-alike paths", async () => {
    vi.stubEnv("MAINTENANCE", "1");
    const proxy = await loadProxy();
    for (const path of ["/installer", "/grade-points-old", "/offline2"]) {
      const res = await proxy(page(path));
      expect(rewrittenTo(res), path).toBe("https://sistmate.vercel.app/maintenance.html");
    }
  });

  it("follows the Worker's switch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ on: true })));
    const proxy = await loadProxy();
    expect(rewrittenTo(await proxy(page("/marks")))).toBe("https://sistmate.vercel.app/maintenance.html");
    expect(passedThrough(await proxy(page("/cgpa-calculator")))).toBe(true);
  });

  it("fails open when the Worker can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("down");
    }));
    const proxy = await loadProxy();
    expect(passedThrough(await proxy(page("/marks")))).toBe(true);
  });
});
