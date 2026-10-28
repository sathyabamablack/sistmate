/**
 * SISTmate question papers API: past papers, notes and question banks ("papers" for short).
 *
 *   GET    /papers?course=A,B&kind=&type=&year=  approved papers for those subjects (admins may add &status=)
 *   GET    /subjects                           every subject with papers, for searching in the browser
 *   GET    /papers/:id/file?t=<token>           the PDF (approved, or any status for admins)
 *   PUT    /uploads?<meta>                      body = PDF; a student's upload goes to the review queue
 *   PUT    /import?<meta>&status=&source=&ref=  body = PDF; import tools only
 *   POST   /reports        { paperId, reason }  flag a paper
 *   GET    /review                              admins: pending papers and reported ones
 *   PATCH  /papers/:id     { action, reason?, meta? }   admins: approve | reject | update
 *
 * Every call carries a token from the web app (Authorization: Bearer, or ?t= for file links that
 * open in a new tab). Metadata lives in D1, files in KV ("paper/<id>"). Rules shared with the app
 * and the import tools are in packages/core/src/papers.ts.
 */
import {
  DAILY_UPLOAD_LIMIT,
  MAX_PAPER_BYTES,
  PAPER_STATUSES,
  REPORT_REASONS,
  checkMeta,
  fromStoredType,
  looksLikePdf,
  paperFileName,
  storedType,
  verifyToken,
  type Paper,
  type PaperMeta,
  type Role,
  type TokenPayload,
} from "../../../packages/core/src/papers";

interface Env {
  DB: D1Database;
  FILES: KVNamespace;
  PAPERS_SIGNING_KEY: string;
  ALLOWED_ORIGINS: string;
}

interface Row {
  id: string;
  course_code: string;
  course_title: string;
  /** A past paper's exam type, or "notes" / "question_bank" (see fromStoredType). */
  exam_type: string;
  year: number;
  month: number | null;
  source: Paper["source"];
  source_ref: string | null;
  bytes: number;
  status: Paper["status"];
  reject_reason: string | null;
  downloads: number;
  created_at: string;
  department: string | null;
  file_ext: string | null;
  file_name: string | null;
  topic: string | null;
  reports?: number;
}

/**
 * The library's file store (AutoLib, http://59.145.65.67:8080). Plain http, so the Worker relays
 * files over https. Workers may not fetch bare IP addresses, so it goes through wildcard DNS names
 * that resolve to that IP (the library has no hostname); the second is a fallback.
 */
const LIBRARY_FILES = [
  "http://59-145-65-67.sslip.io:8080/AutoLib/filePath/QUESTION%20BANK",
  "http://59.145.65.67.nip.io:8080/AutoLib/filePath/QUESTION%20BANK",
];
const LIBRARY_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
};
/** KV key of the cached subject list (GET /subjects); dropped whenever papers are approved or rejected. */
const SUBJECTS_KEY = "cache/subjects";

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });

const fail = (status: number, error: string) => json({ error }, status);

/** The details a download name needs. */
const nameMeta = (r: Row) => ({ courseCode: r.course_code, ...fromStoredType(r.exam_type), year: r.year, month: r.month });

function toPaper(r: Row, admin: boolean): Paper {
  const p: Paper = {
    id: r.id,
    courseCode: r.course_code,
    courseTitle: r.course_title,
    ...fromStoredType(r.exam_type),
    year: r.year,
    month: r.month,
    topic: r.topic ?? null,
    source: r.source,
    status: r.status,
    bytes: r.bytes,
    downloads: r.downloads,
    createdAt: r.created_at,
    department: r.department,
    fileType: r.source === "autolib" ? (r.file_name ? (/\.([a-z0-9]+)$/i.exec(r.file_name)?.[1]?.toLowerCase() ?? null) : r.file_ext) : "pdf",
  };
  if (admin) {
    p.rejectReason = r.reject_reason;
    p.sourceRef = r.source_ref;
    p.reports = r.reports ?? 0;
  }
  return p;
}

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  if (!allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Content-SHA256",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

async function auth(req: Request, url: URL, env: Env, roles: Role[]): Promise<TokenPayload | Response> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : url.searchParams.get("t") ?? "";
  const payload = await verifyToken(token, env.PAPERS_SIGNING_KEY);
  if (!payload) return fail(401, "Your session ended. Reload the page.");
  if (!roles.includes(payload.role)) return fail(403, "Not allowed.");
  return payload;
}

