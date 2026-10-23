import { z } from "zod";

/**
 * Canonical data model for the Unified Student Portal.
 *
 * Every adapter (ERP, LMS) parses its source into THESE shapes, and the UI
 * reads only these. Zod schemas double as runtime validators for scraped data:
 * a parser produces a plain object, `Schema.parse(obj)` guarantees it matches
 * before it ever reaches the UI. If the college changes a page, the parse throws
 * loudly instead of silently rendering garbage.
 */

/* ============================== ERP ============================== */

export const StudentProfileSchema = z.object({
  registerNumber: z.string(),
  name: z.string(),
  program: z.string(), // e.g. "B.E. Computer Science and Engineering"
  department: z.string(),
  /** null when the profile page couldn't be read (never guessed) */
  semester: z.number().int().min(1).max(12).nullable(),
  section: z.string().optional(),
  batch: z.string().optional(), // e.g. "2023-2027"
  email: z.string().optional(),
  phone: z.string().optional(),
  photoUrl: z.string().optional(),
  advisor: z.string().optional(),
  /** standing arrears (failed papers still to clear); the live ERP reports this */
  arrears: z.number().int().min(0).optional(),
});
export type StudentProfile = z.infer<typeof StudentProfileSchema>;

export const AttendanceSubjectSchema = z.object({
  code: z.string(),
  title: z.string(),
  totalClasses: z.number().int().min(0),
  attended: z.number().int().min(0),
  /** 0..100; parsers may compute this or read it from the page. */
  percentage: z.number().min(0).max(100),
});
export type AttendanceSubject = z.infer<typeof AttendanceSubjectSchema>;

export const MarkComponentSchema = z.object({
  name: z.string(), // "CIA-1", "CIA-2", "Assignment", "Model Exam"...
  max: z.number().min(0),
  scored: z.number().min(0).nullable(), // null = not yet graded
});
export type MarkComponent = z.infer<typeof MarkComponentSchema>;

export const SubjectMarksSchema = z.object({
  code: z.string(),
  title: z.string(),
  components: z.array(MarkComponentSchema),
  total: z.number().nullable(),
  maxTotal: z.number().nullable(),
});
export type SubjectMarks = z.infer<typeof SubjectMarksSchema>;

export const ExamResultSchema = z.object({
  code: z.string(),
  title: z.string(),
  /** Grade-based portals (and the mock) provide these; the live ERP does not. */
  credits: z.number().min(0).optional(),
  grade: z.string().optional(), // "O", "A+", "A", "B+"...
  gradePoint: z.number().min(0).max(10).optional(),
  /** Marks-based portals (the live ERP) provide these instead. */
  internal: z.number().nullable().optional(),
  external: z.number().nullable().optional(),
  total: z.number().nullable().optional(),
  passed: z.boolean().optional(),
  /* The fields below are set when grades are estimated from marks (see `estimateGrades`). */
  /** Course maximum the total is out of (100, or 50 for a one-credit lab). */
  maxTotal: z.number().min(0).optional(),
  internalMax: z.number().min(0).optional(),
  externalMax: z.number().min(0).optional(),
  /** Total as a percentage of `maxTotal`, 0..100. */
  percent: z.number().min(0).max(100).optional(),
  /** official = curriculum, estimated = code-pattern guess, custom = the student's correction */
  creditSource: z.enum(["official", "estimated", "custom"]).optional(),
  /** True when the paper is in the GPA (passed, credit-bearing, not audit). */
  counted: z.boolean().optional(),
  /** Zero-credit mandatory (audit) course: PASS/FAIL, never in GPA. */
  audit: z.boolean().optional(),
});
export type ExamResult = z.infer<typeof ExamResultSchema>;
/** An ExamResult from a grade-based portal: credits and grade points are present. */
export type GradedExamResult = ExamResult & { credits: number; grade: string; gradePoint: number };

export const SemesterResultSchema = z.object({
  semester: z.number().int().min(1).max(12),
  /** null when the portal publishes marks but no grades (live ERP) */
  gpa: z.number().min(0).max(10).nullable(),
  /** total credits earned that semester (for CGPA weighting); null when unknown */
  credits: z.number().min(0).nullable(),
  results: z.array(ExamResultSchema),
  /** true when grades, credits and GPA were derived from marks rather than published */
  estimated: z.boolean().optional(),
});
export type SemesterResult = z.infer<typeof SemesterResultSchema>;

export const TimetableSlotSchema = z.object({
  day: z.number().int().min(0).max(6), // 0 = Monday ... 6 = Sunday
  startTime: z.string(), // "09:00" (24h)
  endTime: z.string(), // "09:50"
  courseCode: z.string(),
  courseTitle: z.string(),
  room: z.string().optional(),
  faculty: z.string().optional(),
});
export type TimetableSlot = z.infer<typeof TimetableSlotSchema>;

export const FeeRecordSchema = z.object({
  description: z.string(),
  amount: z.number(),
  dueDate: z.string().optional(), // ISO date
  paid: z.boolean(),
  /** finer than `paid`: the live ERP reports a status per year but no amounts */
  status: z.enum(["paid", "due", "upcoming"]).optional(),
  paidDate: z.string().optional(), // ISO date
  receiptNo: z.string().optional(),
});
export type FeeRecord = z.infer<typeof FeeRecordSchema>;

