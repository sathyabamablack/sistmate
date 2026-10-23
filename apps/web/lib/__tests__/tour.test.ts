import { describe, expect, it } from "vitest";
import {
  LAST_STEP,
  TOUR_STEPS,
  afterMissing,
  backIndex,
  dockSide,
  holeFor,
  nextIndex,
  overlayPath,
  parseProgress,
  placePopover,
  routeLabel,
  serializeProgress,
  shouldAutoStart,
  stepCounter,
  tourCopy,
  tourIndex,
  tourStep,
  type CopyContext,
} from "../tour";

const phone: CopyContext = { device: "phone", name: "Asha", threshold: 75, shortcut: "Ctrl K" };
const desktop: CopyContext = { ...phone, device: "desktop" };

describe("the step list", () => {
  it("starts with the welcome, ends with the finish, and has unique ids", () => {
    expect(TOUR_STEPS[0].id).toBe("welcome");
    expect(TOUR_STEPS[LAST_STEP]!.id).toBe("finish");
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
  });

  it("follows the walkthrough order", () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual([
      "welcome",
      "next-class",
      "attendance-overall",
      "open-attendance",
      "todays-attendance",
      "plan-skip",
      "plan-result",
      "open-courses",
      "choose-courses",
      "this-semester",
      "save-courses",
      "settings",
      "finish",
    ]);
  });

  it("gives every click and wait-for step a target, and every dialog wait a dialog", () => {
    for (const step of TOUR_STEPS) {
      if (step.kind !== "info") expect(step.target).toBeTruthy();
      if (step.kind === "wait-for" && step.until !== "pressed") expect(step.dialog).toBeTruthy();
    }
  });

  it("opens Attendance and Courses with a click on the nav", () => {
    expect(tourStep(tourIndex("open-attendance"))).toMatchObject({ kind: "click", target: "nav-attendance" });
    expect(tourStep(tourIndex("open-courses"))).toMatchObject({ kind: "click", target: "nav-courses" });
    // The step after each one lives on the page the click opens.
    expect(tourStep(tourIndex("todays-attendance"))?.route).toBe("/attendance");
    expect(tourStep(tourIndex("choose-courses"))?.route).toBe("/courses");
  });

  it("never mentions Moodle and avoids exclamation marks", () => {
    for (const step of TOUR_STEPS) {
      for (const device of ["phone", "desktop"] as const) {
        const text = tourCopy(step.title, { ...phone, device }) + tourCopy(step.body, { ...phone, device });
        expect(text).not.toMatch(/moodle/i);
        expect(text).not.toContain("!");
      }
    }
  });

  it("knows unknown ids", () => {
    expect(tourIndex("nope")).toBe(-1);
    expect(tourStep(99)).toBeUndefined();
  });
});

describe("stepCounter", () => {
  it("counts every step after the welcome", () => {
    expect(stepCounter(0)).toBeNull();
    expect(stepCounter(1)).toBe(`1 of ${LAST_STEP}`);
    expect(stepCounter(3)).toBe(`3 of ${LAST_STEP}`);
    expect(stepCounter(LAST_STEP)).toBe(`${LAST_STEP} of ${LAST_STEP}`);
    expect(stepCounter(LAST_STEP + 1)).toBeNull();
  });
});

describe("nextIndex", () => {
  it("moves one step on, and past the end means done", () => {
    expect(nextIndex(0)).toBe(1);
    expect(nextIndex(LAST_STEP)).toBe(TOUR_STEPS.length);
  });

  it("skips the rest of a group when asked", () => {
    const planSkip = tourIndex("plan-skip");
    expect(nextIndex(planSkip)).toBe(tourIndex("plan-result"));
    expect(nextIndex(planSkip, true)).toBe(tourIndex("open-courses"));
    expect(nextIndex(tourIndex("choose-courses"), true)).toBe(tourIndex("settings"));
    expect(nextIndex(tourIndex("this-semester"), true)).toBe(tourIndex("settings"));
    // A step outside any group just moves on.
    expect(nextIndex(tourIndex("next-class"), true)).toBe(tourIndex("attendance-overall"));
  });
});

describe("afterMissing", () => {
  it("drops the whole group when its first step has nothing to point at", () => {
    expect(afterMissing(tourIndex("plan-skip"))).toBe(tourIndex("open-courses"));
    expect(afterMissing(tourIndex("choose-courses"))).toBe(tourIndex("settings"));
  });

  it("skips only itself further into a group, or outside one", () => {
    expect(afterMissing(tourIndex("this-semester"))).toBe(tourIndex("save-courses"));
    expect(afterMissing(tourIndex("plan-result"))).toBe(tourIndex("open-courses"));
    expect(afterMissing(tourIndex("next-class"))).toBe(tourIndex("attendance-overall"));
  });
});