const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);
const now = () => new Date().toISOString();

async function listPapers(url: URL, env: Env, who: TokenPayload): Promise<Response> {
  const admin = who.role === "admin";
  const where: string[] = [];
  const args: unknown[] = [];

  const status = url.searchParams.get("status");
  if (admin && status && (PAPER_STATUSES as readonly string[]).includes(status)) {
    where.push("status = ?");
    args.push(status);
  } else {
    where.push("status = 'approved'");
  }

  const courses = (url.searchParams.get("course") ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^S[A-Z0-9]{5,10}$/.test(c))
    .slice(0, 40);
  if (courses.length) {
    where.push(`course_code IN (${courses.map(() => "?").join(",")})`);
    args.push(...courses);
  }

  const kind = url.searchParams.get("kind");
  if (kind === "paper") {
    where.push("exam_type NOT IN ('notes', 'question_bank')");
  } else if (kind === "notes" || kind === "question_bank") {
    where.push("exam_type = ?");
    args.push(kind);
  }
  const type = url.searchParams.get("type");
  if (type) {
    where.push("exam_type = ?");
    args.push(type);
  }
  const year = Number(url.searchParams.get("year"));
  if (Number.isInteger(year) && year > 1999) {
    where.push("year = ?");
    args.push(year);
  }
  // Every query needs subject codes (from the student's subjects or from GET /subjects), so it
  // always uses the course index: D1 bills for rows read, and a text search would read them all.
  if (!courses.length && !(admin && status)) return json({ papers: [] });

  const { results } = await env.DB.prepare(
    `SELECT * FROM papers WHERE ${where.join(" AND ")} ORDER BY course_code, year DESC, month DESC LIMIT 300`,
  )
    .bind(...args)
    .all<Row>();
  return json({ papers: results.map((r) => toPaper(r, admin)) });
}

/**
 * A library paper, fetched from the library and passed through. The library's file names are
 * "<accession>.<ext>" with the extension not in its listing, so the first open tries each kind
 * and remembers the one that exists.
 */
/** The library's answer for one file name, trying each DNS name; null when every one failed to connect. */
async function fetchFromLibrary(file: string): Promise<Response | null> {
  for (const base of LIBRARY_FILES) {
    try {
      const res = await fetch(`${base}/${file}`, { signal: AbortSignal.timeout(20_000) });
      // A 403 here is Cloudflare refusing the route (e.g. DNS name down), not the library: try the next.
      if (res.status !== 403) return res;
      await res.body?.cancel();
    } catch {
      /* timeout or DNS failure: try the next name */
    }
  }
  return null;
}

