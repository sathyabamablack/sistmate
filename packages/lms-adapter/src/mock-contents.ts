import type {
  AssignmentDetail,
  CourseContents,
  CourseFile,
  CourseModule,
  CourseSection,
  Inline,
  RichBlock,
} from "@usp/core";

/**
 * Mock course contents for the six mock courses (ids 101-106). Dates are
 * anchored on the mocks' fixed "today" (2026-10-11); the web layer shifts them
 * so the demo always looks current. Assignment ids match mock.ts.
 */

const HOST = "https://lms.sathyabama.ac.in/webservice/pluginfile.php/mock";

type Piece = string | Inline;
const inl = (c: Piece[]): Inline[] => c.map((x) => (typeof x === "string" ? { text: x } : x));
const p = (...c: Piece[]): RichBlock => ({ type: "paragraph", content: inl(c) });
const h = (text: string): RichBlock => ({ type: "heading", level: 3, content: [{ text, bold: true }] });
const ul = (...items: Piece[][]): RichBlock => ({ type: "list", ordered: false, items: items.map(inl) });
const ol = (...items: Piece[][]): RichBlock => ({ type: "list", ordered: true, items: items.map(inl) });
const code = (text: string): RichBlock => ({ type: "code", text });
const b = (text: string): Inline => ({ text, bold: true });
const mono = (text: string): Inline => ({ text, code: true });

const PDF = "application/pdf";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ZIP = "application/zip";
const TXT = "text/plain";

let fileSeq = 0;
const file = (name: string, mimeType: string, size: number, modified: string): CourseFile => ({
  name,
  mimeType,
  size,
  modified,
  url: `${HOST}/${++fileSeq}/${encodeURIComponent(name)}`,
});

let cm = 8000;
type Base = { name: string; description?: RichBlock[]; completed?: boolean | null; dates?: CourseModule["dates"] };
const base = (x: Base) => ({
  id: ++cm,
  name: x.name,
  description: x.description ?? [],
  completed: x.completed ?? null,
  dates: x.dates ?? [],
});

const resource = (x: Base & { files: CourseFile[] }): CourseModule => ({ ...base(x), kind: "resource", files: x.files });
const folder = (x: Base & { files: CourseFile[] }): CourseModule => ({ ...base(x), kind: "folder", files: x.files });
const page = (x: Base & { content: RichBlock[] }): CourseModule => ({ ...base(x), kind: "page", content: x.content });
const label = (description: RichBlock[]): CourseModule => ({ ...base({ name: "Text", description }), kind: "label" });
const url = (x: Base & { href: string }): CourseModule => ({ ...base(x), kind: "url", href: x.href });
const forum = (x: Base): CourseModule => ({ ...base(x), kind: "forum" });
const quiz = (
  x: Base & { openDate: string | null; closeDate: string | null; timeLimitMinutes: number | null; attempts: number | null; maxGrade: number },
): CourseModule => ({
  ...base(x),
  kind: "quiz",
  openDate: x.openDate,
  closeDate: x.closeDate,
  timeLimitMinutes: x.timeLimitMinutes,
  attempts: x.attempts,
  maxGrade: x.maxGrade,
});

function assign(
  courseId: number,
  cmid: number,
  assignId: number,
  x: Partial<AssignmentDetail> & Pick<AssignmentDetail, "name" | "intro">,
  completed: boolean | null = null,
): CourseModule {
  const detail: AssignmentDetail = {
    id: cmid,
    assignId,
    courseId,
    attachments: [],
    openDate: null,
    dueDate: null,
    cutoffDate: null,
    extended: false,
    maxGrade: null,
    submission: "none",
    submittedAt: null,
    submittedFiles: [],
    submittedText: [],
    grade: null,
    gradedAt: null,
    feedback: [],
    locked: false,
    ...x,
  };
  return { id: cmid, name: detail.name, description: [], completed, dates: [], kind: "assign", assignment: detail };
}

let secSeq = 0;
const section = (number: number, name: string, modules: CourseModule[], summary: RichBlock[] = []): CourseSection => ({
  id: 900 + ++secSeq,
  number,
  name,
  summary,
  modules,
});

