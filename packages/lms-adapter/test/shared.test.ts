import { describe, it, expect } from "vitest";
import {
  unixToIso,
  stripHtml,
  decodeEntities,
  tidyGrade,
  moduleToEventType,
  normalizeSiteUrl,
} from "../src/parsers/index";

describe("unixToIso", () => {
  it("converts UNIX seconds to ISO UTC", () => {
    expect(unixToIso(1792088940)).toBe("2026-10-15T18:29:00.000Z");
  });

  it("treats 0 / null / undefined / negative / NaN as 'not set'", () => {
    expect(unixToIso(0)).toBeNull();
    expect(unixToIso(null)).toBeNull();
    expect(unixToIso(undefined)).toBeNull();
    expect(unixToIso(-5)).toBeNull();
    expect(unixToIso(Number.NaN)).toBeNull();
  });
});

describe("stripHtml / decodeEntities", () => {
  it("removes tags, decodes entities and collapses whitespace", () => {
    expect(stripHtml("<p>You scored <strong>18/20</strong> on &#39;BCNF&#39;.<br>Well   done</p>")).toBe(
      "You scored 18/20 on 'BCNF'. Well done",
    );
  });

  it("drops script/style blocks", () => {
    expect(stripHtml("<style>p{}</style><p>Hi</p><script>alert(1)</script>")).toBe("Hi");
  });

  it("decodes in a single pass (no double decoding)", () => {
    expect(decodeEntities("&amp;lt;b&amp;gt; &mdash; &#x41;")).toBe("&lt;b&gt; — A");
  });

  it("handles null/undefined", () => {
    expect(stripHtml(undefined)).toBe("");
    expect(stripHtml(null)).toBe("");
  });
});

describe("tidyGrade", () => {
  it("trims trailing zeros in Moodle grade strings", () => {
    expect(tidyGrade("18.00 / 20.00")).toBe("18 / 20");
    expect(tidyGrade("9.50 / 10.00")).toBe("9.5 / 10");
    expect(tidyGrade("8.05")).toBe("8.05");
    expect(tidyGrade("A+")).toBe("A+");
  });

  it("maps 'no grade' markers to null", () => {
    expect(tidyGrade("-")).toBeNull();
    expect(tidyGrade("")).toBeNull();
    expect(tidyGrade("Not graded")).toBeNull();
  });
});

describe("moduleToEventType", () => {
  it("maps assign → assignment, quiz → exam, else other", () => {
    expect(moduleToEventType("assign")).toBe("assignment");
    expect(moduleToEventType("mod_assign")).toBe("assignment");
    expect(moduleToEventType("quiz")).toBe("exam");
    expect(moduleToEventType("mod_quiz")).toBe("exam");
    expect(moduleToEventType("forum")).toBe("other");
    expect(moduleToEventType(null)).toBe("other");
  });
});

describe("normalizeSiteUrl", () => {
  it("strips trailing slashes", () => {
    expect(normalizeSiteUrl("https://lms.example.edu///")).toBe("https://lms.example.edu");
  });
});
