/**
 * Mock Sathyabama ERP login service — LOCAL DEVELOPMENT ONLY.
 *
 * This is a FAKE backend. It imitates the *shape* of the login service that the
 * `@usp/erp-adapter` live client talks to, so you can develop and test the
 * unified-student-portal auth flow on your own machine without ever touching
 * the real college ERP.
 *
 * What the real thing looks like (see packages/erp-adapter/src/live.ts):
 *   - The browser login is gated by a Cloudflare Turnstile a server can't solve,
 *     so a separate "login service" exchanges a register number + password for
 *     the ERP's own JWT.
 *       POST {ERP_AUTH_URL}/api/login   body: { RegisterNumber, Password }
 *       success -> { status: true, responseData: { login: { accessToken, StudentId } } }
 *       failure -> { status: false, message: "..." }
 *   - Data calls then carry that JWT as a Bearer token against the ERP API:
 *       POST {ERP_BASE_URL}/erp/api/v1.0/<Endpoint>   Authorization: Bearer <jwt>
 *       response envelope: { responseData: { data: [...] | StudentInfo: [...] } }
 *
 * This mock reproduces BOTH surfaces on one port, with NO captcha, so point the
 * app at it for local work:
 *   ERP_AUTH_URL=http://localhost:8787   # the login service (/api/login)
 *   ERP_BASE_URL=http://localhost:8787   # the data API      (/erp/api/v1.0/*)
 *
 * Zero dependencies: runs on the repo's Node 20 with `node server.mjs`.
 */

import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

/* ------------------------------- config -------------------------------- */

const PORT = Number(process.env.PORT ?? 8787);
// Dev secret only. The real ERP signs its own JWTs; we just need a token that is
// internally verifiable so expiry / tampering can be exercised locally.
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-not-for-production";
// Short by default so you can watch the app handle a 401 (SessionExpiredError).
const TOKEN_TTL_SEC = Number(process.env.TOKEN_TTL_SEC ?? 3600);
// Accept ANY register number + password and fabricate a student. Handy for quick
// UI runs; off by default so invalid-credential handling can be tested too.
const DEV_ALLOW_ANY = process.env.DEV_ALLOW_ANY === "1";

/** Seeded fake students. Edit backend/students.json to add your own test login. */
function loadStudents() {
  try {
    const raw = readFileSync(join(HERE, "students.json"), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.students) ? parsed.students : [];
  } catch (e) {
    console.warn(`[mock-erp] could not read students.json (${e instanceof Error ? e.message : e}); using none`);
    return [];
  }
}
const STUDENTS = loadStudents();

/* --------------------------------- JWT --------------------------------- */

const b64url = (input) => Buffer.from(input).toString("base64url");

/** Mint an HS256 JWT that carries the same identifiers the ERP's token would. */
function signJwt(claims, ttlSec = TOKEN_TTL_SEC) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { iat: now, exp: now + ttlSec, iss: "mock-sathyabama-erp", ...claims };
  const head = b64url(JSON.stringify(header));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

/** Verify signature + expiry. Returns { payload } | { expired:true } | null. */
function verifyJwt(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const expected = createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  const got = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return { expired: true, payload };
  return { payload };
}

/* ------------------------------- helpers ------------------------------- */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function send(res, status, json) {
  const payload = JSON.stringify(json);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...CORS });
  res.end(payload);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null; // signal a malformed body
  }
}

/** Case-insensitive field read — the ERP uses PascalCase, be forgiving locally. */
function field(obj, ...names) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const name of names) {
    for (const key of Object.keys(obj)) {
      if (key.toLowerCase() === name.toLowerCase() && obj[key] != null && obj[key] !== "") {
        return String(obj[key]);
      }
    }
  }
  return undefined;
}

function bearer(req) {
  const h = req.headers["authorization"] ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(Array.isArray(h) ? h[0] : h);
  return m ? m[1].trim() : null;
}

/** 401 in the shape the adapter maps to SessionExpiredError. */
function unauthorized(res, message) {
  send(res, 401, { status: false, message });
}

/* ------------------------------- student ------------------------------- */

/** Build the StudentInfo record MasterStudent/view returns, from a seed student. */
function studentInfo(stu) {
  const now = new Date();
  const year = now.getFullYear();
  return {
    RegisterNumber: stu.registerNumber,
    StudentName: stu.name ?? "Test Student",
    DegreeId: stu.degreeId ?? "1",
    CourseId: stu.courseId ?? "27",
    ProgrammeId: stu.programmeId ?? "101",
    ProgrammeName: stu.program ?? "B.E. Computer Science and Engineering",
    CourseName: stu.department ?? "Computer Science and Engineering",
    Batch: stu.batch ?? "2024-2028",
    Section: stu.section ?? "B",
    CurrentSemester: String(stu.semester ?? 5),
    Semester: String(stu.semester ?? 5),
    YearofStudy: String(stu.yearOfStudy ?? 3),
    CurrentAcademicYear: `${year}-${year + 1}`,
    CurrentAcademicMonth: String(now.getMonth() + 1),
    Email: stu.email ?? `${stu.registerNumber}@sathyabama.ac.in`,
    MobileNo: stu.phone ?? "",
    NumberofArrears: stu.arrears ?? 0,
  };
}

