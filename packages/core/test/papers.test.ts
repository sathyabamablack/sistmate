import { describe, expect, it } from "vitest";
import {
  checkMeta,
  fromStoredType,
  guessMeta,
  isCourseCode,
  looksLikePdf,
  matchSubjects,
  paperFileName,
  signToken,
  storedType,
  subjectFor,
  verifyToken,
} from "../src/papers";

const NOW = new Date("2026-10-24T10:00:00Z");

describe("course codes", () => {
  it.each(["SCSB1303", "S12BLH31", "scsbob1301", " SISB4152 "])("accepts %s", (c) => expect(isCourseCode(c)).toBe(true));
  it.each(["SPECIALIZATION", "SCS12", "X12345", "SCSB1303X12345", ""])("rejects %s", (c) => expect(isCourseCode(c)).toBe(false));
});

describe("checkMeta", () => {
  it("normalises a good form", () => {
    expect(checkMeta({ courseCode: " scsb1303 ", courseTitle: "  Theory   of Computation ", examType: "end_sem", year: "2025", month: "11" }, NOW)).toEqual({
      ok: true,
      value: { courseCode: "SCSB1303", courseTitle: "Theory of Computation", kind: "paper", examType: "end_sem", year: 2025, month: 11, topic: null },
    });
  });

  it("allows a missing month", () => {
    const r = checkMeta({ courseCode: "SCSB1303", examType: "sample", year: 2024, month: "" }, NOW);
    expect(r.ok && r.value.month).toBe(null);
  });

  it("takes notes without a year or exam, dated the year they're shared", () => {
    expect(checkMeta({ courseCode: "SCSB1303", kind: "notes", examType: "", year: "", month: "", topic: "  Unit 3:\n Trees\u0000 " }, NOW)).toEqual({
      ok: true,
      value: { courseCode: "SCSB1303", courseTitle: "", kind: "notes", examType: null, year: 2026, month: null, topic: "Unit 3: Trees" },
    });
  });

  it("keeps a question bank's year when given, drops what only papers have", () => {
    const r = checkMeta({ courseCode: "SCSB1303", kind: "question_bank", examType: "end_sem", year: 2024, month: 5, topic: "" }, NOW);
    expect(r.ok && r.value).toMatchObject({ kind: "question_bank", examType: null, year: 2024, month: null, topic: null });
  });

  it("drops a past paper's topic and caps a long one", () => {
    const paper = checkMeta({ courseCode: "SCSB1303", kind: "paper", examType: "cae", year: 2024, topic: "Unit 1" }, NOW);
    expect(paper.ok && paper.value.topic).toBe(null);
    const notes = checkMeta({ courseCode: "SCSB1303", kind: "notes", topic: "x".repeat(200) }, NOW);
    expect(notes.ok && notes.value.topic).toHaveLength(80);
  });

  it("still reads question banks and notes sent as an exam type", () => {
    const r = checkMeta({ courseCode: "SCSB1303", examType: "question_bank", year: 2023, month: "" }, NOW);
    expect(r.ok && r.value).toMatchObject({ kind: "question_bank", examType: null, year: 2023 });
    expect(checkMeta({ courseCode: "SCSB1303", examType: "notes" }, NOW)).toMatchObject({ ok: true, value: { kind: "notes" } });
  });

  it.each([
    [{ courseCode: "HELLO", examType: "end_sem", year: 2024 }, /subject code/],
    [{ courseCode: "SCSB1303", examType: "quiz", year: 2024 }, /kind of paper/],
    [{ courseCode: "SCSB1303", kind: "paper", examType: "question_bank", year: 2024 }, /kind of paper/],
    [{ courseCode: "SCSB1303", kind: "slides", year: 2024 }, /what you're sharing/],
    [{ courseCode: "SCSB1303", examType: "cae", year: 1999 }, /year/],
    [{ courseCode: "SCSB1303", examType: "cae", year: 2028 }, /year/],
    [{ courseCode: "SCSB1303", examType: "cae", year: "" }, /year/],
    [{ courseCode: "SCSB1303", kind: "notes", year: 1999 }, /year/],
    [{ courseCode: "SCSB1303", examType: "cae", year: 2024, month: 13 }, /month/],
  ])("rejects %j", (input, error) => {
    const r = checkMeta(input, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(error);
  });
});

describe("kinds in the exam_type column", () => {
  it("stores past papers by exam type and the rest by kind", () => {
    expect(storedType({ kind: "paper", examType: "model" })).toBe("model");
    expect(storedType({ kind: "notes", examType: null })).toBe("notes");
    expect(storedType({ kind: "question_bank", examType: null })).toBe("question_bank");
  });

  it("reads every existing exam type back as a past paper, except question banks", () => {
    for (const t of ["end_sem", "cae", "model", "sample", "other"]) expect(fromStoredType(t)).toEqual({ kind: "paper", examType: t });
    expect(fromStoredType("question_bank")).toEqual({ kind: "question_bank", examType: null });
    expect(fromStoredType("notes")).toEqual({ kind: "notes", examType: null });
    expect(fromStoredType("something_new")).toEqual({ kind: "paper", examType: "other" });
  });
});

describe("guessMeta", () => {
  it("reads a typical library title", () => {
    expect(guessMeta("SCSB1303 Theory of Computation Nov/Dec 2023 End Semester Examination")).toEqual({
      courseCode: "SCSB1303",
      year: 2023,
      month: 12,
      examType: "end_sem",
    });
  });

  it("reads file names", () => {
    expect(guessMeta("S12BLH31_model_exam_2025.pdf")).toMatchObject({ courseCode: "S12BLH31", year: 2025, examType: "model" });
    expect(guessMeta("question bank - SMTB1302")).toMatchObject({ courseCode: "SMTB1302", kind: "question_bank" });
    expect(guessMeta("SCSB1303_unit3_notes.pdf")).toMatchObject({ courseCode: "SCSB1303", kind: "notes" });
  });

  it("guesses nothing from nothing", () => {
    expect(guessMeta("scan 004.pdf")).toEqual({});
  });
});

describe("matchSubjects", () => {
  const subjects = [
    { code: "SCSA1302", title: "Theory of Computation", papers: 3 },
    { code: "SCSB1303", title: "Theory of Computation", papers: 9 },
    { code: "SITA3003", title: "Advanced Java Programming", papers: 5 },
    { code: "SCSA3001", title: "Compiler Design", papers: 1 },
  ];

  it("matches code and name words in any order, most papers first", () => {
    expect(matchSubjects(subjects, "theory comp").map((s) => s.code)).toEqual(["SCSB1303", "SCSA1302"]);
    expect(matchSubjects(subjects, "java").map((s) => s.code)).toEqual(["SITA3003"]);
  });

  it("puts code-prefix matches first", () => {
    expect(matchSubjects(subjects, "scsa").map((s) => s.code)).toEqual(["SCSA1302", "SCSA3001"]);
  });

  it("returns nothing for an empty query and respects the limit", () => {
    expect(matchSubjects(subjects, "  ")).toEqual([]);
    expect(matchSubjects(subjects, "s", 2)).toHaveLength(2);
  });
});

describe("files", () => {
  it("recognises PDFs by their first bytes", () => {
    expect(looksLikePdf(new TextEncoder().encode("%PDF-1.7\n"))).toBe(true);
    expect(looksLikePdf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe(false);
    expect(looksLikePdf(new Uint8Array([0x25]))).toBe(false);
  });

  it("builds a safe download name", () => {
    expect(paperFileName({ courseCode: "SCSB1303", kind: "paper", examType: "end_sem", year: 2024, month: 5 })).toBe("SCSB1303-end_sem-2024-05.pdf");
    expect(paperFileName({ courseCode: "SCSB1303", kind: "paper", examType: "sample", year: 2024, month: null })).toBe("SCSB1303-sample-2024.pdf");
    expect(paperFileName({ courseCode: "SCSB1303", kind: "notes", examType: null, year: 2026, month: null })).toBe("SCSB1303-notes-2026.pdf");
  });
});

describe("tokens", () => {
  const KEY = "test-signing-key-0123456789";

  it("round-trips and expires", async () => {
    const token = await signToken({ sub: "abc", role: "admin", exp: 2_000 }, KEY);
    expect(await verifyToken(token, KEY, 1_999)).toEqual({ sub: "abc", role: "admin", exp: 2_000 });
    expect(await verifyToken(token, KEY, 2_000)).toBeNull();
  });

  it("rejects a tampered token, another key, junk and an unknown role", async () => {
    const token = await signToken({ sub: "abc", role: "student", exp: 2_000 }, KEY);
    const [body, sig] = token.split(".");
    const forged = btoa(JSON.stringify({ sub: "abc", role: "admin", exp: 2_000 })).replace(/=+$/, "");
    expect(await verifyToken(`${forged}.${sig}`, KEY, 1)).toBeNull();
    expect(await verifyToken(token, "another-key", 1)).toBeNull();
    expect(await verifyToken(`${body}.${sig}.x`, KEY, 1)).toBeNull();
    expect(await verifyToken("junk", KEY, 1)).toBeNull();
    expect(await verifyToken(token, "", 1)).toBeNull();
    const bad = await signToken({ sub: "abc", role: "root" as never, exp: 2_000 }, KEY);
    expect(await verifyToken(bad, KEY, 1)).toBeNull();
  });

  it("gives a stable anonymous subject per register number", async () => {
    const a = await subjectFor("41110234", KEY);
    expect(a).toHaveLength(22);
    expect(await subjectFor(" 41110234 ", KEY)).toBe(a);
    expect(await subjectFor("41110235", KEY)).not.toBe(a);
    expect(a).not.toContain("41110234");
  });
});
