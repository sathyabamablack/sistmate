-- Question papers. Files live in KV under "paper/<id>"; a rejected paper keeps its row (and sha256,
-- so the same file can't be uploaded again) but its file is deleted.
CREATE TABLE papers (
  id            TEXT PRIMARY KEY,
  course_code   TEXT NOT NULL,
  course_title  TEXT NOT NULL DEFAULT '',
  exam_type     TEXT NOT NULL,
  year          INTEGER NOT NULL,
  month         INTEGER,
  source        TEXT NOT NULL,
  source_ref    TEXT,
  bytes         INTEGER NOT NULL,
  sha256        TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'pending',
  uploader      TEXT,           -- anonymous subject (HMAC of the register number), never the number
  reviewer      TEXT,
  reject_reason TEXT,
  downloads     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  reviewed_at   TEXT
);
CREATE INDEX papers_by_course ON papers (status, course_code, year DESC);
CREATE INDEX papers_by_uploader ON papers (uploader, created_at);

CREATE TABLE reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id   TEXT NOT NULL REFERENCES papers (id),
  reason     TEXT NOT NULL,
  reporter   TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (paper_id, reporter)
);
