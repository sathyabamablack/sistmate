import { describe, expect, it } from "vitest";
import {
  caeScores,
  computePlan,
  defaultState,
  estimatedPrevious,
  findGradeForGpa,
  gpaForTargetCgpa,
  parseNumber,
  parseState,
  plannerSubjects,
  sanitizeNumber,
  summaryGuidance,
  withCourses,
  withPresetScale,
  withPreviousFallback,
  type PlannerCourse,
  type PlannerState,
} from "../planner";
import { LEGACY_GRADE_SCALE } from "@usp/core";

const subjects = [
  { code: "CS101", title: "Networks", cae1: 40, cae2: 30 },
  { code: "CS102", title: "OS", cae1: null, cae2: null },
];

const withInputs = (inputs: PlannerState["subjects"], extra: Partial<PlannerState> = {}): PlannerState => ({
  ...defaultState(),
  subjects: inputs,
  ...extra,
});

describe("caeScores", () => {
  it("finds CAE 1 and CAE 2 under the common names", () => {
    expect(caeScores([{ name: "CAE 1", max: 0, scored: 34 }, { name: "CAE 2", max: 0, scored: 38 }])).toEqual({ cae1: 34, cae2: 38 });
    expect(caeScores([{ name: "CIA-1", max: 20, scored: 17 }, { name: "CIA-2", max: 20, scored: null }])).toEqual({ cae1: 17, cae2: null });
  });
  it("does not confuse CAE 12 with CAE 1", () => {
    expect(caeScores([{ name: "CAE 12", max: 0, scored: 5 }])).toEqual({ cae1: null, cae2: null });
  });
  it("returns nulls when nothing matches", () => {
    expect(caeScores([{ name: "Assignment", max: 10, scored: 8 }])).toEqual({ cae1: null, cae2: null });
  });
});

describe("plannerSubjects", () => {
  it("names come from attendance, scores from marks; marks-only subjects are kept", () => {
    const out = plannerSubjects(
      [{ code: "A", title: "Alpha" }],
      [
        { code: "A", title: "x", total: 1, maxTotal: null, components: [{ name: "CAE 1", max: 0, scored: 30 }] },
        { code: "B", title: "Beta", total: null, maxTotal: null, components: [] },
      ],
    );
    expect(out).toEqual([
      { code: "A", title: "Alpha", cae1: 30, cae2: null },
      { code: "B", title: "Beta", cae1: null, cae2: null },
    ]);
  });
});

describe("computePlan", () => {
  it("builds internal from CAEs and the 25 default, and plans the external for the target grade", () => {
    const plan = computePlan(defaultState(), subjects);
    const a = plan.subjects[0]!;
    expect(a.internal).toBe(46); // (40 + 30) x 0.3 + 25
    expect(a.needed).toBe(34); // 80 for grade A+, minus 46
    expect(a.planned).toBe(true);
    expect(a.total).toBe(80);
    expect(a.grade).toBe("A+");
  });

  it("uses what the student typed over the plan, and over ERP scores", () => {
    const plan = computePlan(
      withInputs({ CS101: { cae1: "50", other: "20", external: "45" } }),
      subjects,
    );
    const a = plan.subjects[0]!;
    expect(a.internal).toBe(44); // (50 + 30) x 0.3 + 20
    expect(a.externalEntered).toBe(45);
    expect(a.planned).toBe(false);
    expect(a.total).toBe(89);
    expect(a.grade).toBe("A+"); // 89 is not rounded up to A++
  });

  it("assumes full external when the target cannot be reached", () => {
    const plan = computePlan(withInputs({}, { settings: { ...defaultState().settings, targetGrade: "A++" } }), [
      { code: "X", title: "X", cae1: 0, cae2: 0 },
    ]);
    const x = plan.subjects[0]!;
    expect(x.reachable).toBe(false);
    expect(x.external).toBe(50);
    expect(x.total).toBe(75); // 25 + 50
  });

  it("computes the semester GPA from included subjects only, weighted by credits", () => {
    const state = withInputs({
      CS101: { external: "45", credits: "4" }, // internal 46 + 45 = 91 -> A++ (10)
      CS102: { include: false, credits: "10" },
    });
    const plan = computePlan(state, subjects);
    expect(plan.credits).toBe(4);
    expect(plan.gpa).toBe(10);
  });

  it("projects CGPA only when previous CGPA and credits are both given", () => {
    const state = withInputs({ CS101: { external: "45", credits: "4" }, CS102: { include: false } });
    expect(computePlan(state, subjects).cgpa).toBeNull();
    const withPrev = { ...state, previous: { cgpa: "8", credits: "36" } };
    expect(computePlan(withPrev, subjects).cgpa).toBe(8.2); // (8x36 + 10x4) / 40
  });

  it("clamps an over-large external to the maximum", () => {
    const plan = computePlan(withInputs({ CS101: { external: "999" } }), subjects);
    expect(plan.subjects[0]!.external).toBe(50);
  });
});