async function serveLibraryFile(row: Row, env: Env, ctx: ExecutionContext): Promise<Response> {
  // The real name when tools/papers/autolib-files.mjs found it, else "<accession>.<ext>" guesses.
  const known = row.file_name ? /\.([a-z0-9]+)$/i.exec(row.file_name)?.[1]?.toLowerCase() : undefined;
  const tries: { file: string; ext: string }[] = row.file_name
    ? [{ file: encodeURIComponent(row.file_name), ext: known ?? "" }]
    : (row.file_ext ? [row.file_ext] : ["docx", "pdf", "doc"]).map((ext) => ({ file: `${encodeURIComponent(row.source_ref ?? "")}.${ext}`, ext }));
  for (const { file, ext } of tries) {
    const upstream = await fetchFromLibrary(file);
    if (!upstream) return fail(502, "The library's server isn't answering right now. Try again in a minute.");
    const type = upstream.headers.get("Content-Type") ?? "";
    if (!upstream.ok || type.startsWith("text/html")) {
      await upstream.body?.cancel();
      continue;
    }
    if (row.file_ext !== ext) ctx.waitUntil(env.DB.prepare("UPDATE papers SET file_ext = ? WHERE id = ?").bind(ext, row.id).run());
    ctx.waitUntil(env.DB.prepare("UPDATE papers SET downloads = downloads + 1 WHERE id = ?").bind(row.id).run());
    const name = paperFileName(nameMeta(row)).replace(/\.pdf$/, `.${ext}`);
    return new Response(upstream.body, {
      headers: {
        "Content-Type": LIBRARY_TYPES[ext] ?? "application/octet-stream",
        // PDFs open in the browser; Word files download and open in Word or Docs.
        "Content-Disposition": `${ext === "pdf" ? "inline" : "attachment"}; filename="${name}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
  return fail(404, "The library no longer has this file.");
}

/** Every subject with approved papers, for searching in the browser. Cached in KV for 6 hours. */
async function subjects(env: Env): Promise<Response> {
  const cached = await env.FILES.get(SUBJECTS_KEY);
  if (cached) return new Response(cached, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, max-age=600" } });
  const { results } = await env.DB.prepare(
    `SELECT course_code AS code, MAX(course_title) AS title, COUNT(*) AS papers
       FROM papers WHERE status = 'approved' GROUP BY course_code ORDER BY course_code`,
  ).all<{ code: string; title: string; papers: number }>();
  const body = JSON.stringify({ subjects: results });
  await env.FILES.put(SUBJECTS_KEY, body, { expirationTtl: 6 * 3600 });
  return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, max-age=600" } });
}

async function serveFile(id: string, env: Env, who: TokenPayload, ctx: ExecutionContext): Promise<Response> {
  const row = await env.DB.prepare("SELECT * FROM papers WHERE id = ?").bind(id).first<Row>();
  if (!row || (row.status !== "approved" && who.role !== "admin")) return fail(404, "Paper not found.");
  if (row.source === "autolib") return serveLibraryFile(row, env, ctx);
  const file = await env.FILES.get(`paper/${id}`, { type: "stream" });
  if (!file) return fail(404, "File not found.");
  if (row.status === "approved") ctx.waitUntil(env.DB.prepare("UPDATE papers SET downloads = downloads + 1 WHERE id = ?").bind(id).run());
  return new Response(file, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${paperFileName(nameMeta(row))}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
      "Referrer-Policy": "no-referrer",
    },
  });
}

/** Stores the request body as a paper. Shared by student uploads and the import tools. */
async function storePaper(
  req: Request,
  env: Env,
  meta: PaperMeta,
  opts: { status: Paper["status"]; source: Paper["source"]; sourceRef: string | null; uploader: string },
): Promise<Response> {
  const length = Number(req.headers.get("Content-Length"));
  if (!req.body || !Number.isInteger(length) || length <= 0) return fail(411, "The file is empty.");
  if (length > MAX_PAPER_BYTES) return fail(413, "That file is over 20 MB.");
  const sha256 = (req.headers.get("X-Content-SHA256") ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) return fail(400, "Missing file checksum.");

  const existing = await env.DB.prepare("SELECT id, status FROM papers WHERE sha256 = ?").bind(sha256).first<{ id: string; status: string }>();
  if (existing) return json({ error: "This paper is already on SISTmate.", id: existing.id, status: existing.status }, 409);

  const id = newId();
  const key = `paper/${id}`;
  const { readable, writable } = new FixedLengthStream(length);
  const piping = req.body.pipeTo(writable);
  await env.FILES.put(key, readable);
  await piping;

  // Check the stored bytes really are a PDF before anyone can open them.
  const stored = await env.FILES.get(key, { type: "stream" });
  const head = stored ? (await stored.getReader().read()).value : undefined;
  if (!head || !looksLikePdf(head.slice(0, 5))) {
    await env.FILES.delete(key);
    return fail(415, "Only PDF files can be uploaded.");
  }

  try {
    await env.DB.prepare(
      `INSERT INTO papers (id, course_code, course_title, exam_type, year, month, topic, source, source_ref, bytes, sha256, status, uploader, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, meta.courseCode, meta.courseTitle, storedType(meta), meta.year, meta.month, meta.topic, opts.source, opts.sourceRef, length, sha256, opts.status, opts.uploader, now())
      .run();
  } catch (err) {
    // Two people sharing the same file at the same moment both pass the check above.
    await env.FILES.delete(key);
    if (String(err).includes("UNIQUE")) return json({ error: "This paper is already on SISTmate." }, 409);
    throw err;
  }
  return json({ id, status: opts.status }, 201);
}

function metaFromQuery(url: URL) {
  const p = url.searchParams;
  return checkMeta({
    courseCode: p.get("courseCode") ?? "",
    courseTitle: p.get("courseTitle") ?? "",
    kind: p.get("kind") ?? "",
    examType: p.get("examType") ?? "",
    year: p.get("year") ?? "",
    month: p.get("month") ?? "",
    topic: p.get("topic") ?? "",
  });
}

async function upload(req: Request, url: URL, env: Env, who: TokenPayload): Promise<Response> {
  const meta = metaFromQuery(url);
  if (!meta.ok) return fail(400, meta.error);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM papers WHERE uploader = ? AND created_at > ?").bind(who.sub, since).first<{ n: number }>();
  if ((recent?.n ?? 0) >= DAILY_UPLOAD_LIMIT) return fail(429, `You can share ${DAILY_UPLOAD_LIMIT} files a day. Try again tomorrow.`);
  return storePaper(req, env, meta.value, { status: "pending", source: "student", sourceRef: null, uploader: who.sub });
}

async function importPaper(req: Request, url: URL, env: Env, who: TokenPayload): Promise<Response> {
  const meta = metaFromQuery(url);
  if (!meta.ok) return fail(400, meta.error);
  const status = url.searchParams.get("status") === "approved" ? "approved" : "pending";
  const source = url.searchParams.get("source") === "autolib" ? "autolib" : "import";
  const ref = (url.searchParams.get("ref") ?? "").slice(0, 300) || null;
  return storePaper(req, env, meta.value, { status, source, sourceRef: ref, uploader: who.sub });
}

async function report(req: Request, env: Env, who: TokenPayload): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { paperId?: unknown; reason?: unknown };
  const reason = String(body.reason ?? "");
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) return fail(400, "Pick a reason.");
  const paper = await env.DB.prepare("SELECT id FROM papers WHERE id = ? AND status = 'approved'").bind(String(body.paperId ?? "")).first();
  if (!paper) return fail(404, "Paper not found.");
  await env.DB.prepare("INSERT OR IGNORE INTO reports (paper_id, reason, reporter, created_at) VALUES (?, ?, ?, ?)")
    .bind(String(body.paperId), reason, who.sub, now())
    .run();
  return json({ ok: true });
}

async function review(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM reports r WHERE r.paper_id = p.id) AS reports
       FROM papers p
      WHERE p.status = 'pending' OR (p.status = 'approved' AND EXISTS (SELECT 1 FROM reports r WHERE r.paper_id = p.id))
      ORDER BY p.status DESC, p.created_at
      LIMIT 200`,
  ).all<Row>();
  const reasons = await env.DB.prepare("SELECT paper_id, reason, COUNT(*) AS n FROM reports GROUP BY paper_id, reason").all<{
    paper_id: string;
    reason: string;
    n: number;
  }>();
  return json({ papers: results.map((r) => toPaper(r, true)), reports: reasons.results });
}

async function moderate(id: string, req: Request, env: Env, who: TokenPayload): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { action?: string; reason?: string; meta?: Record<string, unknown> };
  const row = await env.DB.prepare("SELECT * FROM papers WHERE id = ?").bind(id).first<Row>();
  if (!row) return fail(404, "Paper not found.");

  if (body.action === "approve") {
    await env.DB.prepare("UPDATE papers SET status = 'approved', reviewer = ?, reviewed_at = ?, reject_reason = NULL WHERE id = ?").bind(who.sub, now(), id).run();
    await env.DB.prepare("DELETE FROM reports WHERE paper_id = ?").bind(id).run();
  } else if (body.action === "reject") {
    const reason = String(body.reason ?? "").slice(0, 200) || "Rejected";
    await env.FILES.delete(`paper/${id}`);
    await env.DB.prepare("UPDATE papers SET status = 'rejected', reviewer = ?, reviewed_at = ?, reject_reason = ? WHERE id = ?").bind(who.sub, now(), reason, id).run();
    await env.DB.prepare("DELETE FROM reports WHERE paper_id = ?").bind(id).run();
  } else if (body.action === "update") {
    const meta = checkMeta({ ...body.meta });
    if (!meta.ok) return fail(400, meta.error);
    const m = meta.value;
    await env.DB.prepare("UPDATE papers SET course_code = ?, course_title = ?, exam_type = ?, year = ?, month = ?, topic = ? WHERE id = ?")
      .bind(m.courseCode, m.courseTitle, storedType(m), m.year, m.month, m.topic, id)
      .run();
  } else {
    return fail(400, "Unknown action.");
  }
  await env.FILES.delete(SUBJECTS_KEY);
  const updated = await env.DB.prepare("SELECT * FROM papers WHERE id = ?").bind(id).first<Row>();
  return json({ paper: updated ? toPaper(updated, true) : null });
}

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const fileMatch = /^\/papers\/([a-z0-9]{16})\/file$/.exec(path);
  const paperMatch = /^\/papers\/([a-z0-9]{16})$/.exec(path);

  if (req.method === "GET" && path === "/papers") {
    const who = await auth(req, url, env, ["student", "admin"]);
    return who instanceof Response ? who : listPapers(url, env, who);
  }
  if (req.method === "GET" && path === "/subjects") {
    const who = await auth(req, url, env, ["student", "admin"]);
    return who instanceof Response ? who : subjects(env);
  }
  if (req.method === "GET" && fileMatch?.[1]) {
    const who = await auth(req, url, env, ["student", "admin"]);
    return who instanceof Response ? who : serveFile(fileMatch[1], env, who, ctx);
  }
  if (req.method === "PUT" && path === "/uploads") {
    const who = await auth(req, url, env, ["student", "admin"]);
    return who instanceof Response ? who : upload(req, url, env, who);
  }
  if (req.method === "PUT" && path === "/import") {
    const who = await auth(req, url, env, ["importer"]);
    return who instanceof Response ? who : importPaper(req, url, env, who);
  }
  if (req.method === "POST" && path === "/reports") {
    const who = await auth(req, url, env, ["student", "admin"]);
    return who instanceof Response ? who : report(req, env, who);
  }
  if (req.method === "GET" && path === "/review") {
    const who = await auth(req, url, env, ["admin"]);
    return who instanceof Response ? who : review(env);
  }
  if (req.method === "PATCH" && paperMatch?.[1]) {
    const who = await auth(req, url, env, ["admin"]);
    return who instanceof Response ? who : moderate(paperMatch[1], req, env, who);
  }
  if (path === "" || path === "/") return json({ service: "sistmate-papers" });
  return fail(404, "Not found.");
}

/**
 * The ERP signs students in through a login service on Render's free tier, which sleeps after
 * 15 idle minutes and then makes the next sign-in time out. A cron (wrangler.jsonc) keeps it awake.
 */
const ERP_LOGIN_SERVICE = "https://erp-backend-m6pu.onrender.com/";

async function wakeErpLogin(): Promise<void> {
  try {
    const res = await fetch(ERP_LOGIN_SERVICE, { signal: AbortSignal.timeout(60_000) });
    await res.body?.cancel();
    console.log(`erp login service: ${res.status}`);
  } catch (err) {
    console.warn(`erp login service did not answer: ${String(err)}`);
  }
}

export default {
  async scheduled(_event: ScheduledController, _env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(wakeErpLogin());
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: cors["Access-Control-Allow-Origin"] ? 204 : 403, headers: cors });
    let res: Response;
    try {
      res = await route(req, env, ctx);
    } catch (err) {
      console.error(err);
      res = fail(500, "Something went wrong. Try again.");
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
} satisfies ExportedHandler<Env>;
