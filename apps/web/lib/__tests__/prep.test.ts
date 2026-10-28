import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@usp/core";
import {
  addTopic,
  cleanTopicName,
  courseFor,
  defaultPrepState,
  defaultTopics,
  examLabel,
  examSubject,
  goalNote,
  MAX_TOPICS,
  needFor,
  needSentence,
  needShort,
  nextExamFor,
  parsePrepState,
  planFor,
  removeTopic,
  renameTopic,
  resolvePlanner,
  setTopicDone,
  topicProgress,
  topicsFor,
  withTopics,
} from "../prep";
import {
  defaultState,
  parseState,
  resolveGoal,
  withPresetScale,
  withPreviousFallback,
  type PlannerCourse,
  type PlannerState,
  type PlannerSubject,
} from "../planner";

const theory: PlannerCourse = {
  credits: 3,
  internalMax: 50,
  externalMax: 50,
  maxTotal: 100,
  audit: false,
  paperMax: 100,
  source: "official",
};
const lab: PlannerCourse = { ...theory, credits: 1, internalMax: 25, externalMax: 25, maxTotal: 50, paperMax: 25 };

// The demo student's Computer Networks: CAE 17 and 18, so internal (17 + 18) x 0.3 + 20 = 31.
const subjects: PlannerSubject[] = [
  { code: "SCSA5101", title: "Computer Networks", cae1: 17, cae2: 18, course: theory },
  { code: "SCSA5106", title: "Web Technology Laboratory", cae1: 40, cae2: 40, course: lab },
  { code: "SCSA5102", title: "Operating Systems", cae1: 10, cae2: 10, course: theory },
];

const saved = (patch: Partial<PlannerState> = {}) => JSON.stringify({ ...defaultState(), ...patch });