describe("parsing and storage", () => {
  it("parseNumber rejects blanks, junk and negatives", () => {
    expect(parseNumber("34.5")).toBe(34.5);
    expect(parseNumber(" 7 ")).toBe(7);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("-3")).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
  });

  it("sanitizeNumber keeps digits and one dot", () => {
    expect(sanitizeNumber("4a5.6.7")).toBe("45.67");
    expect(sanitizeNumber("-12")).toBe("12");
  });

  it("parseState survives corrupt or hostile storage", () => {
    expect(parseState("{not json")).toEqual(defaultState());
    expect(parseState("null")).toEqual(defaultState());
    const odd = parseState(JSON.stringify({
      settings: { caeWeight: "lots", internalMax: -5, scale: [{ grade: "", min: 1, points: 1 }], targetGrade: "ZZ" },
      subjects: { A: "nope", B: { cae1: "30", include: "yes" } },
    }));
    expect(odd.settings.caeWeight).toBe(0.3);
    expect(odd.settings.internalMax).toBe(1);
    expect(odd.settings.scale.length).toBe(6);
    expect(odd.settings.targetGrade).toBe("A+");
    expect(odd.subjects).toEqual({ B: { cae1: "30", cae2: undefined, other: undefined, external: undefined, credits: undefined, include: undefined, target: undefined } });
  });

  it("round-trips a saved state", () => {
    const saved = withInputs({ CS101: { cae1: "33", external: "40" } }, { previous: { cgpa: "8.1", credits: "30" } });
    expect(parseState(JSON.stringify(saved))).toMatchObject({
      previous: { cgpa: "8.1", credits: "30" },
      subjects: { CS101: { cae1: "33", external: "40" } },
    });
  });
});

const LETTER = [
  { min: 90, grade: "O", points: 10 },
  { min: 80, grade: "A+", points: 9 },
  { min: 70, grade: "A", points: 8 },
  { min: 60, grade: "B+", points: 7 },
  { min: 55, grade: "B", points: 6 },
  { min: 50, grade: "C", points: 5 },
  { min: 0, grade: "U", points: 0 },
];
const STANDARD = defaultState().settings.scale;