function academicTerms(stu) {
  const now = new Date();
  return [
    {
      AcademicMonthId: String(now.getMonth() + 1),
      AcademicYear: `${now.getFullYear()}-${now.getFullYear() + 1}`,
      Semester: String(stu.semester ?? 5),
    },
  ];
}

/* ------------------------------- routes -------------------------------- */

/** POST /api/login — the whole point of this mock. */
async function handleLogin(req, res) {
  const body = await readJsonBody(req);
  if (body === null) return send(res, 400, { status: false, message: "Malformed JSON body." });

  const regNo = (field(body, "RegisterNumber", "registerNumber", "username", "regNo") ?? "").trim();
  const password = field(body, "Password", "DOB", "password") ?? "";

  if (!regNo || !password) {
    return send(res, 200, { status: false, message: "Register number and password are required." });
  }

  let stu = STUDENTS.find((s) => String(s.registerNumber) === regNo);
  if (stu && String(stu.password) !== password) {
    // Wrong password for a known student.
    return send(res, 200, { status: false, message: "Invalid Register Number or Password." });
  }
  if (!stu) {
    if (!DEV_ALLOW_ANY) {
      return send(res, 200, { status: false, message: "Invalid Register Number or Password." });
    }
    // Dev convenience: fabricate a student so any login "works".
    stu = { registerNumber: regNo, password, studentId: `9${regNo.slice(-6)}`, name: "Dev Student" };
  }

  const studentId = String(stu.studentId ?? `1${regNo.slice(-5)}`);
  const accessToken = signJwt({
    // Claims shaped after the ERP's real JWT (ProjectIdentifier SATUERP…).
    ProjectIdentifier: "SATUERP",
    RegisterNumber: regNo,
    StudentId: studentId,
    roleName: "Student",
  });

  console.log(`[mock-erp] login ok: ${regNo} (StudentId ${studentId})`);
  // Envelope matches what the adapter reads: responseData.login.{accessToken,StudentId}.
  return send(res, 200, {
    status: true,
    message: "Login successful",
    responseData: {
      login: {
        accessToken,
        StudentId: studentId,
        RegisterNumber: regNo,
        IdentityId: null,
        roleName: "Student",
      },
    },
  });
}

/** Any token-guarded data endpoint under /erp/api/v1.0/. */
async function handleErpApi(req, res, endpoint) {
  const token = bearer(req);
  if (!token) return unauthorized(res, "No access token.");
  const check = verifyJwt(token);
  if (!check) return unauthorized(res, "Invalid access token.");
  if (check.expired) return unauthorized(res, "Session expired — please sign in again.");

  const regNo = check.payload.RegisterNumber;
  const stu =
    STUDENTS.find((s) => String(s.registerNumber) === String(regNo)) ??
    { registerNumber: regNo, studentId: check.payload.StudentId };

  await readJsonBody(req); // drain the request body; most mocked calls ignore it

  // Only MasterStudent/view is filled out (it's what the dashboard keys on).
  // Every other endpoint returns a valid-but-empty envelope so the app renders
  // instead of crashing. Flesh these out as you need them.
  if (endpoint === "MasterStudent/view") {
    return send(res, 200, {
      responseData: {
        StudentInfo: [studentInfo(stu)],
        studentAcademic: academicTerms(stu),
      },
    });
  }

  return send(res, 200, { responseData: { data: [], count: 0, _mock: `stub for ${endpoint}` } });
}

/* -------------------------------- server ------------------------------- */

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  try {
    if (pathname === "/health" || pathname === "/") {
      return send(res, 200, {
        status: true,
        service: "mock-sathyabama-erp",
        students: STUDENTS.length,
        devAllowAny: DEV_ALLOW_ANY,
        tokenTtlSec: TOKEN_TTL_SEC,
      });
    }

    if ((pathname === "/api/login" || pathname === "/login") && method === "POST") {
      return await handleLogin(req, res);
    }

    // Decode-your-token convenience endpoint for debugging.
    if (pathname === "/api/me" && method === "GET") {
      const token = bearer(req);
      if (!token) return unauthorized(res, "No access token.");
      const check = verifyJwt(token);
      if (!check) return unauthorized(res, "Invalid access token.");
      if (check.expired) return unauthorized(res, "Session expired.");
      return send(res, 200, { status: true, claims: check.payload });
    }

    const apiPrefix = "/erp/api/v1.0/";
    if (pathname.startsWith(apiPrefix) && method === "POST") {
      return await handleErpApi(req, res, pathname.slice(apiPrefix.length));
    }

    return send(res, 404, { status: false, message: `No route for ${method} ${pathname}` });
  } catch (e) {
    console.error("[mock-erp] error:", e);
    return send(res, 500, { status: false, message: "Mock server error." });
  }
});

server.listen(PORT, () => {
  console.log(`\n  mock Sathyabama ERP  →  http://localhost:${PORT}`);
  console.log(`  login:   POST http://localhost:${PORT}/api/login   { RegisterNumber, Password }`);
  console.log(`  data:    POST http://localhost:${PORT}/erp/api/v1.0/<Endpoint>   (Bearer token)`);
  console.log(`  seeded:  ${STUDENTS.length} student(s)${DEV_ALLOW_ANY ? "  + DEV_ALLOW_ANY (any login works)" : ""}`);
  console.log(`  point the app at it:  ERP_AUTH_URL=http://localhost:${PORT}  ERP_BASE_URL=http://localhost:${PORT}\n`);
});
