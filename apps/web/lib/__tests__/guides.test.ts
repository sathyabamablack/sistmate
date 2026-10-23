import { describe, expect, it } from "vitest";
import {
  formatClock,
  frameAt,
  getGuide,
  GUIDE_IDS,
  GUIDES,
  guideVideoPaths,
  isGuideId,
  POINTER_LEAD_MS,
  POINTER_PRESS_MS,
  resolveGuide,
  stepLabel,
  stillOf,
  type Guide,
} from "../guides";
import { detectPhoneOs, installTargetFromHash } from "../device";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const IPAD_DESKTOP_MODE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

describe("guide scripts", () => {
  it("has the two home-screen guides, each 4 to 6 steps and 20 to 36 seconds long", () => {
    expect(GUIDE_IDS).toEqual(["android", "iphone"]);
    for (const guide of GUIDES) {
      const resolved = resolveGuide(guide);
      expect(resolved.scenes.length, guide.id).toBeGreaterThanOrEqual(4);
      expect(resolved.scenes.length, guide.id).toBeLessThanOrEqual(6);
      expect(resolved.duration, guide.id).toBeGreaterThanOrEqual(20_000);
      expect(resolved.duration, guide.id).toBeLessThanOrEqual(36_000);
    }
  });

  it("uses LMS wording and never the old product name", () => {
    expect(JSON.stringify(GUIDES).toLowerCase()).not.toContain("moodle");
  });

  it("gives every scene a title and caption, with unique ids", () => {
    for (const guide of GUIDES) {
      const ids = guide.scenes.map((s) => s.id);
      expect(new Set(ids).size, guide.id).toBe(ids.length);
      for (const s of guide.scenes) {
        expect(s.title.length, `${guide.id}/${s.id}`).toBeGreaterThan(3);
        expect(s.caption.length, `${guide.id}/${s.id}`).toBeGreaterThan(10);
      }
    }
  });

  it("matches ids to guides", () => {
    expect(getGuide("iphone").title).toBe("Install on iPhone");
    expect(isGuideId("android")).toBe(true);
    expect(isGuideId("laptop")).toBe(false);
    expect(isGuideId("windows")).toBe(false);
    expect(isGuideId(undefined)).toBe(false);
    expect(guideVideoPaths("android")).toEqual({
      mp4: "/guides/android.mp4",
      webm: "/guides/android.webm",
      poster: "/guides/android.png",
    });
  });
});

describe("resolveGuide", () => {
  it("carries the view across beats and scenes and starts each scene at 0", () => {
    const g = resolveGuide(getGuide("android"));
    expect(g.scenes.map((s) => s.start)).toEqual([0, 5200, 9400, 14000, 19000]);
    for (const s of g.scenes) expect(s.beats[0]!.at).toBe(0);
    // Scene 2 opens the menu over the page loaded in scene 1.
    const menu = g.scenes[1]!;
    expect(menu.beats[0]!.view.page).toBe("portal-welcome");
    expect(menu.beats[1]!.view.overlay).toBe("chrome-menu");
    expect(menu.beats[1]!.tap).toBe("menu");
  });

  it("rejects script mistakes", () => {
    const base = getGuide("android");
    const broken = (scenes: Guide["scenes"]): Guide => ({ ...base, scenes });
    expect(() => resolveGuide(broken([{ ...base.scenes[0]!, beats: [{ at: 0, view: { screen: "ios-home" } }] }]))).toThrow(
      /whole view/,
    );
    expect(() =>
      resolveGuide(broken([base.scenes[0]!, { ...base.scenes[1]!, beats: [{ at: 300, tap: "menu" }] }])),
    ).toThrow(/no time to travel/);
    expect(() =>
      resolveGuide(broken([base.scenes[0]!, { ...base.scenes[1]!, beats: [{ at: 99_000, tap: "menu" }] }])),
    ).toThrow(/outside the scene/);
    expect(() =>
      resolveGuide(
        broken([
          base.scenes[0]!,
          {
            ...base.scenes[1]!,
            beats: [
              { at: 2000, tap: "menu" },
              { at: 1000, tap: "menu" },
            ],
          },
        ]),
      ),
    ).toThrow(/time order/);
  });
});