describe("per-subject target grade", () => {
  it("a subject target overrides the semester target for that subject only", () => {
    const plan = computePlan(withInputs({ CS101: { target: "A++" } }), subjects);
    const [a, b] = plan.subjects;
    expect(a!.target).toBe("A++");
    expect(a!.targetMin).toBe(90);
    expect(a!.needed).toBe(44); // 90 - 46
    expect(b!.target).toBe("A+");
    expect(b!.targetMin).toBe(80);
  });

  it("ignores a target that is not on the scale", () => {
    const plan = computePlan(withInputs({ CS101: { target: "ZZ" } }), subjects);
    expect(plan.subjects[0]!.target).toBe("A+");
  });

  it("reports the best grade possible when a target is out of reach", () => {
    const plan = computePlan(withInputs({ CS102: { target: "A++" } }), subjects);
    const b = plan.subjects[1]!; // internal 25 (no CAE), 25 + 50 = 75
    expect(b.reachable).toBe(false);
    expect(b.bestGrade).toBe("B++");
  });

  it("keeps target through parseState and drops bad values", () => {
    const s = parseState(
      JSON.stringify({ subjects: { A: { target: "B" }, B: { target: "waytoolong" }, C: { target: "" } } }),
    );
    expect(s.subjects.A!.target).toBe("B");
    expect(s.subjects.B!.target).toBeUndefined();
    expect(s.subjects.C!.target).toBeUndefined();
  });
});

describe("grading preset scale", () => {
  it("seeds the scale when the student has not edited it, keeping a target the scale still has", () => {
    const seeded = withPresetScale(defaultState(), LETTER);
    expect(seeded.settings.scale.map((b) => b.grade)).toEqual(["O", "A+", "A", "B+", "B", "C", "U"]);
    expect(seeded.settings.scaleEdited).toBe(false);
    expect(seeded.settings.targetGrade).toBe("A+");
    const s = withPresetScale(
      { ...defaultState(), settings: { ...defaultState().settings, targetGrade: "A++" } },
      LETTER,
    );
    expect(s.settings.targetGrade).toBe("A+");
  });

  it("leaves an edited scale alone", () => {
    const edited = { ...defaultState(), settings: { ...defaultState().settings, scaleEdited: true } };
    expect(withPresetScale(edited, LETTER)).toBe(edited);
  });

  it("reads old saved states: default bands follow the preset, other bands count as edited", () => {
    const plain = parseState(JSON.stringify(defaultState()));
    expect(plain.settings.scaleEdited).toBeUndefined();
    expect(withPresetScale(plain, LETTER).settings.scale[0]!.grade).toBe("O");

    const custom = parseState(
      JSON.stringify({ settings: { scale: [{ grade: "P", min: 40, points: 6 }, { grade: "F", min: 0, points: 0 }] } }),
    );
    expect(custom.settings.scaleEdited).toBe(true);
    expect(withPresetScale(custom, LETTER).settings.scale[0]!.grade).toBe("P");
  });

  it("moves a state saved with the old S to U default onto the official scale", () => {
    const old = parseState(JSON.stringify({ settings: { scale: LEGACY_GRADE_SCALE, targetGrade: "A" } }));
    expect(old.settings.scaleEdited).toBeUndefined();
    const moved = withPresetScale(old, STANDARD);
    expect(moved.settings.scale.map((b) => b.grade)).toEqual(["A++", "A+", "B++", "B+", "C", "RA"]);
    expect(moved.settings.targetGrade).toBe("A+");
  });

  it("round-trips the flag, so a seeded state follows a later preset change", () => {
    const back = parseState(JSON.stringify(withPresetScale(defaultState(), LETTER)));
    expect(back.settings.scaleEdited).toBe(false);
    expect(withPresetScale(back, STANDARD).settings.scale[0]!.grade).toBe("A++");
  });
});

