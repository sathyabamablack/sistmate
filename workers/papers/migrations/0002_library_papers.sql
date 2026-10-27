-- Papers indexed from the library's question bank (AutoLib). Their files stay on the library server;
-- the Worker relays them when opened. source_ref holds the library's accession number.
ALTER TABLE papers ADD COLUMN department TEXT;
-- "pdf", "docx" or "doc"; learned the first time a library paper is opened.
ALTER TABLE papers ADD COLUMN file_ext TEXT;
CREATE INDEX papers_by_source ON papers (source, source_ref);
