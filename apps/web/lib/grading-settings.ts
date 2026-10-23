import { SATHYABAMA_GRADE_SCALE, type GradeBand } from "@usp/core";

/**
 * How marks become grades and credits, and the student's per-subject credit
 * corrections (the `usp-grading` cookie). Pure data and helpers with no catalog
 * import, so it is safe in client components. The catalog-backed resolver lives
 * in ./grading-presets (server-only).
 */
export interface GradingPreset {
  id: string;
  name: string;
  description: string;
  scale: GradeBand[];
}

export const OFFICIAL_PRESET_ID = "sathyabama";

export const OFFICIAL_PRESET: GradingPreset = {
  id: OFFICIAL_PRESET_ID,
  name: "Sathyabama official (Regulations 2019 and 2023)",
  description:
    "Grades are computed from your marks with the official scale and the official credits for each subject. Credits you edit override them.",
  scale: SATHYABAMA_GRADE_SCALE,
};

/**
 * The official scheme is the only one. Older cookies may still name the retired
 * templates ("standard", "letter", "four-credit"); they read as the official one.
 */
export const GRADING_PRESETS: GradingPreset[] = [OFFICIAL_PRESET];

export const DEFAULT_PRESET_ID = OFFICIAL_PRESET_ID;

export function presetById(id: string | undefined): GradingPreset {
  return GRADING_PRESETS.find((p) => p.id === id) ?? OFFICIAL_PRESET;
}

/** What the student chose: a preset, plus credits they corrected for single subjects. */
export interface GradingSettings {
  preset: string;
  /** Course code -> credits, for subjects whose official or estimated credit is wrong. */
  credits: Record<string, number>;
}

export const GRADING_COOKIE = "usp-grading";

export const DEFAULT_GRADING_SETTINGS: GradingSettings = {
  preset: DEFAULT_PRESET_ID,
  credits: {},
};

/** Parses the cookie value defensively; anything unexpected falls back to the defaults. */
export function parseGradingSettings(raw: string | undefined | null): GradingSettings {
  if (!raw) return DEFAULT_GRADING_SETTINGS;
  try {
    const v = JSON.parse(raw) as unknown;
    if (typeof v !== "object" || v === null) return DEFAULT_GRADING_SETTINGS;
    const o = v as { preset?: unknown; credits?: unknown };
    const credits: Record<string, number> = {};
    if (typeof o.credits === "object" && o.credits !== null) {
      for (const [code, n] of Object.entries(o.credits as Record<string, unknown>)) {
        if (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 12) credits[code] = n;
      }
    }
    return { preset: presetById(typeof o.preset === "string" ? o.preset : undefined).id, credits };
  } catch {
    return DEFAULT_GRADING_SETTINGS;
  }
}

export function serializeGradingSettings(s: GradingSettings): string {
  return JSON.stringify(s);
}