describe("summaryGuidance", () => {
  it("gives the average and the hardest subject, and what is out of reach", () => {
    const lines = summaryGuidance(computePlan(withInputs({}), subjects), 50);
    // CS101 needs 34; CS102 (internal 25) would need 55 for A+
    expect(lines[0]).toBe("In the other subject you need 34 external marks on average out of 50; the hardest is Networks (34).");
    expect(lines[1]).toBe("Out of reach: OS for A+ (best possible B++).");
  });

  it("uses the 'every subject' wording when nothing is out of reach", () => {
    const lines = summaryGuidance(computePlan(withInputs({ CS102: { include: false } }), subjects), 50);
    expect(lines).toEqual(["To get A+ in every subject you need 34 external marks on average out of 50; the hardest is Networks (34)."]);
  });

  it("says so when everything is already secured", () => {
    const state = withInputs({}, { settings: { ...defaultState().settings, targetGrade: "C" } });
    const lines = summaryGuidance(computePlan(state, [{ code: "X", title: "X", cae1: 50, cae2: 50 }]), 50);
    expect(lines).toEqual([
      "Your internal marks already secure C in every subject. You still need 30% of each exam to pass.",
    ]);
  });

  it("is empty when no subject is counted", () => {
    const state = withInputs({ CS101: { include: false }, CS102: { include: false } });
    expect(summaryGuidance(computePlan(state, subjects), 50)).toEqual([]);
  });
});

describe("target semester GPA", () => {
  // internal = (40 + 40) x 0.3 + 25 = 49 in both subjects
  const two = [
    { code: "A", title: "Alpha", cae1: 40, cae2: 40 },
    { code: "B", title: "Beta", cae1: 40, cae2: 40 },
  ];

  it("finds the lowest uniform grade that reaches the GPA", () => {
    const goal = findGradeForGpa(defaultState(), two, 8);
    expect(goal.grade).toBe("B++");
    expect(goal.plan!.gpa).toBe(8);
    expect(findGradeForGpa(defaultState(), two, 8.5).grade).toBe("A+");
  });

  it("ignores per-subject targets in the search", () => {
    expect(findGradeForGpa(withInputs({ A: { target: "A++" } }), two, 8).grade).toBe("B++");
  });

  it("reports the best reachable GPA when the target is out of reach", () => {
    const goal = findGradeForGpa(defaultState(), [{ code: "X", title: "X", cae1: 0, cae2: 0 }], 9.5);
    expect(goal.grade).toBeNull();
    expect(goal.bestGpa).toBe(8); // 25 + 50 = 75 is a B++ (8 points)
  });
});

describe("target CGPA", () => {
  it("converts a CGPA goal into the semester GPA needed", () => {
    // (8.55 x 60 - 8 x 36) / 24 = 9.375, rounded up; 8.5 gives exactly 9.25
    expect(gpaForTargetCgpa(8.55, 8, 36, 24)).toBe(9.38);
    expect(gpaForTargetCgpa(8.5, 8, 36, 24)).toBe(9.25);
  });
  it("is zero when the goal is already met and null without credits", () => {
    expect(gpaForTargetCgpa(5, 9, 60, 20)).toBe(0);
    expect(gpaForTargetCgpa(8, 8, 60, 0)).toBeNull();
  });
});

describe("estimated previous standing", () => {
  const sem = (over: Record<string, unknown>) =>
    ({ name: "S", results: [], gpa: 8, credits: 20, estimated: true, ...over }) as never;

  it("is credit-weighted over estimated semesters only", () => {
    const out = estimatedPrevious([
      sem({ gpa: 8, credits: 20 }),
      sem({ gpa: 9, credits: 20 }),
      sem({ gpa: 5, credits: 20, estimated: false }),
    ]);
    expect(out).toEqual({ cgpa: "8.50", credits: "40" });
  });
  it("is null when nothing was estimated", () => {
    expect(estimatedPrevious([sem({ estimated: false })])).toBeNull();
    expect(estimatedPrevious([])).toBeNull();
  });

  it("fills blank fields only; typed values win", () => {
    const fb = { cgpa: "8.50", credits: "40" };
    expect(withPreviousFallback(defaultState(), fb).previous).toEqual(fb);
    const typed = { ...defaultState(), previous: { cgpa: "7", credits: " " } };
    expect(withPreviousFallback(typed, fb).previous).toEqual({ cgpa: "7", credits: "40" });
    expect(withPreviousFallback(typed, null)).toBe(typed);
  });

  it("feeds the projected CGPA through computePlan", () => {
    const state = withPreviousFallback(
      withInputs({ CS101: { external: "45", credits: "4" }, CS102: { include: false } }),
      { cgpa: "8", credits: "36" },
    );
    expect(computePlan(state, subjects).cgpa).toBe(8.2);
  });
});