describe("frameAt", () => {
  const g = resolveGuide(getGuide("android"));
  const menuStart = g.scenes[1]!.start;
  const tapAt = menuStart + 1500;

  it("finds the scene and beat, and clamps outside the guide", () => {
    expect(frameAt(g, -50)).toMatchObject({ scene: 0, beat: 0, sceneMs: 0, ended: false });
    expect(frameAt(g, menuStart + 10)).toMatchObject({ scene: 1, beat: 0 });
    expect(frameAt(g, tapAt)).toMatchObject({ scene: 1, beat: 1 });
    const end = frameAt(g, g.duration + 5000);
    expect(end.scene).toBe(g.scenes.length - 1);
    expect(end.ended).toBe(true);
  });

  it("moves the finger to the next tap, presses, then lets go", () => {
    expect(frameAt(g, tapAt - POINTER_LEAD_MS - 1).pointer).toBeNull();
    const leaving = frameAt(g, tapAt - POINTER_LEAD_MS);
    expect(leaving.pointer).toEqual({ target: "menu", progress: 0, pressing: false });
    const halfway = frameAt(g, tapAt - POINTER_LEAD_MS + (POINTER_LEAD_MS - POINTER_PRESS_MS) / 2);
    expect(halfway.pointer?.progress).toBeCloseTo(0.5, 5);
    expect(frameAt(g, tapAt - POINTER_PRESS_MS).pointer).toEqual({ target: "menu", progress: 1, pressing: true });
    // After the tap the menu is open and nothing is pending until the next scene.
    expect(frameAt(g, tapAt + 100).pointer).toBeNull();
  });
});

describe("stillOf", () => {
  it("shows the moment before the last tap, with its target", () => {
    const g = resolveGuide(getGuide("iphone"));
    // "Tap Share" taps ⋯ then Share: the still has the ⋯ menu open and Share marked.
    const share = g.scenes[1]!;
    const still = stillOf(share);
    expect(still.target).toBe("share");
    expect(share.beats[still.beat]!.view.overlay).toBe("safari-more");
  });

  it("can show the end of a step instead", () => {
    const g = resolveGuide(getGuide("android"));
    const open = g.scenes[0]!;
    expect(stillOf(open)).toEqual({ beat: open.beats.length - 1, target: null });
    expect(open.beats[open.beats.length - 1]!.view.page).toBe("portal-welcome");
  });
});

describe("labels", () => {
  it("formats steps and times", () => {
    expect(stepLabel(1, 5)).toBe("Step 2 of 5");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(24_900)).toBe("0:24");
    expect(formatClock(65_000)).toBe("1:05");
    expect(formatClock(-10)).toBe("0:00");
  });
});

describe("device detection", () => {
  it("picks Safari steps for iPhone and iPad, Chrome steps otherwise", () => {
    expect(detectPhoneOs(IPHONE)).toBe("iphone");
    expect(detectPhoneOs(IPAD_DESKTOP_MODE, 5)).toBe("iphone");
    expect(detectPhoneOs(ANDROID)).toBe("android");
    expect(detectPhoneOs(WINDOWS)).toBe("android");
  });

  it("reads /install deep links", () => {
    expect(installTargetFromHash("#iphone")).toEqual({ os: "iphone" });
    expect(installTargetFromHash("#android")).toEqual({ os: "android" });
    expect(installTargetFromHash("android")).toEqual({ os: "android" });
    expect(installTargetFromHash("")).toBeNull();
    expect(installTargetFromHash("#laptop")).toBeNull();
    expect(installTargetFromHash("#nope")).toBeNull();
  });
});
