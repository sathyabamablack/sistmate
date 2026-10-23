import {
  type LmsAdapter,
  type Credentials,
  type AuthResult,
  type LmsCourse,
  type Assignment,
  type CalendarEvent,
  type Notification,
  LmsCourseSchema,
  AssignmentSchema,
  CalendarEventSchema,
  NotificationSchema,
  CourseContentsSchema,
  type CourseContents,
} from "@usp/core";
import { mockCourseContents } from "./mock-contents";

/**
 * In-memory mock LMS adapter.
 *
 * Returns realistic Moodle-shaped data for a semester-5 CSE student so the UI
 * and downstream aggregation can be built and demoed without a live Moodle
 * instance. Every record is run through the canonical Zod schema from
 * `@usp/core`, so the mock is held to exactly the same contract as the live
 * adapter — if a shape drifts, the mock throws here instead of shipping bad
 * data to the UI.
 *
 * Course ids below double as the Moodle `courseid`; assignment/event ids are
 * stable so repeated calls are idempotent.
 */

const MOCK_COURSES: LmsCourse[] = [
  {
    id: 101,
    shortName: "SCSA5105",
    fullName: "Design and Analysis of Algorithms",
    progress: 72,
    category: "CSE / Semester 5",
    url: "https://lms.sathyabama.ac.in/course/view.php?id=101",
    grade: "69 %",
  },
  {
    id: 102,
    shortName: "SCSA5103",
    fullName: "Database Management Systems",
    progress: 88,
    category: "CSE / Semester 5",
    url: "https://lms.sathyabama.ac.in/course/view.php?id=102",
    grade: "95 %",
  },
  {
    id: 103,
    shortName: "SCSA5102",
    fullName: "Operating Systems",
    progress: 54,
    category: "CSE / Semester 5",
    url: "https://lms.sathyabama.ac.in/course/view.php?id=103",
  },
  {
    id: 104,
    shortName: "SCSA5101",
    fullName: "Computer Networks",
    progress: 41,
    category: "CSE / Semester 5",
    url: "https://lms.sathyabama.ac.in/course/view.php?id=104",
    grade: "70 %",
  },
  {
    id: 105,
    shortName: "SMAT5101",
    fullName: "Probability and Queueing Theory",
    progress: 63,
    category: "CSE / Semester 5",
    url: "https://lms.sathyabama.ac.in/course/view.php?id=105",
  },
  {
    id: 106,
    shortName: "SCSA5104",
    fullName: "Software Engineering",
    progress: null, // Moodle returns null when completion tracking is off.
    category: "CSE / Semester 5",
    url: "https://lms.sathyabama.ac.in/course/view.php?id=106",
  },
];

/**
 * Hours since the student last opened each course. Relative to "now" rather than
 * a fixed instant, so the demo never shows "last opened 3 months ago".
 */
const MOCK_LAST_ACCESS_HOURS: Record<number, number> = { 101: 3, 102: 26, 103: 75, 104: 5, 105: 170 };

const MOCK_ASSIGNMENTS: Assignment[] = [
  {
    id: 5001,
    courseId: 101,
    courseName: "Design and Analysis of Algorithms",
    name: "Lab 4: Dynamic Programming — Matrix Chain & LCS",
    dueDate: "2026-10-15T23:59:00+05:30",
    submitted: false,
    grade: null, // pending, due in a few days
    url: "https://lms.sathyabama.ac.in/mod/assign/view.php?id=5001",
  },
  {
    id: 5002,
    courseId: 102,
    courseName: "Database Management Systems",
    name: "Assignment 3: Normalization to BCNF",
    dueDate: "2026-10-09T23:59:00+05:30",
    submitted: true,
    grade: "18/20",
    url: "https://lms.sathyabama.ac.in/mod/assign/view.php?id=5002",
  },
  {
    id: 5003,
    courseId: 103,
    courseName: "Operating Systems",
    name: "Lab 3: CPU Scheduling Simulator",
    dueDate: "2026-10-04T23:59:00+05:30",
    submitted: false,
    grade: null, // OVERDUE and not submitted
    url: "https://lms.sathyabama.ac.in/mod/assign/view.php?id=5003",
  },
  {
    id: 5004,
    courseId: 104,
    courseName: "Computer Networks",
    name: "Assignment 2: Subnetting & VLSM Worksheet",
    dueDate: "2026-10-20T23:59:00+05:30",
    submitted: true,
    grade: null, // submitted, awaiting grading
    url: "https://lms.sathyabama.ac.in/mod/assign/view.php?id=5004",
  },
  {
    id: 5005,
    courseId: 105,
    courseName: "Probability and Queueing Theory",
    name: "Problem Set 4: M/M/1 Queues & Little's Law",
    dueDate: "2026-10-18T23:59:00+05:30",
    submitted: false,
    grade: null,
    url: "https://lms.sathyabama.ac.in/mod/assign/view.php?id=5005",
  },
  {
    id: 5006,
    courseId: 102,
    courseName: "Database Management Systems",
    name: "Mini Project: Library Management Schema + Queries",
    dueDate: "2026-11-05T23:59:00+05:30",
    submitted: false,
    grade: null,
    url: "https://lms.sathyabama.ac.in/mod/assign/view.php?id=5006",
  },
];

