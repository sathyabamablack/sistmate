import { describe, expect, it, vi } from "vitest";
import { INTEREST_KEY, getInterestStore, isValidToken, memberFor, memoryStore, upstashStore } from "../interest";

describe("interest tokens", () => {
  it("accepts a UUID and rejects anything odd", () => {
    expect(isValidToken("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
    expect(isValidToken("short")).toBe(false);
    expect(isValidToken("x".repeat(65))).toBe(false);
    expect(isValidToken("has spaces and ! symbols....")).toBe(false);
    expect(isValidToken(undefined)).toBe(false);
    expect(isValidToken(42)).toBe(false);
  });

  it("hashes the token with a salt, never storing it as sent", () => {
    const token = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    const a = memberFor(token, "salt-one");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain(token.slice(0, 8));
    expect(memberFor(token, "salt-one")).toBe(a);
    expect(memberFor(token, "salt-two")).not.toBe(a);
  });
});

describe("memory store", () => {
  it("counts each member once and lets it be withdrawn", async () => {
    const store = memoryStore();
    expect(await store.add("a")).toBe(1);
    expect(await store.add("a")).toBe(1);
    expect(await store.add("b")).toBe(2);
    expect(await store.remove("a")).toBe(1);
    expect(await store.count()).toBe(1);
  });
});

describe("upstash store", () => {
  const reply = (body: unknown, ok = true) =>
    vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response);

  it("adds with SADD then reads SCARD in one pipeline", async () => {
    const fetchMock = reply([{ result: 1 }, { result: 41 }]);
    const count = await upstashStore("https://db.example/", "tok", fetchMock as unknown as typeof fetch).add("m");
    expect(count).toBe(41);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://db.example/pipeline");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual([["SADD", INTEREST_KEY, "m"], ["SCARD", INTEREST_KEY]]);
  });

  it("throws when the store errors, so the route can switch the counter off", async () => {
    const bad = reply([{ error: "WRONGTYPE" }]);
    await expect(upstashStore("https://db.example", "t", bad as unknown as typeof fetch).count()).rejects.toThrow();
    const down = reply({}, false);
    await expect(upstashStore("https://db.example", "t", down as unknown as typeof fetch).count()).rejects.toThrow();
  });
});

describe("store selection", () => {
  it("uses Upstash, or Vercel KV's names, when configured", () => {
    expect(getInterestStore({ NODE_ENV: "production", UPSTASH_REDIS_REST_URL: "https://u", UPSTASH_REDIS_REST_TOKEN: "t" })).not.toBeNull();
    expect(getInterestStore({ NODE_ENV: "production", KV_REST_API_URL: "https://u", KV_REST_API_TOKEN: "t" })).not.toBeNull();
  });

  it("falls back to memory in development and switches off in production with no store", () => {
    expect(getInterestStore({ NODE_ENV: "development" })).not.toBeNull();
    expect(getInterestStore({ NODE_ENV: "production" })).toBeNull();
    expect(getInterestStore({ NODE_ENV: "production", UPSTASH_REDIS_REST_URL: "https://u" })).toBeNull();
  });
});
