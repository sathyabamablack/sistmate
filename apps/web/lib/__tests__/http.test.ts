import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { isSameOriginNavigation, requestOrigin } = await import("../http");

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
