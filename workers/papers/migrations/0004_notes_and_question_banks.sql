-- Notes and question banks share the papers table, its review queue and its KV files. An item's kind
-- is read from exam_type (packages/core/src/papers.ts): "notes" and "question_bank" mark those kinds
-- and every other value is a past paper's exam type, so existing rows, the library's included, stay
-- past papers without being rewritten.
-- The unit or topic a set of notes or a question bank covers, when the uploader gave one.
ALTER TABLE papers ADD COLUMN topic TEXT DEFAULT NULL;
