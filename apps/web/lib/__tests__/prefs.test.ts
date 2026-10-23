import { describe, expect, it } from "vitest";
import {
  cleanOnboarding,
  DASHBOARD_SECTIONS,
  DEFAULT_PREFS,
  MAX_HIDDEN_COURSES,
  parsePrefs,
  PREFS_VERSION,
  prefsBootScript,
  prefsToDataAttributes,
  serializePrefs,
  TOUR_STATUSES,
  type Prefs,
} from "../prefs";

const make = (patch: Partial<Prefs>): Prefs => ({ ...DEFAULT_PREFS, ...patch });

describe("parsePrefs", () => {
  it("returns the defaults when there is no cookie", () => {
    expect(parsePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("")).toEqual(DEFAULT_PREFS);
  });

  it("falls back to the defaults for a bad cookie", () => {
    expect(parsePrefs("not json")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("{broken")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("null")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('"a string"')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("42")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("%E0%A4%A")).toEqual(DEFAULT_PREFS);
  });

  it("round-trips a full set of preferences, raw or URL-encoded", () => {
    const prefs = make({
      accent: "plum",
      density: "compact",
      text: "large",
      reduceMotion: true,
      home: "/timetable",
      dashboard: { order: ["notices", "today", "glance", "attendance", "due", "courses"], hidden: ["courses"] },
      attendanceThreshold: 80,
      passMark: 45,
      courseFilter: "all",
      timeFormat: "24h",
      hiddenCourses: [104, 87],
    });
    expect(parsePrefs(serializePrefs(prefs))).toEqual(prefs);
    expect(parsePrefs(encodeURIComponent(serializePrefs(prefs)))).toEqual(prefs);
  });

  it("ignores unknown option values one field at a time", () => {
    const p = parsePrefs(JSON.stringify({ accent: "neon", density: "compact", text: 3, home: "/admin", timeFormat: "9h" }));
    expect(p.accent).toBe("pine");
    expect(p.density).toBe("compact");
    expect(p.text).toBe("normal");
    expect(p.home).toBe("/");
    expect(p.timeFormat).toBe("12h");
  });

  it("clamps the numeric rules to their ranges and rounds them", () => {
    const at = (v: unknown) => parsePrefs(JSON.stringify({ v: PREFS_VERSION, attendanceThreshold: v })).attendanceThreshold;
    expect(at(10)).toBe(60);
    expect(at(99)).toBe(90);
    expect(at(79.6)).toBe(80);
    expect(parsePrefs(JSON.stringify({ passMark: 5 })).passMark).toBe(30);
    expect(parsePrefs(JSON.stringify({ passMark: 500 })).passMark).toBe(70);
    expect(parsePrefs(JSON.stringify({ passMark: 40 })).passMark).toBe(40);
  });

  it("drops the attendance requirement from a cookie written before the 80% change", () => {
    // A v1 cookie's requirement is the retired 75% line, so it is ignored.
    expect(parsePrefs(JSON.stringify({ v: 1, attendanceThreshold: 75 })).attendanceThreshold).toBe(80);
    expect(parsePrefs(JSON.stringify({ attendanceThreshold: 70 })).attendanceThreshold).toBe(80);
    // A current cookie keeps whatever the student chose.
    expect(
      parsePrefs(JSON.stringify({ v: PREFS_VERSION, attendanceThreshold: 70 })).attendanceThreshold,
    ).toBe(70);
  });

  it("lists this semester's courses only, until the student says otherwise", () => {
    expect(DEFAULT_PREFS.courseFilter).toBe("current");
    expect(parsePrefs(JSON.stringify({ v: PREFS_VERSION, courseFilter: "all" })).courseFilter).toBe("all");
    expect(parsePrefs(JSON.stringify({ v: PREFS_VERSION, courseFilter: "nope" })).courseFilter).toBe("current");
    // Cookies written before the filter existed get the default.
    expect(parsePrefs(JSON.stringify({ v: 1 })).courseFilter).toBe("current");
  });

  it("uses the defaults for numbers that are not numbers", () => {
    const p = parsePrefs(JSON.stringify({ v: PREFS_VERSION, attendanceThreshold: "80", passMark: null }));
    expect(p.attendanceThreshold).toBe(80);
    expect(p.passMark).toBe(50);
  });

  it("only treats reduceMotion as on when it is exactly true", () => {
    expect(parsePrefs(JSON.stringify({ reduceMotion: true })).reduceMotion).toBe(true);
    expect(parsePrefs(JSON.stringify({ reduceMotion: "true" })).reduceMotion).toBe(false);
    expect(parsePrefs(JSON.stringify({ reduceMotion: 1 })).reduceMotion).toBe(false);
  });
});

describe("hidden courses", () => {
  it("parses an old cookie without the field to an empty list", () => {
    expect(parsePrefs(JSON.stringify({ v: 1, accent: "plum" })).hiddenCourses).toEqual([]);
  });

  it("keeps positive integer ids once each and drops everything else", () => {
    const p = parsePrefs(JSON.stringify({ hiddenCourses: [104, "105", 104, 0, -3, 1.5, null, 87, 1e30] }));
    expect(p.hiddenCourses).toEqual([104, 87]);
    expect(parsePrefs(JSON.stringify({ hiddenCourses: "104" })).hiddenCourses).toEqual([]);
  });

  it("caps the list", () => {
    const ids = Array.from({ length: MAX_HIDDEN_COURSES + 50 }, (_, i) => i + 1);
    expect(parsePrefs(JSON.stringify({ hiddenCourses: ids })).hiddenCourses).toHaveLength(MAX_HIDDEN_COURSES);
  });
});

