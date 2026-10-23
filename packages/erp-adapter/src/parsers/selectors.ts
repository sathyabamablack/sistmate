/**
 * ============================================================================
 *  ERP PAGE SELECTORS - the ONLY page-specific knowledge in the parser layer.
 * ============================================================================
 *
 *  >>> When real captures arrive, edit THIS file. <<<
 *
 *  The parsers (profile.ts, attendance.ts, ...) are generic: they never say
 *  "the 3rd column" or "#ctl00_gvAttendance". Instead they ask this file:
 *
 *   - WHERE to look  (`container`: a CSS selector; comma-separate fallbacks).
 *     If the container matches nothing, table lookups fall back to scanning
 *     every <table> on the page, so a wrong container is forgiving.
 *   - WHAT a column is called (`columns`: canonical field -> header aliases).
 *     Tables are found by matching their HEADER ROW against these aliases,
 *     not by position, so reordered/extra columns don't break anything.
 *
 *  How alias matching works (see `table.ts > headerMatches`):
 *   - case-insensitive, whitespace/&nbsp; collapsed;
 *   - punctuation is ignored: "Sl.No." == "sl no", "Degree/Branch" == "degree branch";
 *   - "%" and "+" are kept, so "%" and "Attendance %" are real aliases;
 *   - a header is ALSO tried with any "(...)" / "[...]" part removed, so
 *     "Amount (Rs.)" matches alias "amount" and "Percentage (%)" matches
 *     "percentage";
 *   - otherwise the match is EXACT (after normalisation). "Total" does not
 *     match "Total Hours" - add the alias you see on the real page.
 *
 *  Workflow with a real page: save it to captures/erp/<page>.html, point the
 *  tests at it, read the ParseError message (it lists the headers it saw), and
 *  add the missing alias / fix the container here until the tests go green.
 *
 *  RegExps in here must NOT use the /g flag (they are reused with .test()).
 */

/* ------------------------------------------------------------------------- */
/*  Types                                                                     */
/* ------------------------------------------------------------------------- */

/** How to find one table and map its columns onto canonical field names. */
export interface TableSpec<F extends string> {
  /** CSS selector for the table itself or an element that contains it. */
  container: string;
  /** canonical field -> list of header texts that mean that field. */
  columns: { readonly [K in F]: readonly string[] };
  /** Fields whose column MUST exist for a table to count as a match. */
  required: readonly F[];
  /**
   * Optional: at least one of these groups must be fully present too.
   * e.g. attendance needs (total AND attended) OR (attendedOfTotal).
   */
  requireOneOf?: readonly (readonly F[])[];
}

export type ProfileField =
  | "registerNumber"
  | "name"
  | "program"
  | "department"
  | "semester"
  | "section"
  | "batch"
  | "email"
  | "phone"
  | "advisor";

export type AttendanceField =
  | "code"
  | "title"
  | "total"
  | "attended"
  | "percentage"
  | "attendedOfTotal";

export type MarksField = "code" | "title" | "total";

export type ResultsField =
  | "semester"
  | "code"
  | "title"
  | "credits"
  | "grade"
  | "gradePoint";

export type GpaField = "semester" | "gpa" | "credits";

export type FeesField =
  | "description"
  | "amount"
  | "dueDate"
  | "status"
  | "paidDate"
  | "receiptNo"
  | "paidAmount"
  | "balance";

export type TimetableLegendField = "code" | "title" | "faculty";

export type NoticeField = "title" | "date" | "body";

export interface ErpSelectors {
  /** Offset appended to parsed datetimes (the portal shows local IST times). */
  timezoneOffset: string;

  login: {
    /** Which <form> is the login form. The one containing a password input wins. */
    form: string;
    /** name/id/placeholder of the username box. */
    usernamePattern: RegExp;
    /** name/id/placeholder of a captcha text box. */
    captchaInputPattern: RegExp;
    /** src/id/alt/class of a captcha <img>. */
    captchaImagePattern: RegExp;
    /** Third-party captcha widgets (reCAPTCHA, hCaptcha). */
    captchaWidgetSelector: string;
    /** Elements that hold the "wrong password" message after a failed POST. */
    errorSelectors: string;
    /** Text that means "login failed" (checked in errorSelectors + alert('...') scripts). */
    failurePattern: RegExp;
  };

  profile: {
    container: string;
    /** Non-table label elements whose NEXT sibling holds the value. */
    labelSelector: string;
    /** The student photo <img>. */
    photo: string;
    /** canonical field -> label texts ("Register No :", "Reg. No." ...). */
    labels: { readonly [K in ProfileField]: readonly string[] };
    /**
     * Optional direct selectors that win over label matching, e.g.
     * { registerNumber: "#ContentPlaceHolder1_lblRegNo" }. Handy for ASP.NET
     * pages where every value is a <span id="...lblXxx">.
     */
    valueSelectors: { readonly [K in ProfileField]?: string };
    /** "B.E. / Computer Science" -> degree "B.E.", branch "Computer Science". */
    programSeparators: readonly string[];
  };

