import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const session = { username: "" };
vi.mock("../session", () => ({ getSession: async () => session }));

const { isPapersAdmin, papersAccess, papersConfigured } = await import("../papers");
const { subjectFor, verifyToken } = await import("@usp/core/papers");

const KEY = "test-papers-signing-key-0123456789";

afterEach(() => {
  vi.unstubAllEnvs();
  session.username = "";
});

describe("papers config", () => {
  it("needs both the API address and the signing key", () => {
    vi.stubEnv("PAPERS_API_URL", "");
    vi.stubEnv("PAPERS_SIGNING_KEY", KEY);
    expect(papersConfigured()).toBe(false);
    vi.stubEnv("PAPERS_API_URL", "https://papers.example.dev");
    expect(papersConfigured()).toBe(true);
  });

  it("matches admins by register number, ignoring case and spaces", () => {
    vi.stubEnv("PAPERS_ADMINS", " 41110234 , 4211abc ");
    expect(isPapersAdmin("41110234")).toBe(true);
    expect(isPapersAdmin("4211ABC")).toBe(true);
    expect(isPapersAdmin("41110235")).toBe(false);
    vi.stubEnv("PAPERS_ADMINS", "");
    expect(isPapersAdmin("")).toBe(false);
  });
});

describe("papersAccess", () => {
  it("is null when signed out or not configured", async () => {
    vi.stubEnv("PAPERS_API_URL", "https://papers.example.dev");
    vi.stubEnv("PAPERS_SIGNING_KEY", KEY);
    expect(await papersAccess()).toBeNull();
    session.username = "41110234";
    vi.stubEnv("PAPERS_SIGNING_KEY", "");
    expect(await papersAccess()).toBeNull();
  });

  it("signs a student token the Worker accepts, without the register number in it", async () => {
    vi.stubEnv("PAPERS_API_URL", "https://papers.example.dev/");
    vi.stubEnv("PAPERS_SIGNING_KEY", KEY);
    vi.stubEnv("PAPERS_ADMINS", "41119999");
    session.username = "41110234";
    const access = await papersAccess();
    expect(access).toMatchObject({ apiUrl: "https://papers.example.dev", isAdmin: false });
    const payload = await verifyToken(access!.token, KEY);
    expect(payload).toMatchObject({ role: "student", sub: await subjectFor("41110234", KEY) });
    expect(atob(access!.token.split(".")[0]!.replace(/-/g, "+").replace(/_/g, "/"))).not.toContain("41110234");
  });

  it("gives admins the admin role", async () => {
    vi.stubEnv("PAPERS_API_URL", "https://papers.example.dev");
    vi.stubEnv("PAPERS_SIGNING_KEY", KEY);
    vi.stubEnv("PAPERS_ADMINS", "41110234");
    session.username = "41110234";
    const access = await papersAccess();
    expect(access?.isAdmin).toBe(true);
    expect((await verifyToken(access!.token, KEY))?.role).toBe("admin");
  });
});