describe("backIndex", () => {
  const none = new Set<number>();

  it("goes back to an info step on the same page", () => {
    expect(backIndex(tourIndex("attendance-overall"), none, "/")).toBe(tourIndex("next-class"));
    expect(backIndex(tourIndex("next-class"), none, "/")).toBe(0);
  });

  it("never goes back to a click step or another page", () => {
    expect(backIndex(tourIndex("todays-attendance"), none, "/attendance")).toBeNull();
    expect(backIndex(tourIndex("plan-result"), none, "/attendance")).toBeNull();
    expect(backIndex(tourIndex("settings"), none, "/courses")).toBeNull();
    expect(backIndex(0, none, "/")).toBeNull();
    // The welcome lives on the dashboard.
    expect(backIndex(tourIndex("next-class"), none, "/attendance")).toBeNull();
  });

  it("passes over skipped steps", () => {
    const skipped = new Set([tourIndex("next-class")]);
    expect(backIndex(tourIndex("attendance-overall"), skipped, "/")).toBe(0);
  });

  it("goes from the finish back to the settings step anywhere", () => {
    expect(backIndex(LAST_STEP, none, "/courses")).toBe(tourIndex("settings"));
  });
});

describe("tourCopy", () => {
  it("says tap on phones and click on desktops", () => {
    const plan = tourStep(tourIndex("plan-skip"))!;
    expect(tourCopy(plan.body, phone)).toBe("Tap a class to see what skipping it does.");
    expect(tourCopy(plan.body, desktop)).toBe("Click a class to see what skipping it does.");
    const nav = tourStep(tourIndex("open-attendance"))!;
    expect(tourCopy(nav.body, phone)).toMatch(/^Tap Attendance in the bar at the bottom/);
    expect(tourCopy(nav.body, desktop)).toMatch(/^Click Attendance in the menu on the left/);
  });

  it("greets by first name, and reads well without one", () => {
    const welcome = tourStep(0)!;
    expect(tourCopy(welcome.title, phone)).toBe("Welcome to your portal, Asha");
    expect(tourCopy(welcome.title, { ...phone, name: "" })).toBe("Welcome to your portal");
  });

  it("uses the student's attendance rule and shortcut", () => {
    const ring = tourStep(tourIndex("attendance-overall"))!;
    expect(tourCopy(ring.body, { ...desktop, threshold: 80 })).toBe(
      "Overall attendance against the 80% line. The tick on each bar marks 80%.",
    );
    const finish = tourStep(LAST_STEP)!;
    expect(tourCopy(finish.body, { ...desktop, shortcut: "⌘K" })).toContain("(⌘K)");
    // Phones have no keyboard shortcut to mention.
    expect(tourCopy(finish.body, phone)).toBe("You can replay this tour any time from Settings or the search.");
  });

  it("leaves no placeholder behind", () => {
    for (const step of TOUR_STEPS) {
      for (const ctx of [phone, desktop]) {
        expect(tourCopy(step.title, ctx) + tourCopy(step.body, ctx)).not.toMatch(/[{}]/);
      }
    }
  });
});

describe("routeLabel", () => {
  it("names the page", () => {
    expect(routeLabel("/")).toBe("Home");
    expect(routeLabel("/attendance")).toBe("Attendance");
    expect(routeLabel("/courses")).toBe("Courses");
  });
});

describe("progress", () => {
  it("round-trips", () => {
    const p = { step: "plan-result" as const, skipped: ["next-class" as const] };
    expect(parseProgress(serializeProgress(p))).toEqual(p);
  });

  it("rejects anything unexpected", () => {
    for (const raw of [null, undefined, "", "x", "null", "42", "[]", '{"v":2,"step":"welcome"}', '{"v":1}', '{"v":1,"step":"nope"}']) {
      expect(parseProgress(raw)).toBeNull();
    }
  });

  it("keeps only known skipped steps, once each", () => {
    const raw = JSON.stringify({ v: 1, step: "settings", skipped: ["plan-skip", "bogus", 3, "plan-skip", null] });
    expect(parseProgress(raw)).toEqual({ step: "settings", skipped: ["plan-skip"] });
    expect(parseProgress(JSON.stringify({ v: 1, step: "settings", skipped: "x" }))).toEqual({
      step: "settings",
      skipped: [],
    });
  });
});

