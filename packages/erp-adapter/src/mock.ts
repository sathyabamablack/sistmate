import {
  addDays,
  buildDailyAttendance,
  campusNow,
  dateRange,
  monthEnd,
  weekdayOf,
} from "@usp/core";
import { clampRange } from "./attendance-days";
import type {
  DailyAttendance,
  HourlyDay,
  ErpAdapter,
  Credentials,
  AuthResult,
  StudentProfile,
  AttendanceSubject,
  SubjectMarks,
  SemesterResult,
  TimetableSlot,
  FeeRecord,
  Notification,
  ExamResult,
} from "@usp/core";

/**
 * Mock Sathyabama ERP adapter.
 *
 * Serves hand-crafted sample data that is internally consistent: the same
 * course codes thread through attendance, marks and the timetable; past results
 * are marks-only like the live ERP (real Regulations 2023 B.E. CSE course codes,
 * so the app grades them with the official catalog); and the attendance spans
 * safe / borderline / below-threshold so the bunk calculator has something
 * interesting to show. No network, no real credentials.
 */

/* --------------------------- semester 5 courses --------------------------- */
/** Single source of truth for the current (sem 5) B.E. CSE courses. */
const SEM5_COURSES = [
  { code: "SCSA5101", title: "Computer Networks", faculty: "Dr. R. Priya" },
  { code: "SCSA5102", title: "Operating Systems", faculty: "Dr. S. Karthik" },
  { code: "SCSA5103", title: "Database Management Systems", faculty: "Dr. M. Lavanya" },
  { code: "SCSA5104", title: "Software Engineering", faculty: "Mrs. K. Deepa" },
  { code: "SMAT5101", title: "Probability and Queueing Theory", faculty: "Dr. V. Anand" },
  { code: "SCSA5105", title: "Design and Analysis of Algorithms", faculty: "Dr. P. Suresh" },
  { code: "SCSA5106", title: "Web Technology Laboratory", faculty: "Mr. A. Bhaskar" },
] as const;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/* -------------------------------- profile -------------------------------- */
const PROFILE: StudentProfile = {
  registerNumber: "41110234",
  name: "Arjun Ramkumar",
  program: "B.E. Computer Science and Engineering",
  department: "Computer Science and Engineering",
  semester: 5,
  section: "B",
  batch: "2024-2028",
  email: "arjun.ramkumar2024@sathyabama.ac.in",
  phone: "+91 98840 11234",
  advisor: "Dr. S. Karthik",
};

/* ------------------------------ attendance ------------------------------- */
/** attended / total chosen to span safe (>=85), borderline (80-85) and below 80. */
const ATTENDANCE_RAW: Array<{ code: string; attended: number; total: number }> = [
  { code: "SCSA5101", attended: 42, total: 48 }, // 87.50 - safe
  { code: "SCSA5102", attended: 40, total: 46 }, // 86.96 - safe
  { code: "SCSA5103", attended: 41, total: 50 }, // 82.00 - borderline
  { code: "SCSA5104", attended: 38, total: 46 }, // 82.61 - borderline
  { code: "SMAT5101", attended: 36, total: 45 }, // 80.00 - exactly at threshold
  { code: "SCSA5105", attended: 30, total: 48 }, // 62.50 - below threshold
  { code: "SCSA5106", attended: 22, total: 24 }, // 91.67 - safe (lab)
];

const ATTENDANCE: AttendanceSubject[] = ATTENDANCE_RAW.map((a) => {
  const course = SEM5_COURSES.find((c) => c.code === a.code)!;
  return {
    code: a.code,
    title: course.title,
    totalClasses: a.total,
    attended: a.attended,
    percentage: round2((a.attended / a.total) * 100),
  };
});

/* --------------------------------- marks --------------------------------- */
/**
 * Internal assessment: CIA-1 (/20), CIA-2 (/20), Assignment (/10), Model (/100).
 * `scored: null` = not yet graded. Model Exam is pending for most subjects this
 * early in the semester. `total`/`maxTotal` aggregate only the graded parts.
 */
const MARKS_RAW: Record<
  string,
  { cia1: number | null; cia2: number | null; assignment: number | null; model: number | null }
