import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { checkRate, isSameOriginNavigation, requestOrigin } = await import("../http");

const req = (headers: Record<string, string>, url = "http://localhost:3000/api/auth/expired") =>
  new Request(url, { headers });

describe("isSameOriginNavigation", () => {
  it("allows our own pages, the address bar, and browsers that send no header", () => {
    expect(isSameOriginNavigation(req({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOriginNavigation(req({ "sec-fetch-site": "none" }))).toBe(true);
    expect(isSameOriginNavigation(req({}))).toBe(true);
  });
  it("rejects other sites, including sibling subdomains", () => {
    expect(isSameOriginNavigation(req({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOriginNavigation(req({ "sec-fetch-site": "same-site" }))).toBe(false);
  });
});

describe("requestOrigin", () => {
  it("uses forwarded headers from a proxy", () => {
    expect(requestOrigin(req({ "x-forwarded-proto": "https", "x-forwarded-host": "portal.example.com" }))).toBe(
      "https://portal.example.com",
    );
  });
  it("falls back to the request itself", () => {
    expect(requestOrigin(req({}))).toBe("http://localhost:3000");
  });
});

describe("checkRate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("counts in memory when no store is configured", async () => {
    const key = `mem-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(await checkRate(key, 3)).toBe(false);
    expect(await checkRate(key, 3)).toBe(true);
  });

  it("uses the shared store when configured, and stores only a hash of the key", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
    let body = "";
    let count = 0;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      body = String(init.body);
      count += 1;
      return new Response(JSON.stringify([{ result: count }, { result: 1 }]));
    });
    expect(await checkRate("1.2.3.4:21cs001", 2)).toBe(false);
    expect(await checkRate("1.2.3.4:21cs001", 2)).toBe(false);
    expect(await checkRate("1.2.3.4:21cs001", 2)).toBe(true);
    expect(body).toContain('"INCR"');
    expect(body).not.toContain("21cs001");
  });

  it("falls back to memory when the store fails", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
    vi.stubGlobal("fetch", async () => {
      throw new Error("down");
    });
    const key = `fail-${Math.random()}`;
    expect(await checkRate(key, 1)).toBe(false);
    expect(await checkRate(key, 1)).toBe(true);
  });
});
