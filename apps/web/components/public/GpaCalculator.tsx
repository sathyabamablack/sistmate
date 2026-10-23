"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { SATHYABAMA_GRADE_SCALE } from "@usp/core";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface Row {
  id: number;
  credits: string;
  grade: string;
}

const GRADES = SATHYABAMA_GRADE_SCALE.map((g) => g.grade);
const POINTS = new Map(SATHYABAMA_GRADE_SCALE.map((g) => [g.grade, g.points]));

function blankRow(id: number): Row {
  return { id, credits: "3", grade: "A+" };
}

/**
 * GPA over the rows entered. RA rows are left out of both sums, as the regulations say:
 * a failed course does not count until it is cleared.
 */
function summarise(rows: Row[]) {
  let weighted = 0;
  let credits = 0;
  let failed = 0;
  for (const r of rows) {
    const c = Number(r.credits);
    if (!Number.isFinite(c) || c <= 0) continue;
    const points = POINTS.get(r.grade) ?? 0;
    if (r.grade === "RA") {
      failed += 1;
      continue;
    }
    weighted += c * points;
    credits += c;
  }
  return { gpa: credits > 0 ? weighted / credits : null, credits, failed };
}

/** Public GPA/CGPA calculator: add courses, pick grades, read the result. Stores nothing. */
export function GpaCalculator() {
  const nextId = React.useRef(4);
  const [rows, setRows] = React.useState<Row[]>(() => [blankRow(1), blankRow(2), blankRow(3)]);
  const { gpa, credits, failed } = summarise(rows);

  const update = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <form
      aria-label="GPA calculator"
      onSubmit={(e) => e.preventDefault()}
      className="grid gap-8 rounded-xl border border-border bg-surface p-4 sm:p-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-10"
    >
      <div>
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`credits-${r.id}`} className="text-small font-medium text-muted-foreground">
                  Course {i + 1} credits
                </label>
                <Input
                  id={`credits-${r.id}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={10}
                  step="any"
                  value={r.credits}
                  onChange={(e) => update(r.id, { credits: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`grade-${r.id}`} className="text-small font-medium text-muted-foreground">
                  Grade
                </label>
                <Select id={`grade-${r.id}`} value={r.grade} onChange={(e) => update(r.id, { grade: e.target.value })}>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g === "RA" ? "RA (reappear)" : `${g} (${POINTS.get(g)} points)`}
                    </option>
                  ))}
                </Select>
              </div>
              <button
                type="button"
                aria-label={`Remove course ${i + 1}`}
                onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                disabled={rows.length <= 1}
                className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focusable disabled:pointer-events-none disabled:opacity-40"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="md"
          className="mt-4"
          onClick={() => setRows((rs) => [...rs, blankRow(nextId.current++)])}
        >
          <Plus className="h-4 w-4" aria-hidden /> Add course
        </Button>
      </div>

      <div aria-live="polite" className="self-start rounded-lg bg-accent p-5 sm:p-6">
        <p className="text-small font-medium text-muted-foreground">Your GPA</p>
        <p className="mt-1 font-display text-[3.5rem] font-semibold leading-none tabular-nums">
          {gpa === null ? "–" : gpa.toFixed(2)}
        </p>
        <p className="mt-3 text-body text-muted-foreground">
          {credits > 0 ? `${credits} credits counted.` : "Add credits and grades to see it."}
          {failed > 0
            ? ` ${failed} reappear ${failed === 1 ? "course is" : "courses are"} left out until cleared.`
            : ""}
        </p>
      </div>
    </form>
  );
}
