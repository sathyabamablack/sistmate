/**
 * Install guides: scripted, animated walkthroughs of adding the portal to a
 * phone's home screen, drawn as mock device screens (components/guides/**).
 *
 * The browser's own install menus and the ERP's captcha cannot be screen
 * recorded by automation, so every guide is a script of scenes. A scene is one
 * step ("Tap Install app"); inside it, beats change what the mock device shows
 * at given times, and a beat with `tap` sends the finger (or cursor) to an
 * element marked `data-target="<id>"` in the screen just before it changes.
 *
 * Pure data and pure helpers: safe on the server, in tests and in the player.
 */

export const PORTAL_HOST = "sistmate.vercel.app";

export type GuideId = "android" | "iphone";
/** Which device shell the player draws around the mock screen. */
export type GuideDevice = "phone" | "laptop";

/** Which mock screen the device shows. */
export type ScreenId =
  | "android-browser"
  | "ios-browser"
  | "android-home"
  | "ios-home"
  | "phone-app"
  | "desktop-browser"
  | "desktop-app"
  | "desktop-files";

/** The page drawn inside a browser or app window. */
export type PageId =
  | "new-tab"
  | "portal-welcome"
  | "portal-connect"
  | "portal-install"
  | "portal-dashboard"
  | "erp-login"
  | "extensions";

/** Menus, sheets and dialogs drawn on top of the screen. */
export type OverlayId =
  | "chrome-menu"
  | "chrome-install"
  | "bookmark-saved"
  | "bookmark-edit"
  | "address-suggest"
  | "safari-more"
  | "safari-share"
  | "safari-add"
  | "desktop-install"
  | "download-bubble"
  | "folder-picker";

/** Small state switches the mock screens read. */
export type Flag =
  | "typing"
  | "copied"
  | "new-icon"
  | "name-typed"
  | "url-pasted"
  | "typing-bookmark"
  | "connect-banner"
  | "filled"
  | "captcha"
  | "connected"
  | "downloaded"
  | "extracted"
  | "dev-mode"
  | "folder-picked"
  | "loaded";

export interface View {
  screen: ScreenId;
  /** Text in the address bar. */
  url: string;
  page: PageId;
  overlay: OverlayId | null;
  flags: readonly Flag[];
  /** Camera zoom toward `focus` (a data-target id). 1 = whole device. */
  zoom: number;
  focus: string | null;
}

/** A change to the view. Unset fields carry over from the view before it. */
export type ViewPatch = Partial<View>;

export interface Beat {
  /** Milliseconds from the start of the scene. */
  at: number;
  /** The finger taps this target (found in the view before this beat), then the view changes. */
  tap?: string;
  view?: ViewPatch;
}

export interface Scene {
  id: string;
  /** Short step title: "Tap Install app". */
  title: string;
  /** One or two sentences under the frame and in the transcript. */
  caption: string;
  /** Milliseconds. */
  duration: number;
  beats: readonly Beat[];
  /** The still picture when motion is off: by default the moment before the last tap; "end" shows the final view. */
  still?: "end";
}

export interface Guide {
  id: GuideId;
  device: GuideDevice;
  /** "Install on Android". */
  title: string;
  /** Short label for switchers: "Android". */
  label: string;
  /** Browser it shows: "Chrome on Android". */
  browser: string;
  summary: string;
  /** Shown under the player. */
  note?: string;
  /** The first beat of the first scene must set every View field. */
  scenes: readonly Scene[];
}

/** How long the finger takes to reach a target, and how long the press lasts before the view changes. */
export const POINTER_LEAD_MS = 900;
export const POINTER_PRESS_MS = 260;

const START: View = {
  screen: "android-browser",
  url: "",
  page: "new-tab",
  overlay: null,
  flags: [],
  zoom: 1,
  focus: null,
};

const portal = (path = "") => `${PORTAL_HOST}${path}`;