> = {
  SCSA5101: { cia1: 17, cia2: 18, assignment: 9, model: null },
  SCSA5102: { cia1: 15, cia2: 16, assignment: 8, model: null },
  SCSA5103: { cia1: 18, cia2: 19, assignment: 10, model: 88 },
  SCSA5104: { cia1: 14, cia2: null, assignment: 7, model: null },
  SMAT5101: { cia1: 12, cia2: 13, assignment: null, model: null },
  SCSA5105: { cia1: 16, cia2: 15, assignment: 9, model: null },
  SCSA5106: { cia1: 19, cia2: 18, assignment: null, model: null },
};

const MARKS: SubjectMarks[] = SEM5_COURSES.map((course) => {
  const m = MARKS_RAW[course.code]!;
  const components = [
    { name: "CIA-1", max: 20, scored: m.cia1 },
    { name: "CIA-2", max: 20, scored: m.cia2 },
    { name: "Assignment", max: 10, scored: m.assignment },
    { name: "Model Exam", max: 100, scored: m.model },
  ];
  const graded = components.filter((c) => c.scored !== null);
  const anyGraded = graded.length > 0;
  return {
    code: course.code,
    title: course.title,
    components,
    total: anyGraded ? graded.reduce((s, c) => s + (c.scored ?? 0), 0) : null,
    maxTotal: anyGraded ? graded.reduce((s, c) => s + c.max, 0) : null,
  };
});

/* -------------------------------- results -------------------------------- */
/**
 * Past semesters as the live ERP publishes them: internal, external, total and
 * Pass/Fail, with no grades, credits or GPA (the app estimates those). Codes are
 * real Regulations 2023 B.E. CSE codes (batch 2024), so the official catalog gives
 * their credits: one-credit labs are out of 50 (25 + 25), everything else out of
 * 100 (50 + 50). Physics fails in semester 2 (12 of 50 in the exam) and is cleared
 * in semester 3, so the Results page shows a Reappear row but no standing arrear.
 */
type MarkRow = {
  code: string;
  title: string;
  internal: number;
  external: number | null;
  /** Course maximum; 50 for one-credit labs and the audit course. */
  max?: number;
  /** End-semester maximum; 0 for the audit course (no exam). */
  externalMax?: number;
};

const SEMESTER_MARKS: Record<number, MarkRow[]> = {
  1: [
    { code: "SHSB1101", title: "Technical English", internal: 42, external: 38 },
    { code: "SMTB1101", title: "Matrices and Calculus", internal: 44, external: 44 },
    { code: "SCYB1101", title: "Chemistry", internal: 36, external: 31 },
    { code: "SEEB1101", title: "Electrical and Electronics Engineering", internal: 40, external: 35 },
    { code: "S11BLH11", title: "Programming in C", internal: 47, external: 45 },
    { code: "SCYB2101", title: "Chemistry Lab", internal: 22, external: 20, max: 50 },
    {
      code: "SISB4151",
      title: "Environmental Science and Engineering (Mandatory)",
      internal: 41,
      external: null,
      max: 50,
      externalMax: 0,
    },
  ],
  2: [
    { code: "SMTB1201", title: "Advanced Calculus and Statistics", internal: 38, external: 34 },
    { code: "SPHB1101", title: "Physics", internal: 28, external: 12 },
    { code: "SPHB2101", title: "Physics Lab", internal: 21, external: 19, max: 50 },
    { code: "SCSB1202", title: "Data Structures", internal: 43, external: 42 },
    { code: "SCSB2201", title: "Data Structures Lab", internal: 46, external: 45 },
    { code: "S11BLH21", title: "Programming in Python", internal: 45, external: 40 },
    { code: "SMEB2102", title: "Engineering Drawing and Design", internal: 39, external: 33 },
  ],
  3: [
    { code: "SMTB1302", title: "Discrete Mathematics and Numerical Methods", internal: 41, external: 37 },
    { code: "SCSB1303", title: "Theory of Computation", internal: 44, external: 40 },
    { code: "SCSB1301", title: "Computer Architecture and Organization", internal: 40, external: 36 },
    { code: "SISB4301", title: "Universal Human Values", internal: 46, external: 47 },
    { code: "S13BLH21", title: "Digital Logic Circuits", internal: 42, external: 38 },
    { code: "S12BLH31", title: "Programming in Java", internal: 45, external: 43 },
    // Arrear exam: the semester-2 internal marks carry over.
    { code: "SPHB1101", title: "Physics", internal: 28, external: 27 },
  ],
  4: [
    { code: "SMTB1402", title: "Probability and Statistics", internal: 39, external: 36 },
    { code: "SCSB1401", title: "Operating Systems and Unix", internal: 43, external: 41 },
    { code: "SCSB2401", title: "Operating Systems Lab", internal: 47, external: 44 },
    { code: "S11BLH41", title: "Database Management Systems", internal: 44, external: 42 },
    { code: "SCSBDPROJ", title: "Design Thinking and Innovations", internal: 45, external: 40 },
  ],
};