/** A campus calendar date, "YYYY-MM-DD". */
const DateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * One day of the ERP's day-wise attendance. The ERP lists absent days only; every
 * other working day counts as present once the day is over (see `buildDailyAttendance`).
 * `pending` is today before the ERP's 3 pm cut-off.
 */
export const AttendanceDaySchema = z.object({
  date: DateKeySchema,
  status: z.enum(["present", "absent", "holiday", "upcoming", "pending"]),
  /** holiday name ("Sunday", the ERP's comment) or "Not marked yet" */
  label: z.string().optional(),
});
export type AttendanceDay = z.infer<typeof AttendanceDaySchema>;
export type AttendanceDayStatus = AttendanceDay["status"];

export const DailyAttendanceSchema = z.object({
  /** working days in the window, oldest first; non-working days are left out */
  days: z.array(AttendanceDaySchema),
  summary: z.object({
    present: z.number().int().min(0),
    absent: z.number().int().min(0),
    holidays: z.number().int().min(0),
    /** present / (present + absent), 0..100; null when no day has been decided yet */
    percentage: z.number().min(0).max(100).nullable(),
  }),
  /** the date range the ERP was asked about, after clamping to its academic month */
  window: z.object({ from: DateKeySchema, to: DateKeySchema }),
  /**
   * The ERP's academic window (AcademicMonthStartDate..AcademicMonthEndDate, the
   * current semester), when its reply names one. Day-wise records exist only inside it.
   */
  academicWindow: z.object({ from: DateKeySchema, to: DateKeySchema }).optional(),
});
export type DailyAttendance = z.infer<typeof DailyAttendanceSchema>;

const HourListSchema = z.array(z.number().int().min(1)).optional();

/** Hour-wise attendance for one date. Hour lists are present only when the ERP names the hours. */
export const HourlyDaySchema = z.object({
  date: DateKeySchema,
  totalHours: z.number().int().min(0),
  present: z.number().int().min(0),
  absent: z.number().int().min(0),
  /** hours the faculty has not entered yet ("Attendance Not Given") */
  notGiven: z.number().int().min(0),
  presentHours: HourListSchema,
  absentHours: HourListSchema,
  notGivenHours: HourListSchema,
});
export type HourlyDay = z.infer<typeof HourlyDaySchema>;

/* ============================== LMS (Moodle) ============================== */

export const LmsCourseSchema = z.object({
  id: z.number(),
  shortName: z.string(),
  fullName: z.string(),
  progress: z.number().min(0).max(100).nullable(),
  category: z.string().optional(),
  url: z.string().optional(),
  /** Course total as the gradebook shows it (e.g. "69 %" or "34.5"), when Moodle reports one. */
  grade: z.string().optional(),
  /** When the student last opened the course (ISO), when Moodle reports it. */
  lastAccess: z.string().optional(),
  /** Clean subject title for display (Moodle names carry codes, batches and semesters). */
  displayName: z.string().optional(),
  /** Subject code for display, when one could be found. */
  displayCode: z.string().nullable().optional(),
});
export type LmsCourse = z.infer<typeof LmsCourseSchema>;

export const AssignmentSchema = z.object({
  id: z.number(),
  courseId: z.number(),
  courseName: z.string(),
  name: z.string(),
  dueDate: z.string().nullable(), // ISO date
  submitted: z.boolean(),
  grade: z.string().nullable(),
  url: z.string().optional(),
});
export type Assignment = z.infer<typeof AssignmentSchema>;

/* ============================== Shared ============================== */

export const NotificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string().optional(),
  date: z.string(), // ISO datetime
  source: z.enum(["erp", "lms"]),
  url: z.string().optional(),
  /** first image in the notice (posters, circulars) */
  imageUrl: z.string().optional(),
  read: z.boolean().default(false),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const CalendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string(), // ISO datetime
  source: z.enum(["erp", "lms"]),
  courseName: z.string().optional(),
  type: z.enum(["assignment", "exam", "class", "fee", "other"]),
  url: z.string().optional(),
});
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

/* ============================== Aggregate ============================== */

export const DashboardDataSchema = z.object({
  profile: StudentProfileSchema,
  attendance: z.array(AttendanceSubjectSchema),
  marks: z.array(SubjectMarksSchema),
  results: z.array(SemesterResultSchema),
  timetable: z.array(TimetableSlotSchema),
  fees: z.array(FeeRecordSchema),
  courses: z.array(LmsCourseSchema),
  assignments: z.array(AssignmentSchema),
  notifications: z.array(NotificationSchema),
  events: z.array(CalendarEventSchema),
  /** day-wise attendance for the current month so far; null when not loaded */
  dailyAttendance: DailyAttendanceSchema.nullable().default(null),
  /** hour-wise attendance for the last 14 days, oldest first */
  hourlyAttendance: z.array(HourlyDaySchema).default([]),
  /** when this snapshot was assembled (ISO) */
  fetchedAt: z.string(),
  /**
   * Sections that failed to load. The dashboard still renders everything that
   * did load and surfaces these instead of crashing.
   */
  issues: z
    .array(
      z.object({
        section: z.string(),
        source: z.enum(["erp", "lms"]),
        message: z.string(),
      }),
    )
    .default([]),
  /** Whether each source is connected for this session. */
  connected: z
    .object({ erp: z.boolean(), lms: z.boolean() })
    .default({ erp: true, lms: true }),
});
export type DashboardData = z.infer<typeof DashboardDataSchema>;