  attendance: {
    table: TableSpec<AttendanceField>;
    /** Rows whose code/title cell matches this are footers, not subjects. */
    skipRowPattern: RegExp;
  };

  marks: {
    /** Code/title/total columns. Every OTHER non-ignored column is a component. */
    table: TableSpec<MarksField>;
    /** Header texts that are NOT mark components (serial no, credits ...). */
    ignoreColumns: readonly string[];
    /** First-cell text of an optional "Max Marks" row giving each column's max. */
    maxRowLabels: readonly string[];
    /** Cell values meaning "absent" -> scored 0. */
    absentTokens: readonly string[];
    skipRowPattern: RegExp;
    /** Max to assume when neither header "(50)" nor a max row gives one. null = fail loudly. */
    defaultMax: number | null;
  };

  results: {
    table: TableSpec<ResultsField>;
    /** Optional per-semester summary table (SGPA/GPA, credits earned). */
    gpaTable: TableSpec<GpaField>;
    /** Grade letter -> grade point. Keys compared upper-case, spaces removed. */
    gradePoints: Readonly<Record<string, number>>;
    /**
     * true  = Anna-University style: failed/absent courses (grade point 0) are
     *         left out of GPA and of "credits earned".
     * false = every graded course counts.
     */
    excludeFailedFromGpa: boolean;
    skipRowPattern: RegExp;
  };

  timetable: {
    /** Where the day x period grid lives. */
    container: string;
    /** How to spot a course code inside a cell. */
    courseCodePattern: RegExp;
    /** Cell texts (lower-case, letters/digits only) that mean "no class". */
    skipCellTokens: readonly string[];
    /** Extra day labels -> 0..6 (Mon=0), e.g. { "day 1": 0 } for day-order timetables. */
    dayAliases: Readonly<Record<string, number>>;
    /** Header times without AM/PM whose hour is 1..(this-1) are afternoon ("01.30" -> 13:30). */
    assumePmBelowHour: number;
    /** Merge consecutive periods of the same class (lab blocks) into one slot. */
    mergeSpans: boolean;
    /** "Room: 204", "Venue - Lab 3" */
    roomLabelPattern: RegExp;
    /** An unlabelled line that looks like a room. */
    roomPattern: RegExp;
    /** "Faculty: Dr. X", "Staff - Y" */
    facultyLabelPattern: RegExp;
    /** An unlabelled line that looks like a person. */
    facultyTitlePattern: RegExp;
    /** Optional legend table under the grid: code -> title/faculty. */
    legend: TableSpec<TimetableLegendField>;
  };

  fees: {
    table: TableSpec<FeesField>;
    /** Status texts meaning paid / not paid (normalised, substring match; unpaid checked first). */
    paidTokens: readonly string[];
    unpaidTokens: readonly string[];
    skipRowPattern: RegExp;
  };

  notifications: {
    /** The notice board region. */
    container: string;
    /** One notice inside the container. */
    item: string;
    title: string;
    date: string;
    body: string;
    link: string;
    /** An item (or something inside it) matching this is UNREAD ("new" badge). */
    unreadSelector: string;
    /** Fallback when notices are rendered as a table instead of items. */
    table: TableSpec<NoticeField>;
  };
}

/* ------------------------------------------------------------------------- */
/*  Defaults - tuned to the synthetic fixtures in ../../fixtures/.            */
/*  Replace/extend with what the real Sathyabama ERP pages use.               */
/* ------------------------------------------------------------------------- */