describe("dashboard order and hidden sections", () => {
  it("de-duplicates the order, drops unknown sections and appends missing ones", () => {
    const p = parsePrefs(
      JSON.stringify({ dashboard: { order: ["notices", "bogus", "notices", "today"], hidden: [] } }),
    );
    expect(p.dashboard.order).toEqual(["notices", "today", "glance", "attendance", "due", "courses"]);
    expect(new Set(p.dashboard.order).size).toBe(DASHBOARD_SECTIONS.length);
  });

  it("de-duplicates hidden sections and drops unknown ones", () => {
    const p = parsePrefs(JSON.stringify({ dashboard: { hidden: ["due", "due", "nope", 7, "courses"] } }));
    expect(p.dashboard.hidden).toEqual(["due", "courses"]);
  });

  it("uses the default order for a missing or malformed dashboard value", () => {
    expect(parsePrefs(JSON.stringify({})).dashboard).toEqual(DEFAULT_PREFS.dashboard);
    expect(parsePrefs(JSON.stringify({ dashboard: "x" })).dashboard).toEqual(DEFAULT_PREFS.dashboard);
    expect(parsePrefs(JSON.stringify({ dashboard: { order: "today", hidden: "due" } })).dashboard).toEqual(
      DEFAULT_PREFS.dashboard,
    );
  });
});

describe("prefsToDataAttributes", () => {
  it("maps the display preferences onto html data attributes", () => {
    expect(prefsToDataAttributes(DEFAULT_PREFS)).toEqual({
      "data-accent": "pine",
      "data-density": "comfortable",
      "data-text": "normal",
      "data-motion": "auto",
    });
    expect(
      prefsToDataAttributes(make({ accent: "rose", density: "compact", text: "small", reduceMotion: true })),
    ).toEqual({
      "data-accent": "rose",
      "data-density": "compact",
      "data-text": "small",
      "data-motion": "reduce",
    });
  });
});

describe("prefsBootScript", () => {
  /** Runs the inline script against a stand-in document and returns the attributes it set. */
  function boot(cookie: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const document = {
      cookie,
      documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
    };
    new Function("document", prefsBootScript)(document);
    return attrs;
  }

  it("applies the saved display preferences from the cookie as the browser writes it", () => {
    const value = encodeURIComponent(
      serializePrefs(make({ accent: "plum", density: "compact", text: "large", reduceMotion: true })),
    );
    expect(boot(`a=1; usp-prefs=${value}; b=2`)).toEqual({
      "data-accent": "plum",
      "data-density": "compact",
      "data-text": "large",
      "data-motion": "reduce",
    });
  });

  it("leaves the server's defaults alone with no cookie, a bad cookie or unknown values", () => {
    expect(boot("")).toEqual({});
    expect(boot("usp-prefs=%7Bnot json")).toEqual({});
    expect(boot(`usp-prefs=${encodeURIComponent(JSON.stringify({ accent: "neon", text: "huge" }))}`)).toEqual({});
    expect(boot(`xusp-prefs=${encodeURIComponent(JSON.stringify({ accent: "plum" }))}`)).toEqual({});
  });
});

describe("onboarding tour state", () => {
  it("reads an old cookie without the field as a new student", () => {
    expect(parsePrefs(JSON.stringify({ v: 1, accent: "plum", hiddenCourses: [104] })).onboarding).toEqual({
      tour: "new",
    });
    expect(DEFAULT_PREFS.onboarding).toEqual({ tour: "new" });
  });

  it("reads a cookie from the old checklist guide as new, dropping its fields", () => {
    const old = { onboarding: { dismissed: true, done: ["install", "settings", "cgpa"] } };
    expect(parsePrefs(JSON.stringify(old)).onboarding).toEqual({ tour: "new" });
  });

  it("round-trips every tour status", () => {
    for (const tour of TOUR_STATUSES) {
      const prefs = make({ onboarding: { tour } });
      expect(parsePrefs(serializePrefs(prefs))).toEqual(prefs);
      expect(parsePrefs(encodeURIComponent(serializePrefs(prefs)))).toEqual(prefs);
    }
  });

  it("falls back to new for an unknown status without touching other fields", () => {
    for (const onboarding of ["x", 42, null, [], ["done"], { tour: "DONE" }, { tour: 1 }, { tour: null }]) {
      const p = parsePrefs(JSON.stringify({ accent: "rose", onboarding }));
      expect(p.onboarding).toEqual({ tour: "new" });
      expect(p.accent).toBe("rose");
    }
  });

  it("cleanOnboarding is safe on any input", () => {
    expect(cleanOnboarding(undefined)).toEqual({ tour: "new" });
    expect(cleanOnboarding({ tour: "skipped", dismissed: true })).toEqual({ tour: "skipped" });
    expect(cleanOnboarding({ tour: "done" })).toEqual({ tour: "done" });
  });
});