/** The ERP's Pass/Fail: 50% of the total and 30% of the end-semester maximum. */
function markResult(row: MarkRow): ExamResult {
  const max = row.max ?? 100;
  const externalMax = row.externalMax ?? max / 2;
  const total = row.internal + (row.external ?? 0);
  const passed =
    total * 2 >= max && (externalMax === 0 || (row.external ?? 0) * 10 >= externalMax * 3);
  return {
    code: row.code,
    title: row.title,
    internal: row.internal,
    external: row.external,
    total,
    passed,
  };
}

const RESULTS: SemesterResult[] = Object.entries(SEMESTER_MARKS).map(([sem, rows]) => ({
  semester: Number(sem),
  gpa: null,
  credits: null,
  results: rows.map(markResult),
}));

/* ------------------------------- timetable ------------------------------- */
/** 50-minute periods; 0=Mon ... 5=Sat. Lab blocks occupy two consecutive periods. */
const PERIODS: Array<{ start: string; end: string }> = [
  { start: "09:00", end: "09:50" },
  { start: "09:50", end: "10:40" },
  { start: "11:00", end: "11:50" }, // after short break
  { start: "11:50", end: "12:40" },
  { start: "13:30", end: "14:20" }, // after lunch
  { start: "14:20", end: "15:10" },
  { start: "15:10", end: "16:00" },
];

const ROOMS: Record<string, string> = {
  SCSA5101: "Block-II / Room 204",
  SCSA5102: "Block-II / Room 204",
  SCSA5103: "Block-II / Room 206",
  SCSA5104: "Block-II / Room 204",
  SMAT5101: "Block-I / Room 118",
  SCSA5105: "Block-II / Room 206",
  SCSA5106: "CSE Lab-3",
};

/** day -> course code per period index (null = free/library). */
const WEEK: Array<Array<string | null>> = [
  // Monday
  ["SCSA5101", "SCSA5102", "SCSA5103", "SMAT5101", "SCSA5105", "SCSA5104", null],
  // Tuesday
  ["SCSA5106", "SCSA5106", "SCSA5101", "SCSA5102", "SMAT5101", "SCSA5103", "SCSA5104"],
  // Wednesday
  ["SMAT5101", "SCSA5105", "SCSA5104", "SCSA5101", "SCSA5102", "SCSA5103", null],
  // Thursday
  ["SCSA5103", "SCSA5104", "SCSA5105", "SMAT5101", "SCSA5106", "SCSA5106", null],
  // Friday
  ["SCSA5102", "SCSA5101", "SMAT5101", "SCSA5105", "SCSA5104", "SCSA5103", null],
  // Saturday (half day)
  ["SCSA5105", "SCSA5101", "SCSA5103", null, null, null, null],
];

const TIMETABLE: TimetableSlot[] = WEEK.flatMap((day, dayIdx) =>
  day.flatMap((code, periodIdx) => {
    if (!code) return [];
    const course = SEM5_COURSES.find((c) => c.code === code)!;
    const period = PERIODS[periodIdx]!;
    return [
      {
        day: dayIdx,
        startTime: period.start,
        endTime: period.end,
        courseCode: course.code,
        courseTitle: course.title,
        room: ROOMS[course.code],
        faculty: course.faculty,
      },
    ];
  }),
);

/* --------------------------------- fees ---------------------------------- */
const FEES: FeeRecord[] = [
  {
    description: "Tuition & Lab Fee - Semester 5 (2026-27 Odd)",
    amount: 92500,
    paid: true,
    paidDate: "2026-07-18",
    receiptNo: "SU/FEE/2026/0045128",
  },
  {
    description: "Hostel & Mess Fee - Semester 6 (2026-27 Even)",
    amount: 68000,
    dueDate: "2026-12-15",
    paid: false,
  },
];