function buildDaa(): CourseContents {
  return {
    courseId: 101,
    grade: { display: "34.5 / 50", percentage: "69 %" },
    sections: [
      section(0, "Course information", [
        page({
          name: "Course outline and evaluation scheme",
          completed: true,
          content: [
            p("Design and Analysis of Algorithms is a 4-credit theory course with an integrated laboratory. Attendance below 75% makes you ineligible for the end-semester examination."),
            h("Evaluation"),
            ul(
              [b("CIA-1 and CIA-2: "), "20 marks each, written examination"],
              [b("Laboratory: "), "30 marks, continuous evaluation through the weekly lab assignments"],
              [b("End-semester examination: "), "50 marks"],
            ),
            h("Reference books"),
            ol(
              ["Cormen, Leiserson, Rivest and Stein, ", { text: "Introduction to Algorithms", italic: true }, ", 4th edition"],
              ["Levitin, ", { text: "Introduction to the Design and Analysis of Algorithms", italic: true }, ", 3rd edition"],
            ),
            p("Questions about the syllabus can be raised on the announcements forum or sent to ", { text: "daa.coordinator@sathyabama.ac.in", href: "mailto:daa.coordinator@sathyabama.ac.in" }, "."),
          ],
        }),
        resource({
          name: "Syllabus and lesson plan",
          completed: true,
          files: [file("SCSA5105 Syllabus and Lesson Plan.pdf", PDF, 412_800, "2026-07-14T10:20:00+05:30")],
        }),
        forum({ name: "Announcements" }),
      ]),
      section(
        1,
        "Unit 1: Algorithm analysis",
        [
          resource({
            name: "Asymptotic notations",
            completed: true,
            files: [file("Unit 1 - Asymptotic Notations.pdf", PDF, 1_940_000, "2026-07-21T09:05:00+05:30")],
          }),
          resource({
            name: "Recurrence relations: worked examples",
            completed: true,
            files: [file("Unit 1 - Recurrences Worked Examples.pdf", PDF, 880_200, "2026-07-28T18:40:00+05:30")],
          }),
          url({
            name: "Visualgo: sorting algorithm animations",
            completed: true,
            href: "https://visualgo.net/en/sorting",
          }),
        ],
        [p("Growth of functions, recurrences and the master theorem.")],
      ),
      section(2, "Unit 2: Divide and conquer", [
        resource({
          name: "Merge sort, quick sort and the selection problem",
          completed: true,
          files: [
            file("Unit 2 - Divide and Conquer.pptx", PPTX, 3_204_100, "2026-08-18T11:00:00+05:30"),
            file("Unit 2 - Practice Problems.pdf", PDF, 502_300, "2026-08-18T11:02:00+05:30"),
          ],
        }),
        assign(
          101,
          5007,
          307,
          {
            name: "Lab 3: Greedy Algorithms",
            intro: [p("Implement Huffman coding and fractional knapsack. Submit one source file per problem along with the sample runs.")],
            openDate: "2026-09-10T00:00:00+05:30",
            dueDate: "2026-10-01T23:59:00+05:30",
            maxGrade: 10,
            submission: "submitted",
            submittedAt: "2026-09-30T21:14:00+05:30",
            submittedFiles: [
              file("huffman.cpp", TXT, 3_410, "2026-09-30T21:12:00+05:30"),
              file("knapsack.cpp", TXT, 2_180, "2026-09-30T21:13:00+05:30"),
            ],
            grade: { display: "9 / 10", value: 9, max: 10 },
            gradedAt: "2026-10-05T16:30:00+05:30",
            feedback: [p("Clean implementations. Add the time complexity of your heap operations to the report next time.")],
          },
          true,
        ),
      ]),
      section(3, "Unit 3: Dynamic programming", [
        resource({
          name: "Dynamic programming: principles and memoisation",
          completed: true,
          files: [file("Unit 3 - Dynamic Programming.pdf", PDF, 2_731_000, "2026-09-22T10:10:00+05:30")],
        }),
        page({
          name: "Matrix chain multiplication: recurrence and table fill order",
          dates: [{ label: "Opened", date: "2026-10-06T09:00:00+05:30" }],
          content: [
            p("For matrices ", mono("A1 ... An"), " with dimensions ", mono("p0 x p1, p1 x p2, ..."), " let ", mono("m[i][j]"), " be the minimum number of scalar multiplications needed for ", mono("Ai ... Aj"), "."),
            code("m[i][i] = 0\nm[i][j] = min over i <= k < j of  m[i][k] + m[k+1][j] + p[i-1] * p[k] * p[j]"),
            p("Fill the table by increasing chain length, not by row. Work through the 4-matrix example in the lecture slides before attempting the lab."),
          ],
        }),
        assign(101, 5001, 301, {
          name: "Lab 4: Dynamic Programming - Matrix Chain & LCS",
          intro: [
            p("Implement matrix-chain multiplication and longest common subsequence using bottom-up dynamic programming."),
            h("What to submit"),
            ol(
              ["Source code for both problems (one file each)"],
              ["A one-page report with the recurrence, the table for the sample input and the time complexity"],
            ),
            p("Late submissions are accepted for 3 days with a 10% penalty per day."),
          ],
          attachments: [file("Lab 4 - Problem Statement.pdf", PDF, 218_400, "2026-10-06T09:00:00+05:30")],
          openDate: "2026-10-06T09:00:00+05:30",
          dueDate: "2026-10-15T23:59:00+05:30",
          cutoffDate: "2026-10-18T23:59:00+05:30",
          maxGrade: 20,
        }),
        quiz({
          name: "Quiz 2: Dynamic programming",
          description: [p("Ten multiple-choice questions on recurrences and table construction.")],
          openDate: "2026-10-12T09:00:00+05:30",
          closeDate: "2026-10-14T21:00:00+05:30",
          timeLimitMinutes: 20,
          attempts: 1,
          maxGrade: 10,
        }),
      ]),
      section(4, "Unit 4: Graph algorithms", [
        label([p({ text: "Slides for this unit will be posted by 20 October.", italic: true })]),
        folder({
          name: "Previous year question papers",
          dates: [{ label: "Added", date: "2026-08-02T12:00:00+05:30" }],
          files: [
            file("CIA-2 2024.pdf", PDF, 301_200, "2026-08-02T12:00:00+05:30"),
            file("CIA-2 2025.pdf", PDF, 322_800, "2026-08-02T12:00:00+05:30"),
            file("End semester 2025.pdf", PDF, 410_000, "2026-08-02T12:00:00+05:30"),
          ],
        }),
      ]),
    ],
  };
}

