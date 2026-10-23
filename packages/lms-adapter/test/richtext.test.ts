import { describe, expect, it } from "vitest";
import { htmlToRichText, richTextToPlain, safeHref } from "../src/parsers/richtext";

const SITE = "https://lms.example.edu";

describe("htmlToRichText", () => {
  it("returns nothing for empty or whitespace input", () => {
    expect(htmlToRichText("")).toEqual([]);
    expect(htmlToRichText(null)).toEqual([]);
    expect(htmlToRichText("  <p> </p> ")).toEqual([]);
  });

  it("keeps paragraphs, bold, italic and code as data", () => {
    const blocks = htmlToRichText("<p>Hello <b>big</b> <em>wide</em> <code>world</code></p><p>Second</p>");
    expect(blocks).toEqual([
      {
        type: "paragraph",
        content: [
          { text: "Hello " },
          { text: "big", bold: true },
          { text: " " },
          { text: "wide", italic: true },
          { text: " " },
          { text: "world", code: true },
        ],
      },
      { type: "paragraph", content: [{ text: "Second" }] },
    ]);
  });

  it("drops script, style and iframe along with their contents", () => {
    const blocks = htmlToRichText(
      '<p>Safe</p><script>alert("x")</script><style>p{display:none}</style><iframe src="https://evil.example"></iframe><p onclick="x()">After</p>',
    );
    expect(richTextToPlain(blocks)).toBe("Safe After");
    expect(JSON.stringify(blocks)).not.toMatch(/alert|evil|onclick|display/);
  });

  it("never emits markup: tags in text are decoded, not interpreted", () => {
    const blocks = htmlToRichText("<p>1 &lt; 2 &amp;&amp; &lt;script&gt;alert(1)&lt;/script&gt;</p>");
    expect(blocks).toEqual([
      { type: "paragraph", content: [{ text: "1 < 2 && <script>alert(1)</script>" }] },
    ]);
  });

  it("builds ordered and unordered lists", () => {
    const blocks = htmlToRichText("<ul><li>One</li><li><b>Two</b></li></ul><ol><li>A</li><li>B</li></ol>");
    expect(blocks).toEqual([
      { type: "list", ordered: false, items: [[{ text: "One" }], [{ text: "Two", bold: true }]] },
      { type: "list", ordered: true, items: [[{ text: "A" }], [{ text: "B" }]] },
    ]);
  });

  it("maps headings to two levels and keeps pre blocks verbatim", () => {
    const blocks = htmlToRichText("<h2>Title</h2><h5>Small</h5><pre>a  b\n  c</pre>");
    expect(blocks[0]).toMatchObject({ type: "heading", level: 3 });
    expect(blocks[1]).toMatchObject({ type: "heading", level: 4 });
    expect(blocks[2]).toEqual({ type: "code", text: "a  b\n  c" });
  });

  it("turns <br> into a newline inside the paragraph", () => {
    const [block] = htmlToRichText("<p>line one<br>line two</p>");
    expect(block).toEqual({ type: "paragraph", content: [{ text: "line one\nline two" }] });
  });

  it("omits images and keeps surrounding text", () => {
    const blocks = htmlToRichText('<p>See <img src="@@PLUGINFILE@@/a.png" alt="a"> below</p>');
    expect(richTextToPlain(blocks)).toBe("See below");
  });

  it("copes with malformed and unclosed markup", () => {
    const blocks = htmlToRichText("<p>Open <b>bold <i>both</p><div>next");
    expect(richTextToPlain(blocks)).toBe("Open bold both next");
  });
});

describe("links", () => {
  it("keeps http(s) and mailto links", () => {
    const [block] = htmlToRichText(
      '<p><a href="https://example.org/x?a=1&amp;b=2">site</a> <a href="mailto:a@b.co">mail</a></p>',
    );
    expect(block).toMatchObject({
      content: [
        { text: "site", href: "https://example.org/x?a=1&b=2" },
        { text: " " },
        { text: "mail", href: "mailto:a@b.co" },
      ],
    });
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java&#9;script:alert(1)",
    " data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:x",
    "file:///etc/passwd",
    "#frag",
    "@@PLUGINFILE@@/file.pdf",
  ])("drops the href but keeps the text for %j", (href) => {
    const [block] = htmlToRichText(`<p><a href="${href}">label</a></p>`, { siteUrl: SITE });
    expect(block).toEqual({ type: "paragraph", content: [{ text: "label" }] });
  });

  it("resolves relative links against the site and drops pluginfile links", () => {
    expect(safeHref("/mod/forum/view.php?id=3", { siteUrl: SITE })).toBe(`${SITE}/mod/forum/view.php?id=3`);
    expect(safeHref(`${SITE}/pluginfile.php/1/x.pdf`, { siteUrl: SITE })).toBeNull();
    expect(safeHref(`${SITE}/webservice/pluginfile.php/1/x.pdf`, { siteUrl: SITE })).toBeNull();
  });

  it("points links to this site's course and assignment pages at the app", () => {
    const opts = { siteUrl: SITE, courseId: 101 };
    expect(safeHref(`${SITE}/course/view.php?id=102`, opts)).toBe("/courses/102");
    expect(safeHref(`${SITE}/mod/assign/view.php?id=5001`, opts)).toBe("/courses/101/assignments/5001");
    expect(safeHref("https://other.example/mod/assign/view.php?id=5001", opts)).toBe(
      "https://other.example/mod/assign/view.php?id=5001",
    );
  });
});
