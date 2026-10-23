import * as cheerio from "cheerio";
import { FeeRecordSchema, type FeeRecord } from "@usp/core";
import { ParseError, validate } from "./errors";
import { DEFAULT_SELECTORS, type ErpSelectors } from "./selectors";
import { cleanText, findTable, normalizeKey, optText, readRows, toIsoDate, toNumber } from "./table";

export interface FeesParseOptions {
  selectors?: ErpSelectors;
}

/**
 * Fee details table -> FeeRecord[].
 *
 * `paid` is decided by the first signal available:
 *   1. a Status column ("Paid" / "Not Paid" / "Pending"; unpaid words win),
 *   2. a Balance column (0 = paid),
 *   3. a Paid Amount column (>= amount = paid),
 *   4. otherwise: a receipt number or paid date means paid.
 * Dates become ISO yyyy-mm-dd. "Total" footer rows are skipped.
 */
export function parseFees(html: string, opts: FeesParseOptions = {}): FeeRecord[] {
  const cfg = (opts.selectors ?? DEFAULT_SELECTORS).fees;
  const $ = cheerio.load(html);
  const match = findTable($, cfg.table, "fees");
  const unpaid = cfg.unpaidTokens.map(normalizeKey);
  const paidWords = cfg.paidTokens.map(normalizeKey);

  const out: FeeRecord[] = [];
  for (const row of readRows(match, cfg.table)) {
    const description = cleanText(row.description);
    if (!description || cfg.skipRowPattern.test(description)) continue;

    const amount = toNumber(row.amount);
    if (amount === null) {
      throw new ParseError("fees", `"${description}": could not read amount from "${row.amount}"`);
    }

    const receiptNo = optText(row.receiptNo);
    const paidDate = toIsoDate(row.paidDate) ?? undefined;
    const dueDate = toIsoDate(row.dueDate) ?? undefined;

    const status = normalizeKey(row.status);
    const balance = toNumber(row.balance);
    const paidAmount = toNumber(row.paidAmount);
    let paid: boolean;
    if (status && unpaid.some((t) => status.includes(t))) paid = false;
    else if (status && paidWords.some((t) => status.includes(t))) paid = true;
    else if (balance !== null) paid = balance <= 0;
    else if (paidAmount !== null) paid = paidAmount >= amount;
    else paid = receiptNo !== undefined || paidDate !== undefined;

    const record: Record<string, unknown> = { description, amount, paid };
    if (dueDate) record.dueDate = dueDate;
    if (paidDate) record.paidDate = paidDate;
    if (receiptNo) record.receiptNo = receiptNo;
    out.push(validate("fees", FeeRecordSchema, record));
  }
  return out;
}