function buildDbms(): CourseContents {
  return {
    courseId: 102,
    grade: { display: "38 / 40", percentage: "95 %" },
    sections: [
      section(0, "Course information", [
        resource({
          name: "Syllabus",
          completed: true,
          files: [file("SCSA5103 Syllabus.pdf", PDF, 360_100, "2026-07-14T10:20:00+05:30")],
        }),
        url({
          name: "PostgreSQL documentation",
          href: "https://www.postgresql.org/docs/current/",
          dates: [{ label: "Added", date: "2026-07-15T10:00:00+05:30" }],
        }),
        forum({ name: "Announcements" }),
      ]),
      section(1, "Relational design and normalisation", [
        resource({
          name: "Functional dependencies and normal forms",
          completed: true,
          files: [file("Unit 3 - Normalization.pdf", PDF, 2_104_000, "2026-09-15T10:00:00+05:30")],
        }),
        assign(
          102,
          5002,
          302,
          {
            name: "Assignment 3: Normalization to BCNF",
            intro: [
              p("Decompose the given relation schemas into BCNF. For each step, show the functional dependency that violates BCNF and whether the decomposition is lossless and dependency preserving."),
            ],
            attachments: [file("Assignment 3 - Relations.pdf", PDF, 144_200, "2026-09-30T09:00:00+05:30")],
            openDate: "2026-09-30T09:00:00+05:30",
            dueDate: "2026-10-09T23:59:00+05:30",
            maxGrade: 20,
            submission: "submitted",
            submittedAt: "2026-10-08T22:41:00+05:30",
            submittedFiles: [file("Assignment3_BCNF_4211.pdf", PDF, 733_900, "2026-10-08T22:40:00+05:30")],
            grade: { display: "18 / 20", value: 18, max: 20 },
            gradedAt: "2026-10-10T18:40:00+05:30",
            feedback: [
              p("Good decomposition. Show the closure computation for R3."),
              p("Question 4 loses the dependency ", mono("C -> D"), "; mark it as a non-preserving decomposition."),
            ],
          },
          true,
        ),
      ]),
      section(2, "Transactions and concurrency", [
        resource({
          name: "ACID, schedules and serializability",
          files: [file("Unit 4 - Transactions.pdf", PDF, 1_880_000, "2026-10-01T09:30:00+05:30")],
        }),
        quiz({
          name: "Quiz 1: Normalization",
          openDate: "2026-09-25T09:00:00+05:30",
          closeDate: "2026-09-27T21:00:00+05:30",
          timeLimitMinutes: 15,
          attempts: 2,
          maxGrade: 10,
        }),
      ]),
      section(3, "Mini project", [
        assign(102, 5006, 306, {
          name: "Mini Project: Library Management Schema + Queries",
          intro: [
            p("Design a normalised schema for a college library, load sample data and write the queries listed in the brief. Work in teams of two; only one member submits."),
            ul(
              ["ER diagram and relational schema (3NF or better)"],
              ["DDL and sample data as a single ", mono(".sql"), " file"],
              ["Fifteen queries, including at least three joins across three tables and two aggregations"],
            ),
          ],
          attachments: [file("Mini Project Brief.docx", DOCX, 96_500, "2026-10-10T09:00:00+05:30")],
          openDate: "2026-10-20T09:00:00+05:30",
          dueDate: "2026-11-05T23:59:00+05:30",
          maxGrade: 50,
        }),
      ]),
    ],
  };
}

