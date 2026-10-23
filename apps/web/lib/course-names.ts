/**
 * Moodle course names at Sathyabama carry a lot of packaging:
 *   "S12BLH31 - Programming in Java-Theory+Practical-III Semester-2025 Batch"
 *   "SCSA1302/SCSB1303-Theory of Computation - CSE/SPECIALIZATION/IT - CORE - III - 2025 BATCH"
 *   "SCSB1202 - Data Structures _CSE AND IT_THEORY"
 * These helpers pull out the subject code and a clean, readable title, and
 * match courses to this semester's subjects from the ERP by code or by title.
 * Pure functions; safe on client and server.
 */

/** Sathyabama subject codes: S + letters/digits, e.g. SCSB1303, S12BLH31, SCSBOB1301, SISB4152. */
const CODE = /\bS[A-Z0-9]{5,10}\b/g;

/** Trailing or leading pieces that describe the offering, not the subject. */
const NOISE = [
  /^(b\.?\s?e\.?|b\.?\s?tech|m\.?\s?e\.?)$/i,
  /^(cse|it|ece|eee|mech|civil|specialization|specialisation)([\s/&,]+(and\s+)?(cse|it|ece|eee|specialization|specialisation))*$/i,
  /^(core|elective|theory|practical|lab|theory\s*\+\s*practical|theory\s*and\s*practical)$/i,
  /^(cse\s+and\s+it)(\s+theory)?$/i,
  /^([ivx]+|[1-8](st|nd|rd|th)?)(\s+sem(ester)?)?$/i,
  /^sem(ester)?\s*[ivx0-9]+$/i,
  /^\d{4}(\s*-\s*\d{2,4})?(\s+batch)?$/i,
  /^batch(\s+\d{4})?$/i,
  /^\d{4}\s+batch$/i,
];

const SMALL_WORDS = new Set(["and", "of", "in", "for", "the", "to", "with", "on", "a", "an", "&"]);
const KEEP_UPPER = new Set(["IT", "CSE", "AI", "ML", "IOT", "UNIX", "SQL", "OS", "DBMS", "C", "II", "III", "IV", "VLSI", "LCS"]);

export function extractCodes(...texts: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const t of texts) {
    for (const m of (t ?? "").toUpperCase().matchAll(CODE)) {
      // Real codes mix letters and digits; skip words like "SPECIALIZATION".
      if (/\d/.test(m[0]) && !out.includes(m[0])) out.push(m[0]);
    }
  }
  return out;
}

const isNoise = (piece: string) => {
  const p = piece.trim().replace(/[.]+$/, "");
  return p === "" || NOISE.some((re) => re.test(p));
};

function titleCase(s: string): string {
  const letters = s.replace(/[^A-Za-z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "").length;
  // Only rewrite names that are mostly capitals; mixed-case names are kept as written.
  if (letters.length === 0 || upper / letters.length < 0.7) return s;
  return s
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^\s+$/.test(w)) return w;
      if (KEEP_UPPER.has(w.toUpperCase())) return w.toUpperCase();
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join("");
}

/** A readable subject title from a Moodle course name. */
export function cleanCourseTitle(fullName: string): string {
  let s = fullName.replace(/\s+/g, " ").trim();
  // Leading code(s): "SCSA1302/SCSB1303-" or "S12BLH31 - ".
  s = s.replace(/^(\s*S[A-Z0-9]{5,10}\s*[/,&]?\s*)+[-–:_]?\s*/i, (m) => (/\d/.test(m) ? "" : m));
  // Drop trailing offering details piece by piece ("- III Semester - 2025 Batch").
  for (let guard = 0; guard < 8; guard++) {
    const m = s.match(/^(.*\S)\s*[-–_|]\s*([^-–_|]*)$/);
    if (!m || !isNoise(m[2]!)) break;
    s = m[1]!.trim();
  }
  // A trailing parenthesised code or batch: "Data Structures (SCSB1202)".
  s = s.replace(/\s*\((S[A-Z0-9]{5,10}|\d{4}\s*batch)\)\s*$/i, "").trim();
  s = s.replace(/[-–_|:\s]+$/, "").trim();
  return titleCase(s) || fullName;
}

const normTitle = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export interface ErpSubject {
  code: string;
  title: string;
}

export interface CourseDisplay {
  /** The clean title to show: the ERP's subject name when matched, else the cleaned Moodle name. */
  title: string;
  /** The subject code to show next to it, when one is known. */
  code: string | null;
  /** True when the course matches one of this semester's ERP subjects. */
  current: boolean;
}

/** How to show one Moodle course, given this semester's subjects from the ERP. */
export function displayCourse(
  course: { fullName: string; shortName: string },
  subjects: ErpSubject[] = [],
): CourseDisplay {
  const codes = extractCodes(course.shortName, course.fullName);
  const byCode = subjects.find((s) => codes.includes(s.code.toUpperCase()));
  const cleaned = cleanCourseTitle(course.fullName);
  const byTitle = byCode
    ? undefined
    : subjects.find((s) => {
        const a = normTitle(s.title);
        const b = normTitle(cleaned);
        return a.length >= 6 && b.length >= 6 && (a === b || a.includes(b) || b.includes(a));
      });
  const match = byCode ?? byTitle;
  // "SCSA1302/SCSB1303" lists the old and new code; the later one is current.
  const code = match?.code ?? codes[codes.length - 1] ?? null;
  return { title: match?.title ?? cleaned, code, current: Boolean(match) };
}

/** ERP subjects for this semester (attendance first, then the timetable), de-duplicated by code. */
export function erpSubjects(
  attendance: { code: string; title: string }[],
  timetable: { courseCode: string; courseTitle?: string | null }[],
): ErpSubject[] {
  const out = new Map<string, ErpSubject>();
  for (const a of attendance) if (a.code) out.set(a.code.toUpperCase(), { code: a.code.toUpperCase(), title: a.title });
  for (const t of timetable) {
    const code = t.courseCode?.toUpperCase();
    if (code && !out.has(code) && t.courseTitle) out.set(code, { code, title: t.courseTitle });
  }
  return [...out.values()];
}

/**
 * The courses a student should see, in one place so Courses, the dashboard and
 * the command palette never disagree.
 *
 * Moodle returns every semester the student was ever enrolled in, so the
 * default preference lists this semester only. That falls back to the whole
 * list when nothing matches this semester's ERP subjects, so a term the ERP has
 * not published yet never leaves the page empty. Courses hidden by hand are
 * always dropped.
 */
export function visibleCourses<T extends { id: number; fullName: string; shortName: string }>(
  courses: T[],
  prefs: { courseFilter: "current" | "all"; hiddenCourses: number[] },
  subjects: ErpSubject[],
): T[] {
  const hidden = new Set(prefs.hiddenCourses);
  const listed = courses.filter((c) => !hidden.has(c.id));
  if (prefs.courseFilter !== "current") return listed;
  const current = listed.filter((c) => displayCourse(c, subjects).current);
  return current.length > 0 ? current : listed;
}
