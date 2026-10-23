import { describe, expect, it } from "vitest";
import { decodeJwtExpiry, erpSessionExpiry, isJwtExpired } from "../jwt";

function jwt(claims: unknown): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(claims)}.signature`;
}

describe("decodeJwtExpiry", () => {
  it("returns exp in milliseconds", () => {
    expect(decodeJwtExpiry(jwt({ exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
  });
  it("handles base64url payloads that need padding and non-ASCII claims", () => {
    expect(decodeJwtExpiry(jwt({ name: "Ünï", exp: 1_800_000_001 }))).toBe(1_800_000_001_000);
  });
  it("returns null for anything unreadable", () => {
    const bad = [undefined, null, "", "abc", "a.b.c", "a.!!!.c", jwt({}), jwt({ exp: "soon" }), jwt([1, 2]), jwt(null)];
    for (const token of bad) expect(decodeJwtExpiry(token)).toBeNull();
  });
});

describe("isJwtExpired", () => {
  it("is true only when exp has passed", () => {
    const now = 1_700_000_000_000;
    expect(isJwtExpired(jwt({ exp: 1_699_999_999 }), now)).toBe(true);
    expect(isJwtExpired(jwt({ exp: 1_700_000_000 }), now)).toBe(true);
    expect(isJwtExpired(jwt({ exp: 1_700_000_100 }), now)).toBe(false);
  });
  it("never calls a token without exp (or a non-JWT) expired", () => {
    expect(isJwtExpired(jwt({ sub: "1" }))).toBe(false);
    expect(isJwtExpired("opaque-token")).toBe(false);
    expect(isJwtExpired(undefined)).toBe(false);
  });
});

describe("erpSessionExpiry", () => {
  it("reads the token inside the serialized session", () => {
    const session = JSON.stringify({ token: jwt({ exp: 1_800_000_000 }), regNo: "1", studentId: "2" });
    expect(erpSessionExpiry(session)).toBe(1_800_000_000_000);
  });
  it("is null for missing or malformed sessions", () => {
    expect(erpSessionExpiry(undefined)).toBeNull();
    expect(erpSessionExpiry("not json")).toBeNull();
    expect(erpSessionExpiry(JSON.stringify({ regNo: "1" }))).toBeNull();
  });
});
