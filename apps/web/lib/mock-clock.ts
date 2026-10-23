import { campusClock } from "./utils";

/**
 * The mock ERP and LMS datasets are written around one fixed "today". In mock
 * mode we shift every date by (real today − that day), so the demo always
 * looks current: deadlines stay "in 2 days", notifications "3 hours ago".
 */
const MOCK_TODAY = Date.UTC(2026, 9, 11); // 2026-10-11, the mocks' anchor day
const DATE_KEYS = new Set(["date", "dueDate", "paidDate"]);
const DAY_MS = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function mockDayOffset(now = new Date()): number {
  return Math.round((campusClock(now).dayStamp - MOCK_TODAY) / DAY_MS);
}

function shiftValue(value: string, days: number): string {
  const t = Date.parse(value);
  if (Number.isNaN(t)) return value;
  const shifted = new Date(t + days * DAY_MS).toISOString();
  return DATE_ONLY.test(value) ? shifted.slice(0, 10) : shifted;
}

export function shiftDates<T>(value: T, days: number): T {
  if (Array.isArray(value)) return value.map((v) => shiftDates(v, days)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = DATE_KEYS.has(k) && typeof v === "string" ? shiftValue(v, days) : shiftDates(v, days);
    }
    return out as T;
  }
  return value;
}

/**
 * Getters that take a date range and generate their mock data against the real
 * clock already; shifting them again would move every day off its weekday.
 */
const REAL_CLOCK_GETTERS = new Set(["getDailyAttendance", "getHourlyAttendance"]);

/** Wrap a mock adapter so every getter's result is shifted to today. */
export function withCurrentDates<T extends object>(adapter: T, days = mockDayOffset()): T {
  if (days === 0) return adapter;
  return new Proxy(adapter, {
    get(target, prop, receiver) {
      const member: unknown = Reflect.get(target, prop, receiver);
      if (typeof member !== "function" || !String(prop).startsWith("get")) return member;
      if (REAL_CLOCK_GETTERS.has(String(prop))) return member;
      return async (...args: unknown[]) =>
        shiftDates(await (member as (...a: unknown[]) => Promise<unknown>).apply(target, args), days);
    },
  });
}