/* ----------------------------- notifications ----------------------------- */
const NOTIFICATIONS: Notification[] = [
  {
    id: "erp-2026-1009-exam",
    title: "CIA-II Timetable Released - Sem 5",
    body: "The CIA-II internal examination schedule for all V semester B.E./B.Tech programmes is now published. Exams commence 20-Oct-2026.",
    date: "2026-10-09T10:30:00+05:30",
    source: "erp",
    url: "https://erp.sathyabama.ac.in/notifications/cia2-sem5",
    read: false,
  },
  {
    id: "erp-2026-1007-fee",
    title: "Reminder: Semester 6 Fee Payment",
    body: "Hostel & mess fee for the forthcoming even semester is due by 15-Dec-2025. Pay online via the ERP Fees module to avoid late charges.",
    date: "2026-10-07T09:00:00+05:30",
    source: "erp",
    url: "https://erp.sathyabama.ac.in/fees",
    read: false,
  },
  {
    id: "erp-2026-1005-event",
    title: "TECHNOVIT'26 - National Technical Symposium",
    body: "Registrations open for TECHNOVIT'26 hosted by the School of Computing. Paper presentation, hackathon and project expo on 14-15 Nov 2026.",
    date: "2026-10-05T16:45:00+05:30",
    source: "erp",
    url: "https://erp.sathyabama.ac.in/events/technovit26",
    read: true,
  },
  {
    id: "erp-2026-1002-attendance",
    title: "Attendance Shortage Advisory",
    body: "Students with subject-wise attendance below 75% are advised to meet their faculty advisor. Condonation applications close 31-Oct-2026.",
    date: "2026-10-02T14:20:00+05:30",
    source: "erp",
    read: false,
  },
  {
    id: "erp-2026-0928-circular",
    title: "Odd Semester End Exam Registration",
    body: "End Semester Examination registration for Nov/Dec 2026 is open on the ERP. Verify your subject list and complete registration before 18-Oct-2026.",
    date: "2026-09-28T11:15:00+05:30",
    source: "erp",
    url: "https://erp.sathyabama.ac.in/exam/registration",
    read: true,
  },
];

/* ------------------------- day-wise and hour-wise ------------------------- */
/**
 * Generated for whatever range is asked, against the real clock (these getters are
 * not date-shifted like the fixed datasets above). Monday to Saturday are class
 * days; a few fixed holidays plus the second Saturday are off; the first class day
 * on or after the 6th and the 20th of each month is an absence, and the first one
 * on or after the 14th misses its second hour.
 */
const FIXED_HOLIDAYS: Record<string, string> = {
  "01-26": "Republic Day",
  "08-15": "Independence Day",
  "10-02": "Gandhi Jayanti",
  "12-25": "Christmas",
};

/** Mock timetable day (0 = Monday) for a date; Sunday is -1. */
function timetableDay(date: string): number {
  const weekday = weekdayOf(date);
  return weekday === 0 ? -1 : weekday - 1;
}

function mockHoliday(date: string): string | null {
  const fixed = FIXED_HOLIDAYS[date.slice(5)];
  if (fixed) return fixed;
  const dom = Number(date.slice(8));
  if (weekdayOf(date) === 6 && dom >= 8 && dom <= 14) return "Second Saturday";
  return null;
}

const isClassDay = (date: string) => weekdayOf(date) !== 0 && mockHoliday(date) === null;

/** The first class day on or after day `anchor` of `date`'s month. */
function firstClassDayFrom(date: string, anchor: number): string | null {
  for (let d = `${date.slice(0, 8)}${String(anchor).padStart(2, "0")}`, i = 0; i < 7; i++, d = addDays(d, 1)) {
    if (isClassDay(d)) return d;
  }
  return null;
}

const isMockAbsent = (date: string) =>
  firstClassDayFrom(date, 6) === date || firstClassDayFrom(date, 20) === date;
const isMockPartial = (date: string) => firstClassDayFrom(date, 14) === date;

