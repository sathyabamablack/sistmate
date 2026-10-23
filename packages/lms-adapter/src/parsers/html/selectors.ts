/**
 * ============================================================================
 *  ALL CSS SELECTORS, ATTRIBUTE NAMES, HEADER ALIASES AND TEXT PATTERNS USED
 *  BY THE HTML (SCRAPE) FALLBACK PARSERS LIVE IN THIS ONE FILE.
 * ============================================================================
 *
 *  Themes vary — when real captures arrive, edit THIS file.
 *
 *  The defaults target stock Moodle 4.x with the Boost theme (and mostly work
 *  for Classic). Institutions often run a custom/child theme (Moove, Academi,
 *  Adaptable, a college-branded theme...) that renames classes or reorders
 *  columns. The parsers never hard-code a selector; they read these lists.
 *
 *  How the lists are used:
 *   - Every `string[]` is an ORDERED list of fallbacks. The parser tries each
 *     selector in turn and uses the FIRST one that matches something. Put the
 *     most specific selector first, the generic "last resort" one last.
 *   - Header aliases are compared after normalisation (lower-case, punctuation
 *     stripped, whitespace collapsed). Exact alias matches win; otherwise a
 *     header that STARTS WITH / CONTAINS an alias as a whole word matches.
 *   - Regex patterns are tested against cleaned cell text.
 *
 *  Workflow when the real LMS differs:
 *   1. Save the page from a logged-in browser ("Save page as → Web page,
 *      complete" or DevTools → Elements → Copy outerHTML) into captures/lms/.
 *   2. Copy it over the matching file in packages/lms-adapter/fixtures/html/.
 *   3. Run the tests; the failing assertion tells you which field is missing.
 *   4. Open the capture, find the element, add its selector at the FRONT of
 *      the relevant list below. Keep the old ones — they cost nothing.
 *
 *  Caveat: "my/courses.php" and the dashboard render course cards with
 *  JavaScript (AJAX). A raw server response (fetch/curl) contains NO cards —
 *  only the empty `[data-region="courses-view"]` shell. For the scrape path
 *  use `course/index.php` / the course list in the nav drawer, or save the
 *  page AFTER it finished loading in a browser.
 */

/** Elements whose text is screen-reader-only and must be removed before reading text. */
export const HIDDEN_TEXT = [
  ".sr-only", // Bootstrap 4 (Moodle 3.x - 4.x)
  ".visually-hidden", // Bootstrap 5 (Moodle 5.x)
  ".accesshide", // Moodle legacy
].join(", ");

/* ----------------------------------------------------------------------------
 * login/index.php
 * ------------------------------------------------------------------------- */
export const LOGIN = {
  /** The login <form>. Boost: <form class="login-form" id="login" action=".../login/index.php"> */
  form: ["form#login", "form.login-form", "form[action*='login/index.php']", "form:has(input[type='password'])"],
  /** Hidden CSRF token Moodle >= 3.6 requires on POST. */
  logintokenInput: "input[name='logintoken']",
  /** Username field (name attribute is read from it). */
  usernameInput: ["input#username", "input[name='username']", "input[type='email']", "input[type='text']"],
  /** Password field. */
  passwordInput: ["input#password", "input[name='password']", "input[type='password']"],
  /**
   * Login error markers. `#loginerrormessage` is Moodle's own (an sr-only
   * anchor in 4.x); `.alert-danger` is the visible box. `.alert-danger` is
   * only trusted when the page also contains a login form (to avoid matching
   * unrelated alerts on other pages).
   */
  errorStrong: ["#loginerrormessage", ".loginerrors .error", ".loginerrors"],
  errorWeak: [".login-container .alert-danger", ".alert-danger", ".alert-error"],
  /** Markers that only appear when a user is logged in. */
  loggedInMarkers: ["a[href*='login/logout.php']", "#user-menu-toggle", ".usermenu .userbutton", "[data-region='user-menu']"],
} as const;

/* ----------------------------------------------------------------------------
 * my/courses.php, dashboard (my/), course/index.php
 * ------------------------------------------------------------------------- */