export const DEFAULT_SELECTORS: ErpSelectors = {
  timezoneOffset: "+05:30",

  /* ------------------------------- login ------------------------------- */
  login: {
    form: "form",
    usernamePattern: /user|login|regno|reg_no|register|roll|uname|email|txtid|student/i,
    captchaInputPattern: /captcha|security.?code|verification.?code|txtcode|txtcap|txtimg/i,
    captchaImagePattern: /captcha|securityimage|verifyimage/i,
    captchaWidgetSelector:
      ".g-recaptcha, .h-captcha, [data-sitekey], iframe[src*='recaptcha'], script[src*='recaptcha'], script[src*='hcaptcha']",
    errorSelectors:
      "[id*='lblError'], [id*='lblMsg'], [id*='lblMessage'], .error, .error-message, .alert-danger, .text-danger, .validation-summary-errors, .field-validation-error",
    failurePattern:
      /invalid|incorrect|wrong|failed|does not (?:exist|match)|not match|locked|blocked|expired|try again|please enter|required/i,
  },

  /* ------------------------------ profile ------------------------------ */
  profile: {
    container:
      "#ContentPlaceHolder1_pnlProfile, #ctl00_ContentPlaceHolder1_pnlProfile, .student-profile, .profile, #profile",
    labelSelector: "label, dt, .label, .lbl, .field-label, .info-label",
    photo:
      "img[id*='imgPhoto'], img[id*='StudentPhoto'], img.student-photo, img.profile-photo, img[src*='photo'], img[src*='Photo']",
    labels: {
      registerNumber: [
        "register no",
        "register number",
        "reg no",
        "reg number",
        "registration no",
        "registration number",
        "roll no",
        "roll number",
        "enrollment no",
        "student id",
      ],
      name: ["name", "student name", "name of the student", "student's name"],
      program: [
        "degree/branch",
        "degree / branch",
        "degree & branch",
        "degree and branch",
        "course/branch",
        "programme",
        "program",
        "degree",
        "course",
      ],
      department: ["department", "dept", "branch", "specialization", "specialisation", "school"],
      semester: ["semester", "current semester", "sem", "year/sem", "year / sem"],
      section: ["section", "sec", "class section"],
      batch: ["batch", "academic batch", "batch year", "year of admission"],
      email: ["email", "email id", "e-mail", "e-mail id", "mail id", "official email", "college email"],
      phone: ["mobile", "mobile no", "mobile number", "phone", "phone no", "contact no", "contact number", "student mobile"],
      advisor: ["class advisor", "faculty advisor", "advisor", "adviser", "mentor", "class teacher", "counsellor"],
    },
    valueSelectors: {},
    programSeparators: [" / ", " - ", " \u2013 ", "/"],
  },

  /* ----------------------------- attendance ---------------------------- */
  attendance: {
    table: {
      container:
        "#ContentPlaceHolder1_gvAttendance, #ctl00_ContentPlaceHolder1_gvAttendance, table.attendance, #attendance",
      columns: {
        code: ["course code", "subject code", "sub code", "paper code", "code"],
        title: [
          "course name",
          "course title",
          "subject name",
          "subject title",
          "name of the subject",
          "subject",
          "course",
          "title",
        ],
        total: [
          "total",
          "total classes",
          "total hours",
          "total periods",
          "classes conducted",
          "hours conducted",
          "periods conducted",
          "conducted",
          "no of classes",
          "no of hours",
        ],
        attended: [
          "attended",
          "present",
          "classes attended",
          "hours attended",
          "periods attended",
          "attended hours",
          "no of present",
          "no of classes attended",
        ],
        percentage: ["%", "percentage", "percent", "attendance %", "att %", "attendance percentage", "attendance"],
        attendedOfTotal: ["attended/total", "present/total", "attended / conducted", "attendance (attended/total)"],
      },
      required: ["code"],
      requireOneOf: [["total", "attended"], ["attendedOfTotal"]],
    },
    skipRowPattern: /^(grand\s*)?total\b|^overall\b|^no (records|data)/i,
  },

  /* -------------------------------- marks ------------------------------ */
  marks: {
    table: {
      container:
        "#ContentPlaceHolder1_gvMarks, #ctl00_ContentPlaceHolder1_gvMarks, table.marks, #marks, #internal-marks",
      columns: {
        code: ["course code", "subject code", "sub code", "paper code", "code"],
        title: ["course name", "course title", "subject name", "subject title", "subject", "title"],
        total: ["total", "total marks", "internal total", "internal marks", "grand total"],
      },
      required: ["code"],
    },
    ignoreColumns: ["s no", "sl no", "sno", "slno", "serial no", "credits", "credit", "faculty", "staff", "remarks", "semester", "sem"],
    maxRowLabels: ["max", "max marks", "maximum", "maximum marks", "max mark", "out of"],
    absentTokens: ["ab", "absent", "a"],
    skipRowPattern: /^(grand\s*)?total\b|^no (records|data)/i,
    defaultMax: null,
  },

  /* ------------------------------- results ----------------------------- */
  results: {
    table: {
      container:
        "#ContentPlaceHolder1_gvResults, #ctl00_ContentPlaceHolder1_gvResults, table.results, #results, .mark-statement",
      columns: {
        semester: ["semester", "sem", "sem no", "semester no"],
        code: ["course code", "subject code", "sub code", "paper code", "code"],
        title: ["course title", "course name", "subject name", "subject title", "subject", "title"],
        credits: ["credits", "credit", "cr", "credit points"],
        grade: ["grade", "grade obtained", "letter grade", "grade secured"],
        gradePoint: ["grade point", "grade points", "gp"],
      },
      required: ["code", "grade"],
    },
    gpaTable: {
      container: "#ContentPlaceHolder1_gvGpa, #ctl00_ContentPlaceHolder1_gvGpa, table.gpa-summary, #gpa",
      columns: {
        semester: ["semester", "sem"],
        gpa: ["sgpa", "gpa", "semester gpa"],
        credits: ["credits earned", "credits", "earned credits", "total credits"],
      },
      required: ["semester", "gpa"],
    },
    gradePoints: { O: 10, "A+": 9, A: 8, "B+": 7, B: 6, C: 5, U: 0, RA: 0, AB: 0, F: 0, W: 0 },
    excludeFailedFromGpa: true,
    skipRowPattern: /^(grand\s*)?total\b|^no (records|data)/i,
  },

  /* ------------------------------ timetable ---------------------------- */
  timetable: {
    container:
      "#ContentPlaceHolder1_gvTimeTable, #ctl00_ContentPlaceHolder1_gvTimeTable, table.timetable, #timetable",
    courseCodePattern: /\b[A-Z]{2,5}\d{3,5}[A-Z]?\b/,
    skipCellTokens: ["", "free", "lunch", "break", "recess", "nil", "na", "x"],
    dayAliases: {},
    assumePmBelowHour: 8,
    mergeSpans: false,
    roomLabelPattern: /^(?:room|hall|venue|rm|class\s*room|location)\s*(?:no\.?)?\s*[:\-]\s*(.+)$/i,
    roomPattern: /\b(?:room|lab|hall|block|blk|lh)\b|^[A-Z]{0,4}[- ]?\d{2,4}[A-Z]?$/i,
    facultyLabelPattern: /^(?:faculty|staff|handled by|by)\s*[:\-]\s*(.+)$/i,
    facultyTitlePattern: /^(?:dr|prof|mr|mrs|ms)\b\.?\s/i,
    legend: {
      container: "#ContentPlaceHolder1_gvSubjects, #ctl00_ContentPlaceHolder1_gvSubjects, table.tt-legend, #legend",
      columns: {
        code: ["course code", "subject code", "sub code", "code"],
        title: ["course title", "course name", "subject name", "subject title", "subject", "title"],
        faculty: ["faculty", "faculty name", "staff", "staff name", "handled by", "faculty in charge"],
      },
      required: ["code", "title"],
    },
  },

  /* -------------------------------- fees ------------------------------- */
  fees: {
    table: {
      container: "#ContentPlaceHolder1_gvFees, #ctl00_ContentPlaceHolder1_gvFees, table.fees, #fees",
      columns: {
        description: [
          "fee description",
          "description",
          "particulars",
          "fee type",
          "fee head",
          "fee name",
          "fee details",
          "head",
        ],
        amount: ["amount", "fee amount", "amount rs", "total amount", "amount payable", "net amount"],
        dueDate: ["due date", "last date", "due on", "last date for payment"],
        status: ["status", "payment status", "paid status"],
        paidDate: ["paid date", "payment date", "date of payment", "paid on", "receipt date"],
        receiptNo: ["receipt no", "receipt number", "receipt", "challan no", "transaction id", "txn id", "reference no"],
        paidAmount: ["paid amount", "amount paid", "paid"],
        balance: ["balance", "balance amount", "outstanding", "due amount", "pending amount"],
      },
      required: ["description", "amount"],
    },
    paidTokens: ["paid", "success", "completed", "received", "cleared"],
    unpaidTokens: ["unpaid", "not paid", "pending", "due", "overdue", "outstanding", "failed", "partial"],
    skipRowPattern: /^(grand\s*)?total\b|^no (records|data)/i,
  },

  /* ---------------------------- notifications -------------------------- */
  notifications: {
    container:
      "#ContentPlaceHolder1_pnlNotice, #ctl00_ContentPlaceHolder1_pnlNotice, .notice-board, #notifications, .notifications",
    item: ".notice-item, li.notice, .news-item",
    title: ".notice-title, .title, a",
    date: ".notice-date, .date, time",
    body: ".notice-body, .description, .body, p",
    link: "a[href]",
    unreadSelector: ".new, .unread, img.new-badge, img[alt='New'], img[alt='new']",
    table: {
      container: "#ContentPlaceHolder1_gvNotice, table.notices",
      columns: {
        title: ["subject", "title", "notice", "circular", "announcement"],
        date: ["date", "posted on", "published on", "notice date"],
        body: ["description", "details", "message", "content"],
      },
      required: ["title", "date"],
    },
  },
};