describe("official course facts", () => {
  const theory: PlannerCourse = { credits: 3, internalMax: 50, externalMax: 50, maxTotal: 100, audit: false, source: "official" };
  const lab1: PlannerCourse = { credits: 1, internalMax: 25, externalMax: 25, maxTotal: 50, audit: false, source: "official" };

  it("scales the target to a one-credit lab out of 50 and uses its credits", () => {
    const plan = computePlan(defaultState(), [{ code: "L", title: "Physics Lab", cae1: 30, cae2: 30, course: lab1 }]);
    const l = plan.subjects[0]!;
    expect(l.internal).toBe(25); // 18 + 25, capped at the lab's 25
    expect(l.targetTotal).toBe(40); // A+ is 80% of 50
    expect(l.needed).toBe(15);
    expect(l.total).toBe(40);
    expect(l.percent).toBe(80);
    expect(l.grade).toBe("A+");
    expect(l.credits).toBe(1);
    expect(l.creditSource).toBe("official");
    expect(plan.credits).toBe(1);
  });

  it("never asks for less than the exam pass minimum, and fails a weak exam", () => {
    const strong = { code: "T", title: "Theory", cae1: 50, cae2: 50, course: theory }; // internal 50
    const c = computePlan(withInputs({}, { settings: { ...defaultState().settings, targetGrade: "C" } }), [strong]);
    expect(c.subjects[0]).toMatchObject({ secured: true, needed: 15, externalMin: 15, reachable: true, grade: "B+" });
    const weak = computePlan(withInputs({ T: { external: "14" } }), [strong]);
    expect(weak.subjects[0]).toMatchObject({ total: 64, grade: "RA", points: 0 });
    // the minimum for a 25-mark exam is 7.5, so 8 whole marks
    const lab = computePlan(withInputs({}, { settings: { ...defaultState().settings, targetGrade: "C" } }), [
      { code: "L", title: "Lab", cae1: 50, cae2: 50, course: lab1 },
    ]);
    expect(lab.subjects[0]!.needed).toBe(8);
  });

  it("typed credits still win over the official credits", () => {
    const plan = computePlan(withInputs({ L: { credits: "2" } }), [{ code: "L", title: "Lab", cae1: 0, cae2: 0, course: lab1 }]);
    expect(plan.subjects[0]!.credits).toBe(2);
  });

  it("leaves audit courses out of the GPA unless the student ticks them", () => {
    const audit: PlannerCourse = { ...theory, credits: 0, externalMax: 0, maxTotal: 50, audit: true };
    const subjectsWithAudit = [
      { code: "T", title: "Theory", cae1: 40, cae2: 40, course: theory },
      { code: "EVS", title: "Environmental Science", cae1: 40, cae2: 40, course: audit },
    ];
    const plan = computePlan(defaultState(), subjectsWithAudit);
    expect(plan.subjects[1]!.included).toBe(false);
    expect(plan.credits).toBe(3);
    expect(computePlan(withInputs({ EVS: { include: true } }), subjectsWithAudit).subjects[1]!.included).toBe(true);
  });

  it("withCourses attaches the resolver's facts", () => {
    const out = withCourses([{ code: "X", title: "X", cae1: null, cae2: null }], () => ({
      credits: 4,
      type: "integrated",
      maxTotal: 100,
      internalMax: 50,
      externalMax: 50,
      audit: false,
      source: "fallback",
      regulation: "2023",
      creditSource: "estimated",
    }));
    expect(out[0]!.course).toEqual({
      credits: 4,
      internalMax: 50,
      externalMax: 50,
      maxTotal: 100,
      audit: false,
      source: "estimated",
    });
  });
});
