/**
 * Donation settings and UPI link building. Pure functions, no I/O.
 *
 * Set NEXT_PUBLIC_UPI_ID (the receiving UPI ID) and optionally NEXT_PUBLIC_UPI_NAME (the
 * payee name some UPI apps show). Without an id the donate page says donations are not
 * open yet, except in development, where a placeholder lets the page be previewed.
 */

import { SITE_NAME } from "./site";

export const PRESET_AMOUNTS = [20, 50, 100, 200, 500] as const;
export const DEFAULT_AMOUNT = 50;
export const MIN_AMOUNT = 1;
export const MAX_AMOUNT = 10_000;

const DEV_PLACEHOLDER_ID = "yourname@upi";

export const UPI_ID: string =
  process.env.NEXT_PUBLIC_UPI_ID?.trim() ||
  (process.env.NODE_ENV === "production" ? "" : DEV_PLACEHOLDER_ID);

export const UPI_NAME: string = process.env.NEXT_PUBLIC_UPI_NAME?.trim() || SITE_NAME;

export const DONATIONS_OPEN = UPI_ID !== "";

/** Whole rupees only, within limits. Anything else is not a payable amount. */
export function validAmount(n: number | null): n is number {
  return n !== null && Number.isInteger(n) && n >= MIN_AMOUNT && n <= MAX_AMOUNT;
}

/** Digits only ("₹ 1,2a0" becomes 120); empty or oversized input gives null. */
export function parseAmount(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  if (digits === "" || digits.length > 6) return null;
  return Number(digits);
}

export function formatInr(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

export interface UpiRequest {
  id: string;
  name: string;
  amount: number;
  note: string;
}

function query({ id, name, amount, note }: UpiRequest): string {
  const params: Array<[string, string]> = [
    ["pa", id],
    ["pn", name],
    ["am", String(amount)],
    ["cu", "INR"],
    ["tn", note],
  ];
  return params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}

/** The standard link: Android and iOS both offer every installed UPI app. */
export function upiLink(req: UpiRequest): string {
  return `upi://pay?${query(req)}`;
}

export type UpiApp = "gpay" | "phonepe" | "paytm";

/** Per-app deep links. Google Pay uses a different scheme on Android (tez) than on iOS (gpay). */
export function upiAppLink(app: UpiApp, req: UpiRequest, ios: boolean): string {
  const q = query(req);
  switch (app) {
    case "gpay":
      return ios ? `gpay://upi/pay?${q}` : `tez://upi/pay?${q}`;
    case "phonepe":
      return `phonepe://pay?${q}`;
    case "paytm":
      return `paytmmp://pay?${q}`;
  }
}