export const MY_COURSES = {
  /** Strategy 1 — course cards (block_myoverview / recently accessed courses). */
  card: [
    "[data-region='course-content'][data-course-id]",
    ".dashboard-card[data-course-id]",
    ".course-card[data-course-id]",
    ".card[data-course-id]",
    "[data-course-id]",
  ],
  /** Attribute(s) carrying the course id on a card. */
  cardIdAttr: ["data-course-id", "data-courseid"],
  cardFullName: [".coursename .multiline", "a.coursename", ".coursename", ".course-title", "h4 a", "h5 a"],
  cardShortName: [".shortname", "[data-region='course-shortname']", ".course-shortname"],
  cardCategory: [".categoryname", ".course-category", "[data-region='course-category']"],
  /** Progress: numeric attribute first, then a "72% complete" text. */
  cardProgressAttr: { selector: "[role='progressbar'][aria-valuenow], .progress-bar[aria-valuenow]", attr: "aria-valuenow" },
  cardProgressText: [".progress-text", "[data-region='progress']", ".course-progress"],

  /** Strategy 2 — course/index.php and front-page "coursebox" list. */
  coursebox: [".coursebox[data-courseid]", ".coursebox"],
  courseboxIdAttr: ["data-courseid", "data-course-id"],
  courseboxName: [".coursename a", "h3 a", ".info a"],
  courseboxCategory: [".coursecat", ".course-category"],

  /** Strategy 3 — any course link inside the main region (last resort). */
  genericCourseLinks: [
    "#region-main a[href*='course/view.php?id=']",
    "[role='main'] a[href*='course/view.php?id=']",
  ],
} as const;

/* ----------------------------------------------------------------------------
 * mod/assign/index.php?id=COURSEID
 * ------------------------------------------------------------------------- */
export const ASSIGN_INDEX = {
  /** Candidate tables, tried in order; the first whose headers include a "name" column wins. */
  table: ["table.mod_index", "#region-main table.generaltable", "#region-main table", "table"],
  /** Header cells. If the table has no <thead>, the first row is used. */
  headerCells: ["thead th", "thead td"],
  bodyRows: ["tbody tr"],
  /** Link to the activity inside a row (cmid is read from its ?id=). */
  activityLink: ["a[href*='mod/assign/view.php']", "a[href*='/mod/']"],
  /** Course name on the page (used when the caller does not pass one). */
  courseHeading: [".page-header-headings h1", "#page-header h1", "header h1", "h1"],
  breadcrumbCourseLink: [".breadcrumb a[href*='course/view.php?id=']", "nav a[href*='course/view.php?id=']"],
  /** <body class="... course-101 ..."> */
  bodyCourseClass: /\bcourse-(\d+)\b/,
  /** If no table is found but the page says this, the course simply has no assignments. */
  emptyPattern: /there are no (assignments|assignment)|no assignments/i,

  /**
   * Header text aliases per logical column. Matching is by header TEXT, never
   * by position, so reordered or extra columns are fine.
   */
  headerAliases: {
    name: ["assignment", "assignments", "name", "title", "activity", "assignment name"],
    due: ["due date", "due", "deadline", "due on", "last date", "submission deadline", "end date"],
    submission: ["submission", "submissions", "submission status", "status", "submitted", "my submission"],
    grade: ["grade", "grades", "marks", "mark", "score", "result"],
  },

  /** Submission cell text → submitted? NOT-submitted patterns are checked first. */
  notSubmittedPatterns: [/no submission/i, /not submitted/i, /^draft/i, /^no$/i, /^-$/, /^new$/i, /not attempted/i],
  submittedPatterns: [/submitted for grading/i, /^submitted\b/i, /^yes$/i, /^done$/i, /\bsubmitted\b/i],
} as const;

/* ----------------------------------------------------------------------------
 * calendar/view.php?view=upcoming
 * ------------------------------------------------------------------------- */
export const UPCOMING = {
  /** One element per event. */
  event: ["[data-type='event']", ".eventlist .event", ".event"],
  /** Attributes Moodle 4.x puts on each event element. */
  idAttr: ["data-event-id"],
  courseIdAttr: ["data-course-id"],
  /** "mod_assign", "mod_quiz", ... (preferred for the type mapping). */
  componentAttr: ["data-event-component"],
  /** "due", "close", "course", "user", ... */
  eventTypeAttr: ["data-event-eventtype"],
  titleAttr: ["data-event-title"],
  title: ["h3.name", ".name", ".card-header h3", "h3", "h4"],
  /**
   * The date line links to the day view with the event timestamp:
   *   calendar/view.php?view=day&time=1792088940
   * The `time` query param is the event start in UNIX seconds — exact and
   * timezone-free, so it is preferred over parsing the human date text.
   */
  dayLink: ["a[href*='view=day'][href*='time=']", "a[href*='calendar/view.php'][href*='time=']"],
  dayLinkTimeParam: "time",
  /** Fallback: text of the date row, e.g. "Thursday, 15 October, 11:59 PM". */
  dateText: [".description .row:first-child .col-11", ".description .col-11", "[data-region='event-time']", ".date"],
  courseLink: [".description a[href*='course/view.php?id=']", "a[href*='course/view.php?id=']"],
  activityLink: [".card-footer a.card-link", ".card-footer a", "a.card-link", "a[href*='/mod/']"],
  /** Moodle's front-page "course" id; events in it are site events (no course). */
  siteCourseId: "1",
} as const;
