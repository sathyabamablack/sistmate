import type { FeeRecord } from "@usp/core";

export type FeeStatus = "paid" | "due" | "upcoming";

export function feeStatus(f: FeeRecord): FeeStatus {
  return f.status ?? (f.paid ? "paid" : "due");
}

const YEAR_PERIOD = /^(\d{4})-(\d{2})(\d{2})?$/;

/** "2025-2026" -> "2025–26". Anything else is returned untouched. */
export function shortAcademicYear(period: string): string {
  const m = YEAR_PERIOD.exec(period);
  if (!m) return period;
  return `${m[1]}–${m[3] ?? m[2]}`;
}

export interface SplitFee {
  kind: string;
  period: string;
}

/** "Tuition fee · 2025-2026" -> kind + period; mock style "X - Semester 5" splits on the dash. */
export function splitFeeDescription(description: string): SplitFee {
  for (const sep of [" · ", " - "]) {
    const i = description.indexOf(sep);
    if (i > 0) {
      return {
        kind: description.slice(0, i).trim(),
        period: description.slice(i + sep.length).trim(),
      };
    }
  }
  return { kind: description.trim(), period: "" };
}

export type FeeRow = FeeRecord & { status: FeeStatus; period: string };

export interface FeeGroup {
  kind: string;
  rows: FeeRow[];
}

/** Groups records by fee kind (first-seen order), each group sorted by period ascending. */
export function groupFees(fees: FeeRecord[]): FeeGroup[] {
  const groups = new Map<string, FeeGroup>();
  for (const f of fees) {
    const { kind, period } = splitFeeDescription(f.description);
    let g = groups.get(kind);
    if (!g) groups.set(kind, (g = { kind, rows: [] }));
    g.rows.push({ ...f, status: feeStatus(f), period });
  }
  for (const g of groups.values()) {
    g.rows.sort((a, b) => a.period.localeCompare(b.period, "en", { numeric: true }));
  }
  return [...groups.values()];
}

export interface FeeSummary {
  paid: number;
  due: number;
  upcoming: number;
  paidTotal: number;
  dueTotal: number;
  hasAmounts: boolean;
  phrase: string;
}

export function summarizeFees(fees: FeeRecord[]): FeeSummary {
  let paid = 0;
  let due = 0;
  let upcoming = 0;
  let paidTotal = 0;
  let dueTotal = 0;
  let hasAmounts = false;
  for (const f of fees) {
    const s = feeStatus(f);
    if (f.amount > 0) hasAmounts = true;
    if (s === "paid") {
      paid++;
      paidTotal += f.amount;
    } else if (s === "due") {
      due++;
      dueTotal += f.amount;
    } else upcoming++;
  }

  const yearly =
    fees.length > 0 &&
    fees.every((f) => YEAR_PERIOD.test(splitFeeDescription(f.description).period));
  const parts: string[] = [];
  if (paid > 0) {
    const noun = yearly ? (paid === 1 ? " year" : " years") : "";
    parts.push(`${paid}${noun} paid`);
  }
  if (upcoming > 0) parts.push(`${upcoming} upcoming`);
  parts.push(due > 0 ? `${due} due` : "nothing due");

  return { paid, due, upcoming, paidTotal, dueTotal, hasAmounts, phrase: parts.join(" · ") };
}
