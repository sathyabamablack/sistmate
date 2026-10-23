import { describe, expect, it } from "vitest";
import { MAX_AMOUNT, formatInr, parseAmount, upiAppLink, upiLink, validAmount } from "../donate";

const req = { id: "me@upi", name: "Student Portal", amount: 50, note: "Support Student Portal" };

describe("parseAmount", () => {
  it("keeps digits only", () => {
    expect(parseAmount("1,2a0")).toBe(120);
    expect(parseAmount("₹ 50")).toBe(50);
  });
  it("rejects empty and oversized input", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("12345678")).toBeNull();
  });
});

describe("validAmount", () => {
  it("accepts whole rupees within limits", () => {
    expect(validAmount(1)).toBe(true);
    expect(validAmount(MAX_AMOUNT)).toBe(true);
  });
  it("rejects zero, over the limit, fractions and null", () => {
    expect(validAmount(0)).toBe(false);
    expect(validAmount(MAX_AMOUNT + 1)).toBe(false);
    expect(validAmount(10.5)).toBe(false);
    expect(validAmount(null)).toBe(false);
  });
});

describe("upi links", () => {
  it("builds the standard link with INR and an encoded name", () => {
    expect(upiLink(req)).toBe(
      "upi://pay?pa=me%40upi&pn=Student%20Portal&am=50&cu=INR&tn=Support%20Student%20Portal",
    );
  });
  it("picks the Google Pay scheme by platform", () => {
    expect(upiAppLink("gpay", req, false).startsWith("tez://upi/pay?")).toBe(true);
    expect(upiAppLink("gpay", req, true).startsWith("gpay://upi/pay?")).toBe(true);
    expect(upiAppLink("phonepe", req, false).startsWith("phonepe://pay?")).toBe(true);
    expect(upiAppLink("paytm", req, false).startsWith("paytmmp://pay?")).toBe(true);
  });
});

describe("formatInr", () => {
  it("uses Indian digit grouping", () => {
    expect(formatInr(100000)).toBe("₹1,00,000");
    expect(formatInr(50)).toBe("₹50");
  });
});