export const GUIDES: readonly Guide[] = [
  {
    id: "android",
    device: "phone",
    title: "Install on Android",
    label: "Android",
    browser: "Chrome on Android",
    summary: "Add the portal to your home screen from Chrome. It then opens full screen, like any app.",
    scenes: [
      {
        id: "open",
        title: "Open the portal in Chrome",
        caption: `Open Chrome and go to ${PORTAL_HOST}.`,
        duration: 5200,
        still: "end",
        beats: [
          { at: 0, view: { ...START, screen: "android-browser" } },
          { at: 1100, tap: "address", view: { url: portal(), flags: ["typing"] } },
          { at: 3300, view: { page: "portal-welcome", flags: [] } },
        ],
      },
      {
        id: "menu",
        title: "Tap the ⋮ menu",
        caption: "Tap the three-dot menu ⋮ at the top right of Chrome.",
        duration: 4200,
        beats: [{ at: 1500, tap: "menu", view: { overlay: "chrome-menu" } }],
      },
      {
        id: "install",
        title: "Tap Install app",
        caption: "Choose Install app. On some phones it is called Add to Home screen.",
        duration: 4600,
        beats: [{ at: 1700, tap: "install-app", view: { overlay: "chrome-install" } }],
      },
      {
        id: "confirm",
        title: "Tap Install to confirm",
        caption: "Chrome asks once. Tap Install and the Portal icon lands on your home screen.",
        duration: 5000,
        beats: [
          {
            at: 1700,
            tap: "install-confirm",
            view: { screen: "android-home", overlay: null, flags: ["new-icon"] },
          },
        ],
      },
      {
        id: "open-app",
        title: "Open it from your home screen",
        caption: "Tap the Portal icon. It opens full screen, without the browser bars.",
        duration: 5000,
        beats: [{ at: 1600, tap: "app-icon", view: { screen: "phone-app", flags: [] } }],
      },
    ],
  },
  {
    id: "iphone",
    device: "phone",
    title: "Install on iPhone",
    label: "iPhone",
    browser: "Safari on iPhone",
    summary: "Add the portal to your home screen from Safari. Only Safari offers Add to Home Screen.",
    scenes: [
      {
        id: "open",
        title: "Open the portal in Safari",
        caption: `Open Safari and go to ${PORTAL_HOST}.`,
        duration: 5200,
        still: "end",
        beats: [
          { at: 0, view: { ...START, screen: "ios-browser" } },
          { at: 1100, tap: "address", view: { url: portal(), flags: ["typing"] } },
          { at: 3300, view: { page: "portal-welcome", flags: [] } },
        ],
      },
      {
        id: "share",
        title: "Tap Share",
        caption: "Tap ⋯ next to the address, then Share. On older iPhones, Share is the square with an arrow.",
        duration: 5600,
        beats: [
          { at: 1400, tap: "more", view: { overlay: "safari-more" } },
          { at: 3400, tap: "share", view: { overlay: "safari-share" } },
        ],
      },
      {
        id: "add-home",
        title: "Tap Add to Home Screen",
        caption: "Find Add to Home Screen in the list (scroll down if you need to) and tap it.",
        duration: 4600,
        beats: [{ at: 1700, tap: "add-home", view: { overlay: "safari-add" } }],
      },
      {
        id: "add",
        title: "Tap Add",
        caption: "Leave Open as Web App on, then tap Add at the top right.",
        duration: 4800,
        beats: [
          {
            at: 1800,
            tap: "add-confirm",
            view: { screen: "ios-home", overlay: null, flags: ["new-icon"] },
          },
        ],
      },
      {
        id: "open-app",
        title: "Open it from your home screen",
        caption: "Tap the Portal icon. It opens full screen, without Safari's bars.",
        duration: 5000,
        beats: [{ at: 1600, tap: "app-icon", view: { screen: "phone-app", flags: [] } }],
      },
    ],
  },
];

export const GUIDE_IDS: readonly GuideId[] = GUIDES.map((g) => g.id);

export function isGuideId(value: unknown): value is GuideId {
  return typeof value === "string" && (GUIDE_IDS as readonly string[]).includes(value);
}

export function getGuide(id: GuideId): Guide {
  const guide = GUIDES.find((g) => g.id === id);
  if (!guide) throw new Error(`Unknown guide: ${id}`);
  return guide;
}

/** Public paths of the recorded video files for a guide (made by scripts/record-guides.mjs). */
export function guideVideoPaths(id: GuideId) {
  return {
    mp4: `/guides/${id}.mp4`,
    webm: `/guides/${id}.webm`,
    poster: `/guides/${id}.png`,
  } as const;
}

/** "Step 2 of 5". */
export function stepLabel(index: number, count: number): string {
  return `Step ${index + 1} of ${count}`;
}

/** 24_300 -> "0:24". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export interface ResolvedBeat {
  at: number;
  tap: string | null;
  view: View;
}

export interface ResolvedScene extends Omit<Scene, "beats"> {
  /** Milliseconds from the start of the guide. */
  start: number;
  /** Always starts with a beat at 0 (the view carried over from the scene before). */
  beats: ResolvedBeat[];
}

export interface ResolvedGuide extends Omit<Guide, "scenes"> {
  scenes: ResolvedScene[];
  duration: number;
}

