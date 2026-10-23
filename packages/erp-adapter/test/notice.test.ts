import { describe, expect, it } from "vitest";
import { noticeDate, parseNotice } from "../src/notice";

describe("ERP notice parsing", () => {
  it("reduces HTML to text and never keeps markup", () => {
    const n = parseNotice('<p>Hello <b>world</b></p><script>alert(1)</script><p>Line&nbsp;two &lt;ok&gt;</p>');
    expect(n.title).toBe("Hello world");
    expect(n.body).toBe("Line two <ok>");
  });

  it("only accepts http(s) image and link URLs", () => {
    const n = parseNotice('<img src="javascript:alert(1)"><a href="data:text/html,x">x</a><p>t</p>');
    expect(n.imageUrl).toBeUndefined();
    expect(n.link).toBeUndefined();
  });

  it("truncates a long first line but keeps it whole in the body", () => {
    const long = "word ".repeat(60).trim();
    const n = parseNotice(`<p>${long}</p>`);
    expect(n.title.endsWith("…")).toBe(true);
    expect(n.body).toBe(long);
  });

  it("handles image-only notices", () => {
    expect(parseNotice('<img src="https://x.test/a.png">')).toMatchObject({
      title: "Notice (poster)",
      imageUrl: "https://x.test/a.png",
    });
  });

  it("parses dd/mm/yyyy and 12-hour times as campus time", () => {
    expect(noticeDate("09/10/2026", "11:36 AM")).toBe("2026-10-09T11:36:00+05:30");
    expect(noticeDate("1/2/2026", "12:05 PM")).toBe("2026-02-01T12:05:00+05:30");
    expect(noticeDate("1/2/2026", "12:05 AM")).toBe("2026-02-01T00:05:00+05:30");
    expect(noticeDate("garbage", "11:00 AM")).toBeNull();
  });
});
