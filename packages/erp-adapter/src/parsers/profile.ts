import * as cheerio from "cheerio";
import { StudentProfileSchema, type StudentProfile } from "@usp/core";
import { ParseError, validate } from "./errors";
import { DEFAULT_SELECTORS, type ErpSelectors, type ProfileField } from "./selectors";
import { cellLines, cleanText, normalizeKey, optText, resolveUrl, scopeOf, toSemester, type Sel } from "./table";

export interface ProfileParseOptions {
  selectors?: ErpSelectors;
  /** Resolve a relative photo src against this (e.g. the page URL). */
  baseUrl?: string;
}

/**
 * Student profile from label/value pairs. Handles the usual layouts:
 *  - tables:  | Register No | : | 41110234 | Name | : | ... |
 *  - one cell "Register No : 41110234"
 *  - <label>Email</label><span>...</span>, <dt>/<dd>
 * Labels are matched by alias (selectors.ts > profile.labels), never by position.
 */
export function parseProfile(html: string, opts: ProfileParseOptions = {}): StudentProfile {
  const sel = opts.selectors ?? DEFAULT_SELECTORS;
  const cfg = sel.profile;
  const $ = cheerio.load(html);
  const scope = scopeOf($, cfg.container);

  // alias (normalised) -> field
  const aliasToField = new Map<string, ProfileField>();
  for (const field of Object.keys(cfg.labels) as ProfileField[]) {
    for (const alias of cfg.labels[field]) {
      const k = normalizeKey(alias);
      if (k && !aliasToField.has(k)) aliasToField.set(k, field);
    }
  }
  const fieldOf = (label: string): ProfileField | undefined => aliasToField.get(normalizeKey(label));

  const values = new Map<ProfileField, string>();
  const put = (field: ProfileField | undefined, value: string | undefined): void => {
    if (!field) return;
    const v = optText(value);
    if (v !== undefined && !values.has(field)) values.set(field, v);
  };

  // 1) Explicit value selectors win (e.g. "#ContentPlaceHolder1_lblRegNo").
  for (const field of Object.keys(cfg.valueSelectors) as ProfileField[]) {
    const s = cfg.valueSelectors[field];
    if (s) put(field, valueOf($(s).first()));
  }

  // 2) Table rows: walk cells, a cell that is a known label takes the next cell as value.
  for (const tr of scope.find("tr").toArray()) {
    const cells = $(tr)
      .children("td, th")
      .toArray()
      .map((td) => $(td))
      .filter((td) => cleanText(td.text()) !== ":");
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (!cell) continue;
      const text = cellLines(cell).join(" ");
      const field = fieldOf(text);
      if (field) {
        const next = cells[i + 1];
        if (next) put(field, valueOf(next));
        i += 1;
        continue;
      }
      // "Label : Value" in a single cell
      const colon = text.indexOf(":");
      if (colon > 0) put(fieldOf(text.slice(0, colon)), text.slice(colon + 1));
    }
  }

  // 3) <label>/<dt>/.lbl elements: value is the next sibling element.
  for (const el of scope.find(cfg.labelSelector).toArray()) {
    const label = $(el);
    const text = cleanText(label.text());
    const field = fieldOf(text);
    if (field) {
      let next = label.next();
      while (next.length > 0 && cleanText(next.text()) === ":") next = next.next();
      if (next.length > 0) put(field, valueOf(next));
      continue;
    }
    const colon = text.indexOf(":");
    if (colon > 0) put(fieldOf(text.slice(0, colon)), text.slice(colon + 1));
  }

  const get = (f: ProfileField): string | undefined => values.get(f);

  const registerNumber = get("registerNumber");
  const name = get("name");
  if (!registerNumber || !name) {
    throw new ParseError(
      "profile",
      `missing ${!registerNumber ? "register number" : "name"}; labels seen: ${
        Array.from(values.keys()).join(", ") || "(none)"
      }. Add the real label text to selectors.ts > profile.labels.`,
    );
  }

  const semRaw = get("semester");
  const semester = toSemester(semRaw);
  if (semester === null) {
    throw new ParseError("profile", `could not read semester from "${semRaw ?? ""}"`);
  }

  const { program, department } = programAndDepartment(get("program"), get("department"), cfg.programSeparators);
  if (!program) throw new ParseError("profile", "missing degree/programme");

  const photoSrc = scope.find(cfg.photo).first().attr("src") ?? $(cfg.photo).first().attr("src");
  const batch = get("batch")?.replace(/\s*[-\u2013]\s*/g, "-");

  const profile: Record<string, unknown> = {
    registerNumber,
    name,
    program,
    department,
    semester,
  };
  const optional: Array<[string, string | undefined]> = [
    ["section", get("section")],
    ["batch", batch],
    ["email", get("email")],
    ["phone", get("phone")],
    ["photoUrl", resolveUrl(photoSrc, opts.baseUrl)],
    ["advisor", get("advisor")],
  ];
  for (const [k, v] of optional) if (v !== undefined) profile[k] = v;

  return validate("profile", StudentProfileSchema, profile);
}

/** Text of a value cell; falls back to an <input value> / selected <option>. */
function valueOf(node: Sel): string {
  const text = cellLines(node).join(" ");
  if (text) return text;
  const input = node.is("input") ? node : node.find("input").first();
  const v = input.attr("value");
  if (v) return v;
  return cleanText(node.find("option[selected]").first().text());
}

/**
 * "B.E. / Computer Science and Engineering" ->
 *   program "B.E. Computer Science and Engineering", department "Computer Science and Engineering".
 * An explicit Department/Branch label wins for `department`.
 */
function programAndDepartment(
  rawProgram: string | undefined,
  rawDept: string | undefined,
  separators: readonly string[],
): { program: string; department: string } {
  if (!rawProgram) {
    return { program: rawDept ?? "", department: rawDept ?? "" };
  }
  for (const sep of separators) {
    const idx = rawProgram.indexOf(sep);
    if (idx <= 0) continue;
    const degree = cleanText(rawProgram.slice(0, idx));
    const branch = cleanText(rawProgram.slice(idx + sep.length));
    if (degree && branch) {
      return { program: `${degree} ${branch}`, department: rawDept ?? branch };
    }
  }
  if (rawDept && !rawProgram.toLowerCase().includes(rawDept.toLowerCase())) {
    return { program: `${rawProgram} ${rawDept}`, department: rawDept };
  }
  return { program: rawProgram, department: rawDept ?? rawProgram };
}
