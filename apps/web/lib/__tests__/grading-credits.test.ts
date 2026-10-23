import { describe, expect, it } from "vitest";
import {
  creditOverrideCookie,
  gradingCookieString,
  normalizeCredits,
  readCookie,
  withCreditOverride,
} from "../grading-credits";
import { parseGradingSettings } from "../grading-settings";

const read = (cookie: string) => parseGradingSettings(readCookie(cookie.split(";")[0]!, "usp-grading"));

describe("normalizeCredits", () => {
  it("rounds to the nearest half and clamps to 0-12", () => {
    expect(normalizeCredits("3")).toBe(3);
    expect(normalizeCredits("2.7")).toBe(2.5);
    expect(normalizeCredits("-4")).toBe(0);
    expect(normalizeCredits("40")).toBe(12);
  });
  it("rejects blanks and junk", () => {
    expect(normalizeCredits("")).toBeNull();
    expect(normalizeCredits("  ")).toBeNull();
    expect(normalizeCredits("abc")).toBeNull();
  });
});

describe("withCreditOverride", () => {
  const base = { preset: "letter", credits: { CS1: 4 } };
  it("adds an override that differs from the official default", () => {
    expect(withCreditOverride(base, "CS2", 2, 3)).toEqual({ preset: "letter", credits: { CS1: 4, CS2: 2 } });
  });
  it("removes the override when the value equals the official default", () => {
    expect(withCreditOverride(base, "CS1", 3, 3)).toEqual({ preset: "letter", credits: {} });
  });
  it("does not mutate its input", () => {
    withCreditOverride(base, "CS1", 3, 3);
    expect(base.credits).toEqual({ CS1: 4 });
  });
});

describe("readCookie", () => {
  it("finds and decodes a cookie among others", () => {
    expect(readCookie("a=1; usp-grading=%7B%22x%22%3A1%7D; b=2", "usp-grading")).toBe('{"x":1}');
  });
  it("returns undefined when absent", () => {
    expect(readCookie("a=1; b=2", "usp-grading")).toBeUndefined();
    expect(readCookie("", "usp-grading")).toBeUndefined();
  });
});

describe("creditOverrideCookie", () => {
  it("merges into the existing cookie, keeping template and other corrections", () => {
    const existing = gradingCookieString({ preset: "sathyabama", credits: { CS1: 4 } });
    const header = `theme=dark; ${existing.split(";")[0]}`;
    const next = creditOverrideCookie(header, "CS2", 1.5, 2);
    expect(read(next)).toEqual({ preset: "sathyabama", credits: { CS1: 4, CS2: 1.5 } });
  });
  it("reads a retired template from an old cookie as the official scheme, keeping corrections", () => {
    const existing = gradingCookieString({ preset: "four-credit", credits: { CS1: 4 } });
    const next = creditOverrideCookie(existing.split(";")[0]!, "CS2", 2, 3);
    expect(read(next)).toEqual({ preset: "sathyabama", credits: { CS1: 4, CS2: 2 } });
  });
  it("starts from the defaults when no cookie exists", () => {
    const next = creditOverrideCookie("", "CS2", 1, 3);
    expect(read(next)).toEqual({ preset: "sathyabama", credits: { CS2: 1 } });
  });
  it("drops the override when set back to the template default", () => {
    const existing = gradingCookieString({ preset: "sathyabama", credits: { CS2: 1 } });
    const next = creditOverrideCookie(existing.split(";")[0]!, "CS2", 3, 3);
    expect(read(next)).toEqual({ preset: "sathyabama", credits: {} });
  });
  it("sets path, a one-year max-age and SameSite=Lax", () => {
    const next = creditOverrideCookie("", "CS2", 1, 3);
    expect(next).toContain("path=/");
    expect(next).toContain("max-age=31536000");
    expect(next).toContain("SameSite=Lax");
  });
});
