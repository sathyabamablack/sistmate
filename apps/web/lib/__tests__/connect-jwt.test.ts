import { describe, expect, it } from "vitest";
import { connectionState, jwtExpiry } from "../connect/jwt";

function b64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function makeJwt(payload: unknown): string {
  return `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}.sig`;
}

describe("jwtExpiry", () => {
  it("reads exp from a base64url payload", () => {
    const exp = Math.floor(Date.UTC(2026, 9, 12, 16, 10) / 1000);
    expect(jwtExpiry(makeJwt({ exp }))?.toISOString()).toBe("2026-10-12T16:10:00.000Z");
  });

  it("handles url-safe characters and non-ASCII claims", () => {
    // '>>>???' encodes to '+' and '/' in plain base64; vary the padding until
    // the payload contains the url-safe '-' or '_' to prove they are decoded.
    let token = "";
    for (let pad = 0; pad < 3 && !/[-_]/.test(token.split(".")[1] ?? ""); pad++) {
      token = makeJwt({ name: "Zoë" + " ".repeat(pad) + ">>>???", exp: 2_000_000_000 });
    }
    expect(token.split(".")[1]).toMatch(/[-_]/);
    expect(jwtExpiry(token)?.getTime()).toBe(2_000_000_000_000);
  });

  it("returns null for anything that is not a usable JWT", () => {
    expect(jwtExpiry(undefined)).toBeNull();
    expect(jwtExpiry("")).toBeNull();
    expect(jwtExpiry("not-a-jwt")).toBeNull();
    expect(jwtExpiry("a.b.c")).toBeNull();
    expect(jwtExpiry("a.%%%.c")).toBeNull();
    expect(jwtExpiry(makeJwt({}))).toBeNull();
    expect(jwtExpiry(makeJwt({ exp: "soon" }))).toBeNull();
    expect(jwtExpiry(makeJwt({ exp: -5 }))).toBeNull();
    expect(jwtExpiry(makeJwt(null))).toBeNull();
    expect(jwtExpiry(makeJwt([1, 2]))).toBeNull();
    expect(jwtExpiry(`x.${b64url("{broken")}.z`)).toBeNull();
  });
});

describe("connectionState", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const at = (iso: string) => makeJwt({ exp: Math.floor(new Date(iso).getTime() / 1000) });

  it("is connected until the expiry", () => {
    const s = connectionState(at("2026-10-12T16:10:00Z"), now);
    expect(s.status).toBe("connected");
  });

  it("is expired once the expiry has passed", () => {
    expect(connectionState(at("2026-10-12T11:59:59Z"), now).status).toBe("expired");
    expect(connectionState(at("2026-10-12T12:00:00Z"), now).status).toBe("expired");
  });

  it("distinguishes no token from a token without an expiry", () => {
    expect(connectionState(undefined, now).status).toBe("none");
    expect(connectionState("opaque-token", now).status).toBe("unknown");
  });
});
