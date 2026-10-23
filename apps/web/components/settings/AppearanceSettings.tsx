"use client";

import * as React from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme, type ThemePreference } from "@/components/layout/ThemeProvider";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ACCENTS, DENSITIES, TEXT_SIZES, type Accent, type Density, type TextSize } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { usePrefsContext } from "./PrefsProvider";
import { CheckRow, SettingGroup } from "./SettingGroup";
import { RadioCard } from "./RadioCard";

const THEMES: { value: ThemePreference; label: string; hint: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", hint: "The default. Always use the light theme.", icon: Sun },
  { value: "dark", label: "Dark", hint: "Always use the dark theme.", icon: Moon },
  { value: "system", label: "System", hint: "Match your device setting.", icon: Monitor },
];

const ACCENT_INFO: Record<Accent, { label: string; hint: string }> = {
  pine: { label: "Pine", hint: "Deep green. The default." },
  ocean: { label: "Ocean", hint: "Clear blue." },
  plum: { label: "Plum", hint: "Soft violet." },
  amber: { label: "Amber", hint: "Warm gold and brown." },
  rose: { label: "Rose", hint: "Deep crimson." },
  slate: { label: "Slate", hint: "Quiet blue-grey." },
};

const DENSITY_INFO: Record<Density, { label: string; hint: string }> = {
  comfortable: { label: "Comfortable", hint: "More space around rows and sections." },
  compact: { label: "Compact", hint: "Tighter rows so more fits on screen." },
};

const TEXT_INFO: Record<TextSize, { label: string; hint: string; sample: string }> = {
  small: { label: "Small", hint: "About 14 px. Fits more on screen.", sample: "text-small" },
  normal: { label: "Normal", hint: "About 16 px. The default.", sample: "text-body" },
  large: { label: "Large", hint: "About 17 px. Easier to read.", sample: "text-subheading" },
};

/** Two colour dots and a sample, drawn with the preset's own tokens (the element carries data-accent). */
function Swatch({ accent }: { accent: Accent }) {
  return (
    <div data-accent={accent} aria-hidden className="flex items-center gap-2">
      <span
        className="h-7 w-7 shrink-0 rounded-full border border-border"
        style={{ backgroundColor: "hsl(var(--primary))" }}
      />
      <span
        className="grid h-7 flex-1 place-items-center rounded-full text-micro font-semibold"
        style={{ backgroundColor: "hsl(var(--accent))", color: "hsl(var(--accent-foreground))" }}
      >
        Aa
      </span>
    </div>
  );
}

const CAT_DOTS = ["bg-cat-1", "bg-cat-2", "bg-cat-3", "bg-cat-4"] as const;

/** Shows buttons, highlights, chart colors and the threshold tick with the page's live tokens. */
function Preview({ threshold }: { threshold: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-small font-semibold text-foreground">Preview</p>
      <div className="mt-3 flex flex-wrap items-center gap-2" aria-hidden>
        <span className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-small font-medium text-primary-foreground">
          Primary action
        </span>
        <Badge variant="primary">Highlight</Badge>
        <span className="text-small font-medium text-primary">Link text</span>
        {CAT_DOTS.map((dot) => (
          <span key={dot} className={cn("h-3 w-3 rounded-full", dot)} />
        ))}
      </div>
      <div className="mt-4" aria-hidden>
        <ProgressBar value={82} markAt={threshold} />
      </div>
      <p className="mt-2 text-small text-muted-foreground">
        This is how buttons, highlights and charts look with your choices.
      </p>
    </div>
  );
}

/** Theme, accent color, density, text size and motion. Everything applies as you pick it. */
export function AppearanceSettings() {
  const { preference, setPreference } = useTheme();
  const { prefs, update } = usePrefsContext();
  const uid = React.useId();

  return (
    <div className="space-y-8">
      <SettingGroup
        id={`${uid}-theme`}
        title="Theme"
        hint="The sun and moon button in the top bar changes the same setting."
      >
        {(labelId) => (
          <div role="radiogroup" aria-labelledby={labelId} className="grid gap-3 sm:grid-cols-3">
            {THEMES.map(({ value, label, hint, icon: Icon }) => (
              <RadioCard
                key={value}
                name="theme"
                value={value}
                title={label}
                description={hint}
                checked={preference === value}
                onChange={(v) => setPreference(v as ThemePreference)}
              >
                <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
              </RadioCard>
            ))}
          </div>
        )}
      </SettingGroup>

      <SettingGroup
        id={`${uid}-accent`}
        title="Accent color"
        hint="Sets buttons, highlights, charts and the timetable colors. Works in light and dark."
      >
        {(labelId) => (
          <div className="space-y-4">
            <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ACCENTS.map((value) => (
                <RadioCard
                  key={value}
                  name="accent"
                  value={value}
                  title={ACCENT_INFO[value].label}
                  description={ACCENT_INFO[value].hint}
                  checked={prefs.accent === value}
                  onChange={(v) => update({ accent: v as Accent })}
                >
                  <Swatch accent={value} />
                </RadioCard>
              ))}
            </div>
            <Preview threshold={prefs.attendanceThreshold} />
          </div>
        )}
      </SettingGroup>

      <SettingGroup
        id={`${uid}-density`}
        title="Density"
        hint="Compact tightens lists, section gaps and headings. Buttons stay easy to tap on a phone."
      >
        {(labelId) => (
          <div role="radiogroup" aria-labelledby={labelId} className="grid gap-3 sm:grid-cols-2">
            {DENSITIES.map((value) => (
              <RadioCard
                key={value}
                name="density"
                value={value}
                title={DENSITY_INFO[value].label}
                description={DENSITY_INFO[value].hint}
                checked={prefs.density === value}
                onChange={(v) => update({ density: v as Density })}
              />
            ))}
          </div>
        )}
      </SettingGroup>

      <SettingGroup
        id={`${uid}-text`}
        title="Text size"
        hint="Scales all text and spacing. It stacks with your browser's own text size."
      >
        {(labelId) => (
          <div role="radiogroup" aria-labelledby={labelId} className="grid gap-3 sm:grid-cols-3">
            {TEXT_SIZES.map((value) => (
              <RadioCard
                key={value}
                name="text-size"
                value={value}
                title={TEXT_INFO[value].label}
                description={TEXT_INFO[value].hint}
                checked={prefs.text === value}
                onChange={(v) => update({ text: v as TextSize })}
              >
                <p aria-hidden className={cn("font-display font-semibold text-foreground", TEXT_INFO[value].sample)}>
                  Aa
                </p>
              </RadioCard>
            ))}
          </div>
        )}
      </SettingGroup>

      <SettingGroup id={`${uid}-motion`} title="Motion">
        {() => (
          <CheckRow
            id={`${uid}-reduce-motion`}
            label="Reduce motion"
            hint="Turns off entrance animations and smooth scrolling, even if your device allows them."
            checked={prefs.reduceMotion}
            onChange={(reduceMotion) => update({ reduceMotion })}
          />
        )}
      </SettingGroup>
    </div>
  );
}
