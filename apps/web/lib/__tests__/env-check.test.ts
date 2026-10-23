import { describe, expect, it, vi } from "vitest";
import { bootMessages, checkEnvironment, parseDataSource, probeReachability } from "../env-check";

const GOOD_SECRET = "a".repeat(40);

describe("parseDataSource", () => {
  it("is case-insensitive and trims", () => {
    expect(parseDataSource("live").mode).toBe("live");
    expect(parseDataSource(" Live ")).toMatchObject({ mode: "live", exact: false, caseFixed: true });
    expect(parseDataSource("MOCK")).toMatchObject({ mode: "mock", caseFixed: true });
  });
  it("falls back to mock for unknown or empty values", () => {
    expect(parseDataSource("prod")).toMatchObject({ mode: "mock", exact: false, caseFixed: false });
    expect(parseDataSource(undefined)).toMatchObject({ mode: "mock", unset: true });
  });
});

describe("checkEnvironment", () => {
  const live = {
    NODE_ENV: "production",
    DATA_SOURCE: "live",
    SESSION_SECRET: GOOD_SECRET,
    ERP_BASE_URL: "https://erp.example.edu",
    LMS_BASE_URL: "https://lms.example.edu",
  };

  it("passes a complete live setup", () => {
    const r = checkEnvironment(live, "v20.11.0");
    expect(r).toMatchObject({
      ok: true,
      dataSource: "live",
      sessionSecretOk: true,
      erpConfigured: true,
      lmsConfigured: true,
    });
    expect(r.checks.every((c) => c.status === "ok")).toBe(true);
  });

  it("fails production without a long enough secret and says how to fix it", () => {
    for (const secret of [undefined, "short"]) {
      const r = checkEnvironment({ ...live, SESSION_SECRET: secret }, "v20.11.0");
      expect(r.ok).toBe(false);
      expect(r.sessionSecretOk).toBe(false);
      const check = r.checks.find((c) => c.id === "secret")!;
      expect(check.status).toBe("fail");
      expect(check.fix).toContain("randomBytes(32)");
    }
  });

  it("only warns about the secret outside production", () => {
    const r = checkEnvironment({ ...live, NODE_ENV: "development", SESSION_SECRET: undefined }, "v20.11.0");
    expect(r.ok).toBe(true);
    expect(r.sessionSecretOk).toBe(true);
    expect(r.checks.find((c) => c.id === "secret")!.status).toBe("warn");
  });

  it("requires ERP_BASE_URL in live mode, but treats Moodle as optional", () => {
    const r = checkEnvironment({ ...live, ERP_BASE_URL: undefined, LMS_BASE_URL: "" }, "v20.11.0");
    expect(r.ok).toBe(false);
    expect(r.erpConfigured).toBe(false);
    expect(r.lmsConfigured).toBe(false);
    expect(r.checks.find((c) => c.id === "erp")!.status).toBe("fail");
    expect(r.checks.find((c) => c.id === "lms")!.status).toBe("warn");
  });

  it("rejects values that are not web addresses", () => {
    const r = checkEnvironment({ ...live, ERP_BASE_URL: "erp.example.edu", LMS_BASE_URL: "ftp://x" }, "v20.11.0");
    expect(r.erpConfigured).toBe(false);
    expect(r.lmsConfigured).toBe(false);
  });

  it("warns, not fails, for demo mode and unknown DATA_SOURCE values", () => {
    for (const value of ["mock", "prod", undefined]) {
      const r = checkEnvironment(
        { NODE_ENV: "production", SESSION_SECRET: GOOD_SECRET, DATA_SOURCE: value },
        "v20.11.0",
      );
      expect(r.ok).toBe(true);
      expect(r.dataSource).toBe("mock");
      expect(r.checks.find((c) => c.id === "dataSource")!.status).toBe("warn");
    }
  });

  it("accepts Live written with capitals but nudges", () => {
    const r = checkEnvironment({ ...live, DATA_SOURCE: "Live" }, "v20.11.0");
    expect(r.dataSource).toBe("live");
    expect(r.checks.find((c) => c.id === "dataSource")!.status).toBe("warn");
  });

  it("flags an old Node", () => {
    expect(checkEnvironment(live, "v18.19.0").checks.find((c) => c.id === "node")!.status).toBe("warn");
    expect(checkEnvironment(live, "v20.9.0").checks.find((c) => c.id === "node")!.status).toBe("ok");
    expect(checkEnvironment(live, "v22.1.0").checks.find((c) => c.id === "node")!.status).toBe("ok");
  });

  it("never puts env values in its output", () => {
    const text = JSON.stringify(checkEnvironment(live, "v20.11.0"));
    expect(text).not.toContain(GOOD_SECRET);
    expect(text).not.toContain("erp.example.edu");
    const short = JSON.stringify(checkEnvironment({ ...live, SESSION_SECRET: "x".repeat(10) }));
    expect(short).not.toContain("x".repeat(10));
  });
});

describe("bootMessages", () => {
  it("returns only problems, with the fix included", () => {
    const report = checkEnvironment({ NODE_ENV: "production", DATA_SOURCE: "live" }, "v20.11.0");
    const messages = bootMessages(report);
    expect(messages.some((m) => m.level === "error" && m.text.includes("SESSION_SECRET"))).toBe(true);
    expect(messages.every((m) => m.text.startsWith("[setup]"))).toBe(true);
  });
});

describe("probeReachability", () => {
  it("counts any HTTP answer as reachable and reports the status", async () => {
    const impl = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response("blocked", { status: 403 }));
    const result = await probeReachability("https://erp.example.edu/some/path", 1000, impl as unknown as typeof fetch);
    expect(result).toEqual({ reachable: true, status: 403 });
    // Only the origin is requested, with no credentials.
    const [url, init] = impl.mock.calls[0]!;
    expect(url).toBe("https://erp.example.edu/");
    expect(init?.credentials).toBe("omit");
  });
  it("reports a network failure as unreachable", async () => {
    const impl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await probeReachability("https://erp.example.edu", 1000, impl as unknown as typeof fetch)).toEqual({
      reachable: false,
    });
  });
  it("is unreachable for a missing or invalid address", async () => {
    expect(await probeReachability(undefined)).toEqual({ reachable: false });
    expect(await probeReachability("nope")).toEqual({ reachable: false });
  });
});