describe("revision checklist", () => {
  it("starts every subject with the five units", () => {
    const topics = topicsFor(defaultPrepState(), "SCSA5101");
    expect(topics.map((t) => t.name)).toEqual(["Unit 1", "Unit 2", "Unit 3", "Unit 4", "Unit 5"]);
    expect(topicProgress(topics)).toEqual({ done: 0, total: 5, percent: 0 });
  });

  it("adds, renames, ticks and removes topics", () => {
    let topics = addTopic(defaultTopics(), "  Routing   algorithms ");
    expect(topics.at(-1)).toEqual({ id: "t6", name: "Routing algorithms", done: false });
    topics = renameTopic(topics, "t2", "Unit 2: Transport layer");
    topics = setTopicDone(topics, "t1", true);
    topics = removeTopic(topics, "t5");
    expect(topics.map((t) => t.name)).toEqual(["Unit 1", "Unit 2: Transport layer", "Unit 3", "Unit 4", "Routing algorithms"]);
    expect(topicProgress(topics)).toEqual({ done: 1, total: 5, percent: 20 });
    // New ids never reuse one still in the list.
    expect(addTopic(removeTopic(defaultTopics(), "t2"), "X").at(-1)!.id).toBe("t6");
  });

  it("ignores blank names and a full list", () => {
    const topics = defaultTopics();
    expect(addTopic(topics, "   ")).toBe(topics);
    expect(renameTopic(topics, "t1", " ")[0]!.name).toBe("Unit 1");
    const full = Array.from({ length: MAX_TOPICS }, (_, i) => ({ id: `t${i + 1}`, name: `T${i}`, done: false }));
    expect(addTopic(full, "one more")).toBe(full);
    expect(cleanTopicName("x".repeat(200))).toHaveLength(80);
  });

  it("keeps an emptied list empty instead of bringing the units back", () => {
    const state = withTopics(defaultPrepState(), "scsa5101", []);
    expect(topicsFor(state, "SCSA5101")).toEqual([]);
    expect(topicProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("survives a reload through JSON", () => {
    const state = withTopics(defaultPrepState(), "SCSA5101", setTopicDone(addTopic(defaultTopics(), "Subnetting"), "t6", true));
    const back = parsePrepState(JSON.stringify(state));
    expect(back).toEqual(state);
    expect(topicProgress(topicsFor(back, "SCSA5101")).done).toBe(1);
  });

  it("reads stored state defensively", () => {
    expect(parsePrepState(null)).toEqual(defaultPrepState());
    expect(parsePrepState("not json")).toEqual(defaultPrepState());
    expect(parsePrepState("[1,2]")).toEqual(defaultPrepState());
    expect(parsePrepState(JSON.stringify({ v: 2, subjects: { SCSA5101: [] } }))).toEqual(defaultPrepState());
    const messy = parsePrepState(
      JSON.stringify({
        v: 1,
        subjects: {
          SCSA5101: [
            { id: "t1", name: "Unit 1", done: true },
            { id: "t1", name: "Duplicate id", done: false },
            { id: "bad id", name: "Bad id", done: false },
            { id: "t3", name: "   ", done: false },
            { id: "t4", name: 42 },
            null,
            { id: "t9", name: "Kept", done: "yes" },
          ],
          "not a code!": [{ id: "t1", name: "x", done: false }],
          SMAT5101: "nope",
        },
      }),
    );
    expect(messy.subjects).toEqual({
      SCSA5101: [
        { id: "t1", name: "Unit 1", done: true },
        { id: "t9", name: "Kept", done: false },
      ],
    });
  });
});

describe("what the exam needs", () => {
  it("matches the planner's own pipeline for any saved state", () => {
    const states = [
      "",
      saved(),
      saved({ settings: { ...defaultState().settings, targetGrade: "B++" } }),
      saved({ subjects: { SCSA5101: { target: "A++", cae1: "20" } } }),
      saved({ settings: { ...defaultState().settings, goal: { kind: "gpa", value: "8" } } }),
      saved({ settings: { ...defaultState().settings, goal: { kind: "cgpa", value: "8.4" } }, previous: { cgpa: "", credits: "" } }),
    ];
    const previous = { cgpa: "8.10", credits: "90" };
    for (const json of states) {
      const expected = resolveGoal(withPreviousFallback(withPresetScale(parseState(json), null), previous), subjects);
      expect(resolvePlanner(json, subjects, null, previous)).toEqual(expected);
    }
  });

  it("says a theory paper's marks out of 100 and after conversion", () => {
    const plan = planFor(resolvePlanner("", subjects), "scsa5101")!;
    const need = needFor(plan);
    // internal 31, so A+ (80) needs 49 of 50: 98 on the paper
    expect(need).toEqual({ kind: "need", paper: 98, paperMax: 100, converted: { marks: 49, max: 50 }, target: "A+", passOnly: false });
    expect(needSentence(need)).toBe("98/100 in the exam (49/50 after conversion) for A+.");
    expect(needShort(need)).toBe("98/100 for A+");
  });

  it("keeps other exams on their own scale", () => {
    const plan = planFor(resolvePlanner("", subjects), "SCSA5106")!;
    const need = needFor(plan);
    expect(need).toMatchObject({ kind: "need", paperMax: 25, converted: null });
    expect(needSentence(need)).toBe(`${plan.needed}/25 in the exam for A+.`);
  });

  it("says when the target is out of reach, with the best grade", () => {
    const need = needFor(planFor(resolvePlanner("", subjects), "SCSA5102")!);
    // internal (10 + 10) x 0.3 + 20 = 26, so a full exam reaches 76: B++
    expect(need).toEqual({ kind: "out-of-reach", target: "A+", best: "B++" });
    expect(needSentence(need)).toBe("A+ is out of reach. The best you can get is B++.");
    expect(needShort(need)).toBe("A+ out of reach");
  });

  it("follows a per-subject target and notes the pass mark", () => {
    const json = saved({ subjects: { SCSA5101: { target: "C", cae1: "50", cae2: "50" } } });
    const need = needFor(planFor(resolvePlanner(json, subjects), "SCSA5101")!);
    expect(need).toMatchObject({ kind: "need", paper: 30, converted: { marks: 15, max: 50 }, target: "C", passOnly: true });
    expect(needSentence(need)).toBe("30/100 in the exam (15/50 after conversion) for C, just the pass mark.");
  });

  it("has no number for a subject without an exam", () => {
    const audit: PlannerSubject = { code: "SISB4151", title: "EVS", cae1: 40, cae2: 40, course: { ...theory, credits: 0, externalMax: 0, maxTotal: 50, audit: true } };
    expect(needFor(planFor(resolvePlanner("", [audit]), "SISB4151")!)).toEqual({ kind: "no-exam" });
  });

  it("explains a GPA goal in one line", () => {
    expect(goalNote(resolvePlanner("", subjects))).toBeNull();
    const reachable = resolvePlanner(saved({ settings: { ...defaultState().settings, goal: { kind: "gpa", value: "6" } } }), subjects);
    expect(goalNote(reachable)).toBe(`${reachable.number!.grade} in every subject reaches your semester GPA goal of 6.`);
    const tooHigh = resolvePlanner(saved({ settings: { ...defaultState().settings, goal: { kind: "gpa", value: "9.9" } } }), subjects);
    expect(goalNote(tooHigh)).toBe("Your semester GPA goal of 9.9 is out of reach, so this is for the best grade.");
  });
});

describe("next exam", () => {
  const erp = [
    { code: "SCSA5102", title: "Operating Systems" },
    { code: "SCSB2401", title: "Operating Systems Lab" },
    { code: "SCSA5101", title: "Computer Networks" },
  ];
  const now = new Date("2026-10-11T09:00:00+05:30");
  const exam = (id: string, title: string, date: string, courseName?: string): CalendarEvent => ({
    id,
    title,
    date,
    source: "lms",
    type: "exam",
    ...(courseName ? { courseName } : {}),
  });

  it("matches by code, course name or the subject's name in the title", () => {
    expect(examSubject({ title: "SCSA5101 model exam" }, erp)?.code).toBe("SCSA5101");
    expect(examSubject({ title: "CIA-2", courseName: "Operating Systems" }, erp)?.code).toBe("SCSA5102");
    expect(examSubject({ title: "CIA-2 Examination: Operating Systems" }, erp)?.code).toBe("SCSA5102");
    // The longer name wins: this is the lab's exam, not the theory paper's.
    expect(examSubject({ title: "Operating Systems Lab practical exam" }, erp)?.code).toBe("SCSB2401");
  });

  it("says nothing rather than guess", () => {
    expect(examSubject({ title: "End semester examinations begin" }, erp)).toBeNull();
    expect(examSubject({ title: "SCSA5101 and SCSA5102 combined test" }, erp)).toBeNull();
    expect(examSubject({ title: "Networks quiz" }, erp)).toBeNull();
  });

  it("counts down to the subject's soonest upcoming exam", () => {
    const events: CalendarEvent[] = [
      exam("past", "CIA-1 Examination: Operating Systems", "2026-10-01T10:00:00+05:30"),
      exam("later", "Model exam: Operating Systems", "2026-11-20T10:00:00+05:30"),
      exam("soon", "CIA-2 Examination: Operating Systems", "2026-10-22T10:00:00+05:30"),
      exam("cn", "CIA-2 Examination: Computer Networks", "2026-10-13T10:00:00+05:30"),
      { ...exam("class", "Operating Systems lecture", "2026-10-12T10:00:00+05:30"), type: "class" },
    ];
    const next = nextExamFor(erp[0]!, erp, events, now)!;
    expect(next).toMatchObject({ id: "soon", days: 11, when: "in 11 days", label: "CIA-2 Examination", date: "2026-10-22T10:00:00+05:30" });
    expect(nextExamFor(erp[1]!, erp, events, now)).toBeNull();
  });

  it("labels an exam without the subject's name", () => {
    const os = erp[0]!;
    expect(examLabel("CIA-2 Examination: Operating Systems", os)).toBe("CIA-2 Examination");
    expect(examLabel("Operating Systems - Model exam", os)).toBe("Model exam");
    expect(examLabel("Model exam (SCSA5102)", os)).toBe("Model exam");
    expect(examLabel("Operating Systems", os)).toBe("Exam");
  });
});

describe("LMS course", () => {
  it("finds the course by its display code", () => {
    const courses = [
      { id: 1, displayCode: "SCSA5103" },
      { id: 2, displayCode: null },
      { id: 3, displayCode: "scsa5101" },
    ];
    expect(courseFor("SCSA5101", courses)?.id).toBe(3);
    expect(courseFor("SMAT5101", courses)).toBeNull();
  });
});