function buildOs(): CourseContents {
  return {
    courseId: 103,
    grade: null,
    sections: [
      section(0, "Course information", [
        resource({
          name: "Syllabus",
          files: [file("SCSA5102 Syllabus.pdf", PDF, 355_000, "2026-07-14T10:20:00+05:30")],
        }),
        forum({ name: "Announcements" }),
      ]),
      section(1, "CPU scheduling", [
        resource({
          name: "Scheduling algorithms",
          completed: true,
          files: [
            file("Unit 2 - CPU Scheduling.pdf", PDF, 2_450_000, "2026-09-12T10:00:00+05:30"),
            file("Gantt chart practice.pdf", PDF, 180_900, "2026-09-12T10:05:00+05:30"),
          ],
        }),
        assign(103, 5003, 303, {
          name: "Lab 3: CPU Scheduling Simulator",
          intro: [
            p("Build a simulator for FCFS, SJF (non-preemptive), Round Robin and Priority scheduling. Print the Gantt chart and report the average waiting and turnaround times for the process set in the attached file."),
            p("Submit the source file and a screenshot of the output for the sample input."),
          ],
          attachments: [file("processes.txt", TXT, 420, "2026-09-26T09:00:00+05:30")],
          openDate: "2026-09-26T09:00:00+05:30",
          dueDate: "2026-10-04T23:59:00+05:30",
          maxGrade: 25,
        }),
      ]),
      section(2, "Synchronisation and deadlocks", [
        resource({
          name: "Semaphores, monitors and classic problems",
          files: [file("Unit 3 - Synchronization.pdf", PDF, 2_990_000, "2026-10-03T10:00:00+05:30")],
        }),
        quiz({
          name: "CIA-2 practice quiz",
          description: [p("Covers units 2 and 3. Not graded; attempt it as often as you like.")],
          openDate: "2026-10-08T09:00:00+05:30",
          closeDate: "2026-10-21T23:59:00+05:30",
          timeLimitMinutes: 30,
          attempts: null,
          maxGrade: 20,
        }),
        quiz({
          name: "CIA-2 examination",
          openDate: "2026-10-22T10:00:00+05:30",
          closeDate: "2026-10-22T11:30:00+05:30",
          timeLimitMinutes: 90,
          attempts: 1,
          maxGrade: 20,
        }),
      ]),
    ],
  };
}

function buildCn(): CourseContents {
  return {
    courseId: 104,
    grade: { display: "21 / 30", percentage: "70 %" },
    sections: [
      section(0, "Course information", [
        forum({ name: "Announcements" }),
        resource({
          name: "Syllabus",
          completed: true,
          files: [file("SCSA5101 Syllabus.pdf", PDF, 349_000, "2026-07-14T10:20:00+05:30")],
        }),
      ]),
      section(6, "Week 6: Network layer", [
        resource({
          name: "IP addressing, subnetting and VLSM",
          completed: true,
          files: [file("Week 6 - Network Layer.pdf", PDF, 3_100_000, "2026-09-29T10:00:00+05:30")],
        }),
        assign(
          104,
          5004,
          304,
          {
            name: "Assignment 2: Subnetting & VLSM Worksheet",
            intro: [p("Complete the worksheet. Show the subnet mask, network address, broadcast address and usable host range for every subnet.")],
            attachments: [file("Subnetting Worksheet.docx", DOCX, 58_400, "2026-10-02T09:00:00+05:30")],
            openDate: "2026-10-02T09:00:00+05:30",
            dueDate: "2026-10-20T23:59:00+05:30",
            maxGrade: 15,
            submission: "submitted",
            submittedAt: "2026-10-09T20:05:00+05:30",
            submittedFiles: [file("Subnetting Worksheet - completed.docx", DOCX, 71_200, "2026-10-09T20:04:00+05:30")],
          },
          true,
        ),
      ]),
      section(7, "Week 7: Transport layer", [
        resource({
          name: "TCP flow control and congestion control",
          dates: [{ label: "Opened", date: "2026-10-11T08:00:00+05:30" }],
          files: [file("Week 7 - Transport Layer.pdf", PDF, 2_660_000, "2026-10-11T08:00:00+05:30")],
        }),
        url({
          name: "Wireshark user guide",
          href: "https://www.wireshark.org/docs/wsug_html_chunked/",
        }),
        label([
          p(b("Lab session, Tuesday 13 October, 2:00 pm."), " Bring a laptop with Wireshark installed. We will capture a TCP handshake and a teardown on the lab network and annotate the segments."),
        ]),
        quiz({
          name: "Quiz 2: Subnetting",
          openDate: "2026-10-09T09:00:00+05:30",
          closeDate: "2026-10-13T21:00:00+05:30",
          timeLimitMinutes: 25,
          attempts: 2,
          maxGrade: 15,
        }),
      ]),
    ],
  };
}

