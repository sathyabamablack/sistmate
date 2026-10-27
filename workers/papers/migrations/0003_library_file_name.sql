-- The library's own file name for a paper ("30063.docx", "SFA1303-MAY23.doc"), read from its
-- "view" page by tools/papers/autolib-files.mjs. Many papers aren't named after their accession number.
ALTER TABLE papers ADD COLUMN file_name TEXT;