function applyPatch(view: View, patch: ViewPatch | undefined): View {
  return patch ? { ...view, ...patch } : view;
}

/**
 * Fills in every beat's full view and each scene's start time. Throws on a
 * script mistake (beats out of order or outside the scene, a tap without time
 * for the finger to travel, an incomplete first view), so tests catch it.
 */
export function resolveGuide(guide: Guide): ResolvedGuide {
  let view: View | null = null;
  let start = 0;
  const scenes: ResolvedScene[] = guide.scenes.map((scene) => {
    const beats: ResolvedBeat[] = [];
    const sorted = [...scene.beats];
    sorted.forEach((beat, i) => {
      if (beat.at < 0 || beat.at >= scene.duration) {
        throw new Error(`${guide.id}/${scene.id}: beat at ${beat.at}ms is outside the scene`);
      }
      if (i > 0 && beat.at <= sorted[i - 1]!.at) {
        throw new Error(`${guide.id}/${scene.id}: beats must be in time order`);
      }
    });
    if (!view) {
      const first = sorted[0];
      if (!first || first.at !== 0 || !first.view || !isCompleteView(first.view)) {
        throw new Error(`${guide.id}: the first beat must be at 0 and set the whole view`);
      }
    }
    if (view && (sorted[0]?.at ?? 1) !== 0) beats.push({ at: 0, tap: null, view });
    for (const beat of sorted) {
      if (beat.tap) {
        const prev = beats.length ? beats[beats.length - 1]!.at : 0;
        if (beat.at - prev < POINTER_LEAD_MS) {
          throw new Error(`${guide.id}/${scene.id}: tap at ${beat.at}ms leaves the finger no time to travel`);
        }
      }
      view = applyPatch(view ?? (beat.view as View), beat.view);
      beats.push({ at: beat.at, tap: beat.tap ?? null, view });
    }
    const resolved: ResolvedScene = { ...scene, start, beats };
    start += scene.duration;
    return resolved;
  });
  return { ...guide, scenes, duration: start };
}

function isCompleteView(patch: ViewPatch): patch is View {
  return (
    patch.screen !== undefined &&
    patch.url !== undefined &&
    patch.page !== undefined &&
    patch.overlay !== undefined &&
    patch.flags !== undefined &&
    patch.zoom !== undefined &&
    patch.focus !== undefined
  );
}

export interface PointerState {
  /** The data-target the finger is heading to (it is in the current view). */
  target: string;
  /** 0 when it sets off, 1 when it arrives. */
  progress: number;
  /** True for the short press just before the view changes. */
  pressing: boolean;
}

export interface Frame {
  scene: number;
  beat: number;
  /** Milliseconds into the current scene. */
  sceneMs: number;
  /** Null while the finger rests. */
  pointer: PointerState | null;
  ended: boolean;
}

/** What to draw at `ms` milliseconds into the guide. */
export function frameAt(guide: ResolvedGuide, ms: number): Frame {
  const t = Math.min(Math.max(ms, 0), guide.duration);
  let sceneIndex = guide.scenes.length - 1;
  for (let i = 0; i < guide.scenes.length; i++) {
    const s = guide.scenes[i]!;
    if (t < s.start + s.duration) {
      sceneIndex = i;
      break;
    }
  }
  const scene = guide.scenes[sceneIndex]!;
  const sceneMs = t - scene.start;
  let beatIndex = 0;
  for (let i = 0; i < scene.beats.length; i++) {
    if (scene.beats[i]!.at <= sceneMs) beatIndex = i;
  }
  let pointer: PointerState | null = null;
  const next = scene.beats[beatIndex + 1];
  if (next?.tap) {
    const leave = next.at - POINTER_LEAD_MS;
    const arrive = next.at - POINTER_PRESS_MS;
    if (sceneMs >= leave) {
      pointer = {
        target: next.tap,
        progress: Math.min(1, (sceneMs - leave) / (arrive - leave)),
        pressing: sceneMs >= arrive,
      };
    }
  }
  return { scene: sceneIndex, beat: beatIndex, sceneMs, pointer, ended: t >= guide.duration };
}

/**
 * The still picture for a step when motion is off: the moment just before its
 * last tap, with that target marked; or its final view when it has no tap.
 */
export function stillOf(scene: ResolvedScene): { beat: number; target: string | null } {
  if (scene.still === "end") return { beat: scene.beats.length - 1, target: null };
  for (let i = scene.beats.length - 1; i > 0; i--) {
    const tap = scene.beats[i]!.tap;
    if (tap) return { beat: i - 1, target: tap };
  }
  return { beat: scene.beats.length - 1, target: null };
}
