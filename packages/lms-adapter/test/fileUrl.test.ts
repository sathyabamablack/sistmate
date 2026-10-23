import { describe, expect, it } from "vitest";
import {
  canViewInline,
  contentDisposition,
  isSameMoodleHost,
  resolveMoodleFileUrl,
  safeFilename,
  servedContentType,
} from "../src/fileUrl";

const BASE = "https://lms.example.edu";
const TOKEN = "tok123";
const ok = (u: string, base = BASE) => resolveMoodleFileUrl(u, base, TOKEN);

describe("resolveMoodleFileUrl", () => {
  it("adds the token to a webservice pluginfile URL on the configured host", () => {
    const out = ok(`${BASE}/webservice/pluginfile.php/12/mod_resource/content/1/a%20b.pdf?forcedownload=1`);
    expect(out).toBe(
      `${BASE}/webservice/pluginfile.php/12/mod_resource/content/1/a%20b.pdf?forcedownload=1&token=${TOKEN}`,
    );
  });

  it("rewrites plain pluginfile.php to the token-capable webservice endpoint", () => {
    expect(ok(`${BASE}/pluginfile.php/12/mod_resource/content/1/a.pdf`)).toBe(
      `${BASE}/webservice/pluginfile.php/12/mod_resource/content/1/a.pdf?token=${TOKEN}`,
    );
  });

  it("replaces a token already present in the URL", () => {
    const out = ok(`${BASE}/webservice/pluginfile.php/1/a.pdf?token=attacker`)!;
    expect(new URL(out).searchParams.getAll("token")).toEqual([TOKEN]);
  });

  it("supports Moodle installed under a sub-path", () => {
    const base = "https://uni.example/moodle/";
    expect(ok("https://uni.example/moodle/webservice/pluginfile.php/1/a.pdf", base)).toBe(
      `https://uni.example/moodle/webservice/pluginfile.php/1/a.pdf?token=${TOKEN}`,
    );
    expect(ok("https://uni.example/webservice/pluginfile.php/1/a.pdf", base)).toBeNull();
  });

  it.each([
    ["another host", "https://evil.example/webservice/pluginfile.php/1/a.pdf"],
    ["a look-alike suffix host", "https://lms.example.edu.evil.example/webservice/pluginfile.php/1/a.pdf"],
    ["embedded credentials", "https://lms.example.edu@evil.example/webservice/pluginfile.php/1/a.pdf"],
    ["credentials on the real host", "https://user:pw@lms.example.edu/webservice/pluginfile.php/1/a.pdf"],
    ["a different port", "https://lms.example.edu:8443/webservice/pluginfile.php/1/a.pdf"],
    ["a scheme downgrade", "http://lms.example.edu/webservice/pluginfile.php/1/a.pdf"],
    ["a non-http scheme", "file:///etc/passwd"],
    ["a javascript URL", "javascript:alert(1)"],
    ["a protocol-relative URL", "//evil.example/webservice/pluginfile.php/1/a.pdf"],
    ["an internal address", "https://169.254.169.254/webservice/pluginfile.php/1/a.pdf"],
    ["a non-file Moodle endpoint", `${BASE}/login/token.php`],
    ["the web-service endpoint", `${BASE}/webservice/rest/server.php?wsfunction=core_webservice_get_site_info`],
    ["traversal out of pluginfile", `${BASE}/webservice/pluginfile.php/../../login/index.php`],
    ["garbage", "not a url"],
    ["an empty string", ""],
  ])("rejects %s", (_name, url) => {
    expect(ok(url)).toBeNull();
  });

  it("refuses to build anything without a token or with a bad base", () => {
    expect(resolveMoodleFileUrl(`${BASE}/webservice/pluginfile.php/1/a.pdf`, BASE, "")).toBeNull();
    expect(ok(`${BASE}/webservice/pluginfile.php/1/a.pdf`, "ftp://lms.example.edu")).toBeNull();
    expect(ok(`${BASE}/webservice/pluginfile.php/1/a.pdf`, "nonsense")).toBeNull();
  });
});

describe("isSameMoodleHost", () => {
  it("compares scheme and host", () => {
    expect(isSameMoodleHost(`${BASE}/x`, BASE)).toBe(true);
    expect(isSameMoodleHost("https://evil.example/x", BASE)).toBe(false);
    expect(isSameMoodleHost("junk", BASE)).toBe(false);
  });
});

describe("download headers", () => {
  it("sanitises filenames", () => {
    expect(safeFilename('..\\..\\evil"name?.pdf')).toBe("_.._evil_name_.pdf");
    expect(safeFilename("line\r\nbreak.txt")).toBe("line_break.txt");
    expect(safeFilename("")).toBe("download");
    expect(safeFilename(null)).toBe("download");
    expect(safeFilename("a".repeat(500)).length).toBe(140);
  });

  it("builds a header that cannot be split or broken out of", () => {
    const h = contentDisposition('na"me\r\nX-Injected: 1.pdf', false);
    expect(h).not.toMatch(/[\r\n]/);
    expect(h.startsWith('attachment; filename="')).toBe(true);
    expect(h).not.toMatch(/filename="[^"]*"[^;]*"/);
  });

  it("encodes non-ASCII names with filename*", () => {
    const h = contentDisposition("Unit 1 – வரைபடம்.pdf", true);
    expect(h).toContain("inline;");
    expect(h).toContain("filename*=UTF-8''Unit%201%20%E2%80%93");
    expect(h).toMatch(/filename="[\x20-\x7e]*"/);
  });

  it("only lets safe types render in the browser", () => {
    expect(canViewInline("application/pdf")).toBe(true);
    expect(canViewInline("image/png")).toBe(true);
    expect(canViewInline("text/html")).toBe(false);
    expect(canViewInline("image/svg+xml")).toBe(false);
    expect(canViewInline(null)).toBe(false);
  });

  it("downgrades types that could run script on our origin", () => {
    expect(servedContentType("text/html; charset=utf-8")).toBe("application/octet-stream");
    expect(servedContentType("image/svg+xml")).toBe("application/octet-stream");
    expect(servedContentType("application/javascript")).toBe("application/octet-stream");
    expect(servedContentType(null)).toBe("application/octet-stream");
    expect(servedContentType("application/pdf")).toBe("application/pdf");
  });
});