const MOCK_EVENTS: CalendarEvent[] = [
  {
    id: "evt-assign-5001",
    title: "Due: Lab 4 — Dynamic Programming",
    date: "2026-10-15T23:59:00+05:30",
    source: "lms",
    courseName: "Design and Analysis of Algorithms",
    type: "assignment",
    url: "https://lms.sathyabama.ac.in/mod/assign/view.php?id=5001",
  },
  {
    id: "evt-assign-5005",
    title: "Due: Problem Set 4 — Queueing Models",
    date: "2026-10-18T23:59:00+05:30",
    source: "lms",
    courseName: "Probability and Queueing Theory",
    type: "assignment",
    url: "https://lms.sathyabama.ac.in/mod/assign/view.php?id=5005",
  },
  {
    id: "evt-exam-cia2-os",
    title: "CIA-2 Examination: Operating Systems",
    date: "2026-10-22T10:00:00+05:30",
    source: "lms",
    courseName: "Operating Systems",
    type: "exam",
    url: "https://lms.sathyabama.ac.in/mod/quiz/view.php?id=7001",
  },
  {
    id: "evt-class-cn-lab",
    title: "Wireshark Lab Session (Networks)",
    date: "2026-10-13T14:00:00+05:30",
    source: "lms",
    courseName: "Computer Networks",
    type: "class",
    url: "https://lms.sathyabama.ac.in/course/view.php?id=104",
  },
  {
    id: "evt-other-dbms-webinar",
    title: "Guest Lecture: Scaling PostgreSQL in Production",
    date: "2026-10-16T16:00:00+05:30",
    source: "lms",
    courseName: "Database Management Systems",
    type: "other",
    url: "https://lms.sathyabama.ac.in/course/view.php?id=102",
  },
];

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "lms-notif-9001",
    title: "Operating Systems: Lab 3 deadline was yesterday",
    body: "Submissions for 'CPU Scheduling Simulator' closed on 04 Oct. Contact the course coordinator for late-submission requests.",
    date: "2026-10-05T09:15:00+05:30",
    source: "lms",
    url: "https://lms.sathyabama.ac.in/mod/assign/view.php?id=5003",
    read: false,
  },
  {
    id: "lms-notif-9002",
    title: "DBMS: Assignment 3 has been graded",
    body: "You scored 18/20 on 'Normalization to BCNF'. Feedback is available on the assignment page.",
    date: "2026-10-10T18:40:00+05:30",
    source: "lms",
    url: "https://lms.sathyabama.ac.in/mod/assign/view.php?id=5002",
    read: true,
  },
  {
    id: "lms-notif-9003",
    title: "Computer Networks: New material posted",
    body: "Lecture slides for 'Transport Layer — TCP Flow Control' are now available under Week 7.",
    date: "2026-10-11T08:00:00+05:30",
    source: "lms",
    url: "https://lms.sathyabama.ac.in/course/view.php?id=104",
    read: false,
  },
  {
    id: "lms-notif-9004",
    title: "Reminder: CIA-2 timetable published",
    body: "The internal assessment schedule for Semester 5 is now available on the LMS calendar.",
    date: "2026-10-09T12:30:00+05:30",
    source: "lms",
    read: false,
  },
];

export { mockFileBytes } from "./mock-contents";

export function createMockLmsAdapter(): LmsAdapter {
  return {
    async authenticate(creds: Credentials): Promise<AuthResult> {
      if (creds.username.trim() && creds.password.trim()) {
        return { ok: true, session: "mock-moodle-token" };
      }
      return { ok: false, error: "Username and password are required." };
    },

    async getCourses(): Promise<LmsCourse[]> {
      const now = Date.now();
      return MOCK_COURSES.map((c) => {
        const hours = MOCK_LAST_ACCESS_HOURS[c.id];
        return LmsCourseSchema.parse(
          hours === undefined ? c : { ...c, lastAccess: new Date(now - hours * 3_600_000).toISOString() },
        );
      });
    },

    async getAssignments(): Promise<Assignment[]> {
      return MOCK_ASSIGNMENTS.map((a) => AssignmentSchema.parse(a));
    },

    async getCalendar(): Promise<CalendarEvent[]> {
      return MOCK_EVENTS.map((e) => CalendarEventSchema.parse(e));
    },

    async getNotifications(): Promise<Notification[]> {
      return MOCK_NOTIFICATIONS.map((n) => NotificationSchema.parse(n));
    },

    async getCourseContents(courseId: number): Promise<CourseContents> {
      const contents = mockCourseContents(courseId);
      if (!contents) throw new Error(`Course ${courseId} was not found.`);
      return CourseContentsSchema.parse(contents);
    },
  };
}