function buildPqt(): CourseContents {
  return {
    courseId: 105,
    grade: null,
    sections: [
      section(0, "Course information", [
        resource({
          name: "Syllabus",
          files: [file("SMAT5101 Syllabus.pdf", PDF, 301_000, "2026-07-14T10:20:00+05:30")],
        }),
      ]),
      section(3, "Queueing models", [
        resource({
          name: "M/M/1 and M/M/c queues",
          files: [file("Unit 3 - Queueing Models.pdf", PDF, 1_720_000, "2026-10-01T09:00:00+05:30")],
        }),
        assign(105, 5005, 305, {
          name: "Problem Set 4: M/M/1 Queues & Little's Law",
          intro: [
            p("Solve the six problems. Show the steady-state equations you use and state your assumptions about arrival and service distributions."),
          ],
          openDate: "2026-10-05T09:00:00+05:30",
          dueDate: "2026-10-18T23:59:00+05:30",
          maxGrade: 20,
          submission: "draft",
          submittedAt: "2026-10-10T19:30:00+05:30",
          submittedFiles: [file("PS4 draft.pdf", PDF, 402_000, "2026-10-10T19:29:00+05:30")],
        }),
      ]),
    ],
  };
}

function buildSe(): CourseContents {
  return {
    courseId: 106,
    grade: null,
    sections: [
      section(0, "Course information", [
        forum({ name: "Announcements" }),
        resource({
          name: "Syllabus",
          files: [file("SCSA5104 Syllabus.pdf", PDF, 340_000, "2026-07-14T10:20:00+05:30")],
        }),
      ]),
      section(2, "Requirements and design", [
        resource({
          name: "SRS template",
          files: [file("SRS Template.docx", DOCX, 64_000, "2026-09-18T10:00:00+05:30")],
        }),
        folder({
          name: "Sample project reports",
          files: [file("Sample Report - Hostel Allocation.pdf", PDF, 1_240_000, "2026-09-18T10:05:00+05:30"), file("Starter repository.zip", ZIP, 5_420_000, "2026-09-18T10:06:00+05:30")],
        }),
      ]),
    ],
  };
}

const BUILDERS: Record<number, () => CourseContents> = {
  101: buildDaa,
  102: buildDbms,
  103: buildOs,
  104: buildCn,
  105: buildPqt,
  106: buildSe,
};

export function mockCourseContents(courseId: number): CourseContents | null {
  fileSeq = courseId * 100;
  cm = courseId * 100;
  return BUILDERS[courseId]?.() ?? null;
}

function minimalPdf(title: string): Uint8Array {
  const text = title.replace(/[^\x20-\x7e]/g, "?").replace(/([\\()])/g, "\\$1").slice(0, 80);
  const stream = `BT /F1 20 Tf 72 720 Td (${text}) Tj ET\nBT /F1 11 Tf 72 690 Td (Sample file generated by the demo data source.) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/** Placeholder bytes for a mock file, so downloads work in demo mode. */
export function mockFileBytes(f: Pick<CourseFile, "name" | "mimeType">): Uint8Array {
  if (f.mimeType === "application/pdf") return minimalPdf(f.name.replace(/\.pdf$/i, ""));
  return new TextEncoder().encode(`${f.name}\n\nSample file generated by the demo data source.\n`);
}