/** Hour numbers (1-based periods) on the mock timetable for a date. */
function mockHours(date: string): number[] {
  const day = WEEK[timetableDay(date)];
  return day ? day.flatMap((code, i) => (code ? [i + 1] : [])) : [];
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** First day of the month `months` months away from `date`'s month. */
function shiftMonth(date: string, months: number): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - 1 + months;
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

/**
 * The mock ERP's academic window (the semester): from the 15th of the month three
 * months back to the end of the month two months ahead. Relative to the clock, so
 * "this semester" always spans a few months and the default ranges stay inside it.
 */
export function mockAcademicWindow(today: string): { from: string; to: string } {
  return { from: `${shiftMonth(today, -3).slice(0, 8)}15`, to: monthEnd(shiftMonth(today, 2)) };
}

function mockDaily(askedFrom: string, askedTo: string, now: Date): DailyAttendance {
  const today = campusNow(now).date;
  // Like the live ERP: the range is narrowed to the academic window, which the reply names.
  const academicWindow = mockAcademicWindow(today);
  const { from, to } = clampRange({ from: askedFrom, to: askedTo }, academicWindow);
  const range = dateRange(from, to);
  const daily = buildDailyAttendance(
    {
      from,
      to,
      absentDates: range.filter((d) => d < today && isMockAbsent(d)),
      holidays: range.flatMap((d) => {
        const label = mockHoliday(d);
        return label ? [{ date: d, label }] : [];
      }),
      timeSetDays: [1, 2, 3, 4, 5, 6],
      workingDays: range.filter((d) => weekdayOf(d) !== 0),
    },
    now,
  );
  return { ...daily, academicWindow };
}

function mockHourly(from: string, to: string, now: Date): HourlyDay[] {
  const { date: today, minutes } = campusNow(now);
  const out: HourlyDay[] = [];
  for (const date of dateRange(from, to)) {
    if (date > today || !isClassDay(date)) continue;
    const hours = mockHours(date);
    if (hours.length === 0) continue;
    let presentHours = hours;
    let absentHours: number[] = [];
    let notGivenHours: number[] = [];
    if (date === today) {
      // Hours that have ended are entered, except the one that just finished.
      const ended = hours.filter((h) => minutesOf(PERIODS[h - 1]!.end) <= minutes);
      presentHours = ended.slice(0, -1);
      notGivenHours = hours.filter((h) => !presentHours.includes(h));
    } else if (isMockAbsent(date)) {
      presentHours = [];
      absentHours = hours;
    } else if (isMockPartial(date)) {
      presentHours = hours.filter((h) => h !== 2);
      absentHours = hours.filter((h) => h === 2);
    }
    out.push({
      date,
      totalHours: hours.length,
      present: presentHours.length,
      absent: absentHours.length,
      notGiven: notGivenHours.length,
      presentHours,
      absentHours,
      notGivenHours,
    });
  }
  return out;
}

/* ------------------------------- adapter --------------------------------- */
export interface MockErpOptions {
  /** The clock for day-wise and hour-wise attendance (default: the real one). */
  now?: () => Date;
}

export function createMockAdapter(opts: MockErpOptions = {}): ErpAdapter {
  const now = opts.now ?? (() => new Date());
  return {
    async authenticate(creds: Credentials): Promise<AuthResult> {
      if (creds.username.trim() && creds.password.trim()) {
        return { ok: true, session: `mock:${creds.username}` };
      }
      return { ok: false, error: "Username and password are required." };
    },
    async getProfile(): Promise<StudentProfile> {
      return PROFILE;
    },
    async getAttendance(): Promise<AttendanceSubject[]> {
      return ATTENDANCE;
    },
    async getMarks(): Promise<SubjectMarks[]> {
      return MARKS;
    },
    async getResults(): Promise<SemesterResult[]> {
      return RESULTS;
    },
    async getTimetable(): Promise<TimetableSlot[]> {
      return TIMETABLE;
    },
    async getFees(): Promise<FeeRecord[]> {
      return FEES;
    },
    async getNotifications(): Promise<Notification[]> {
      return NOTIFICATIONS;
    },
    async getDailyAttendance(from: string, to: string): Promise<DailyAttendance> {
      return mockDaily(from, to, now());
    },
    async getHourlyAttendance(from: string, to: string): Promise<HourlyDay[]> {
      return mockHourly(from, to, now());
    },
  };
}
