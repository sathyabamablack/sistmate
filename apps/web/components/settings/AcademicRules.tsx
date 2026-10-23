"use client";

import * as React from "react";
import { TIME_FORMATS, type TimeFormat } from "@/lib/prefs";
import { formatTime } from "@/lib/utils";
import { Input } from "@/components/ui/Input";
import { usePrefsContext } from "./PrefsProvider";
import { RadioCard } from "./RadioCard";
import { SettingGroup } from "./SettingGroup";

const TIME_INFO: Record<TimeFormat, { label: string; example: string }> = {
  "12h": { label: "12-hour", example: formatTime("14:30", "12h") },
  "24h": { label: "24-hour", example: formatTime("14:30", "24h") },
};

/**
 * A whole-number field that commits as soon as the typed value is in range, so typing
 * "80" never passes through a clamped "8". Out-of-range text is corrected on blur.
 */
function NumberField({
  id,
  label,
  value,
  min,
  max,
  onCommit,
  describedBy,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
  describedBy?: string;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);

  function change(text: string) {
    setDraft(text);
    const n = Number(text);
    if (text.trim() !== "" && Number.isInteger(n) && n >= min && n <= max) onCommit(n);
  }

  function blur() {
    if (draft === null) return;
    const n = Math.round(Number(draft));
    if (draft.trim() !== "" && Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)));
    setDraft(null);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-small font-semibold text-foreground">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={draft ?? String(value)}
        onChange={(e) => change(e.target.value)}
        onBlur={blur}
        aria-describedby={describedBy}
        className="w-28 tabular-nums"
      />
    </div>
  );
}

/** Attendance requirement, the (fixed) pass rule and the clock style. The grading scheme sits just below. */
export function AcademicRules() {
  const { prefs, update } = usePrefsContext();
  const uid = React.useId();
  const t = prefs.attendanceThreshold;

  return (
    <div className="space-y-8">
      <SettingGroup
        id={`${uid}-attendance`}
        title="Attendance requirement"
        hint="The minimum your college asks for."
      >
        {() => (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
              <NumberField
                id={`${uid}-threshold`}
                label="Attendance requirement (%)"
                value={t}
                min={60}
                max={90}
                onCommit={(attendanceThreshold) => update({ attendanceThreshold })}
                describedBy={`${uid}-threshold-note`}
              />
              <div className="min-w-48 flex-1">
                <input
                  type="range"
                  min={60}
                  max={90}
                  step={1}
                  value={t}
                  onChange={(e) => update({ attendanceThreshold: Number(e.target.value) })}
                  aria-label="Slide to set the requirement"
                  aria-valuetext={`${t} percent`}
                  className="block h-11 w-full cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-micro tabular-nums text-muted-foreground" aria-hidden>
                  <span>60%</span>
                  <span>90%</span>
                </div>
              </div>
            </div>
            <p id={`${uid}-threshold-note`} aria-live="polite" className="text-body text-foreground">
              Subjects below {t}% are flagged.
            </p>
          </div>
        )}
      </SettingGroup>

      <SettingGroup id={`${uid}-time`} title="Time format">
        {(labelId) => (
          <div role="radiogroup" aria-labelledby={labelId} className="grid gap-3 sm:grid-cols-2">
            {TIME_FORMATS.map((value) => (
              <RadioCard
                key={value}
                name="time-format"
                value={value}
                title={TIME_INFO[value].label}
                description={`Example: ${TIME_INFO[value].example}`}
                checked={prefs.timeFormat === value}
                onChange={(v) => update({ timeFormat: v as TimeFormat })}
              />
            ))}
          </div>
        )}
      </SettingGroup>
    </div>
  );
}
