/**
 * Best-effort guardrails for an anonymous room: no links (spam), no phone numbers, emails or
 * register numbers (doxxing), and no slurs. Determined users can get around any word list;
 * the admin page is the real backstop.
 */

export const MAX_LEN = 280;

const LINK =
  /(https?:\/\/|www\.)|\b[a-z0-9-]+\s*(\.|\(dot\)|\[dot\])\s*(com|in|net|org|io|me|co|ly|gg|xyz|app|dev|link|site|online|info|tk|to|ru|live|store|shop|ac\.in)\b/i;
/** Eight or more digits, allowing spaces, dashes and dots between them: phones and register numbers. */
const LONG_NUMBER = /(?:\d[\s.-]?){8,}/;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;

/** Matched as whole words after undoing common letter swaps. Extend as needed. */
const SLURS = ["nigger", "nigga", "faggot", "fag", "retard", "tranny", "chink", "kike", "spic"];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z\s]/g, "");
}

/** One line, no control characters, trimmed. Too long counts as empty so it is never stored. */
export function cleanText(raw: string, max = MAX_LEN): string {
  const text = raw
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length <= max ? text : "";
}

/** `extra` is the admin's own blocked words or phrases, matched as whole words after the same cleanup. */
export function blockReason(text: string, extra: string[] = []): string | null {
  if (LINK.test(text)) return "no links here";
  if (LONG_NUMBER.test(text) || EMAIL.test(text)) return "no numbers or emails, keep it anonymous";
  const words = normalize(text).split(/\s+/);
  if (SLURS.some((s) => words.includes(s))) return "keep it civil";
  const spaced = ` ${words.join(" ")} `;
  if (extra.some((w) => spaced.includes(` ${normalize(w).replace(/\s+/g, " ").trim()} `))) return "that word isn't allowed here";
  return null;
}

/** A blocked-word entry as stored: lowercase, one line, short. */
export function cleanWord(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 30);
}