describe("shouldAutoStart", () => {
  const base = { status: "new" as const, pathname: "/", autoStartedBefore: false, running: false };

  it("starts for a new student on the dashboard", () => {
    expect(shouldAutoStart(base)).toBe(true);
  });

  it("never starts once done or skipped", () => {
    expect(shouldAutoStart({ ...base, status: "done" })).toBe(false);
    expect(shouldAutoStart({ ...base, status: "skipped" })).toBe(false);
  });

  it("only starts on the dashboard", () => {
    for (const pathname of ["/attendance", "/courses", "/welcome", "/login", "/connect", "/setup"]) {
      expect(shouldAutoStart({ ...base, pathname })).toBe(false);
    }
  });

  it("starts once per browser and never over a running tour", () => {
    expect(shouldAutoStart({ ...base, autoStartedBefore: true })).toBe(false);
    expect(shouldAutoStart({ ...base, running: true })).toBe(false);
  });
});

describe("holeFor", () => {
  const view = { width: 400, height: 800 };

  it("pads the target", () => {
    expect(holeFor({ x: 100, y: 100, width: 50, height: 20 }, view, 6)).toEqual({
      x: 94,
      y: 94,
      width: 62,
      height: 32,
    });
  });

  it("clips to the screen", () => {
    expect(holeFor({ x: -20, y: 700, width: 500, height: 400 }, view, 6)).toEqual({
      x: 0,
      y: 694,
      width: 400,
      height: 106,
    });
  });

  it("is null when the target is off-screen", () => {
    expect(holeFor({ x: 10, y: 900, width: 50, height: 20 }, view, 6)).toBeNull();
    expect(holeFor({ x: 10, y: -100, width: 50, height: 20 }, view, 6)).toBeNull();
  });
});

describe("placePopover", () => {
  const view = { width: 1440, height: 900 };
  const pop = { width: 352, height: 180 };

  it("sits below the target, centred, with the arrow on the target's middle", () => {
    const p = placePopover({ x: 500, y: 100, width: 200, height: 100 }, pop, view);
    expect(p.side).toBe("bottom");
    expect(p.y).toBe(214);
    expect(p.x).toBe(600 - 176);
    expect(p.arrow).toBe(176);
  });

  it("flips above when there is no room below", () => {
    const p = placePopover({ x: 500, y: 650, width: 200, height: 100 }, pop, view);
    expect(p.side).toBe("top");
    expect(p.y).toBe(650 - 14 - 180);
  });

  it("goes beside a tall target, like the rail link next to the screen edge", () => {
    const tall = { x: 10, y: 50, width: 70, height: 820 };
    const p = placePopover(tall, pop, view);
    expect(p.side).toBe("right");
    expect(p.x).toBe(80 + 14);
    expect(p.y).toBeGreaterThanOrEqual(12);
    expect(p.y + pop.height).toBeLessThanOrEqual(900 - 12);
  });

  it("stays on screen next to a target in the corner, and the arrow still points at it", () => {
    const p = placePopover({ x: 1380, y: 10, width: 40, height: 40 }, pop, view);
    expect(p.side).toBe("bottom");
    expect(p.x).toBe(1440 - 352 - 12);
    // The arrow follows the target's centre (x 1400), not the popover's.
    expect(p.arrow).toBe(1400 - p.x);
  });

  it("falls back to the bottom of the screen, without an arrow, when nothing fits", () => {
    const p = placePopover({ x: 0, y: 0, width: 1440, height: 900 }, pop, view);
    expect(p.arrow).toBeNull();
    expect(p.y).toBe(900 - 180 - 12);
  });
});

describe("overlayPath", () => {
  const view = { width: 400, height: 800 };

  it("covers the whole screen when there is no hole", () => {
    expect(overlayPath(view, null)).toBe("M0 0H400V800H0Z");
  });

  it("cuts a rounded hole, with the radius capped by the hole's size", () => {
    const d = overlayPath(view, { x: 10, y: 20, width: 100, height: 40 }, 12);
    expect(d.startsWith("M0 0H400V800H0ZM22 20H98A12 12 0 0 1 110 32")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(overlayPath(view, { x: 0, y: 0, width: 10, height: 8 }, 12)).toContain("A4 4");
  });
});

describe("dockSide", () => {
  const view = { width: 390, height: 844 };

  it("docks away from the target", () => {
    expect(dockSide({ x: 0, y: 790, width: 78, height: 56 }, view)).toBe("top");
    expect(dockSide({ x: 300, y: 4, width: 44, height: 44 }, view)).toBe("bottom");
    expect(dockSide(null, view)).toBe("bottom");
  });
});
