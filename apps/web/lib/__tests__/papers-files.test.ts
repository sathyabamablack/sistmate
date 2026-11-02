import { describe, expect, it } from "vitest";
import { MAX_PAGES, formatSize, isImage, isPdf, mergeFiles, moveFile } from "../../components/papers/file-merge";

const file = (name: string, type = "", size = 1000, lastModified = 1) => new File([new Uint8Array(size)], name, { type, lastModified });
const photo = (name: string, lastModified = 1) => file(name, "image/jpeg", 2000, lastModified);
const pdf = (name = "paper.pdf") => file(name, "application/pdf", 5000);

describe("file types", () => {
  it("knows PDFs and photos, by type or by extension", () => {
    expect(isPdf(pdf())).toBe(true);
    expect(isPdf(file("scan.PDF"))).toBe(true);
    expect(isPdf(photo("a.jpg"))).toBe(false);
    expect(isImage(photo("a.jpg"))).toBe(true);
    expect(isImage(file("IMG_1.HEIC"))).toBe(true);
    expect(isImage(file("notes.docx"))).toBe(false);
  });
});

describe("mergeFiles", () => {
  it("keeps adding photos in the order picked", () => {
    const first = mergeFiles([], [photo("1.jpg", 1), photo("2.jpg", 2)]);
    const second = mergeFiles(first.files, [photo("3.jpg", 3)]);
    expect(second.files.map((f) => f.name)).toEqual(["1.jpg", "2.jpg", "3.jpg"]);
    expect(second.note).toBeNull();
  });

  it("ignores the same photo picked twice", () => {
    const first = mergeFiles([], [photo("1.jpg", 1)]);
    const again = mergeFiles(first.files, [photo("1.jpg", 1), photo("2.jpg", 2)]);
    expect(again.files.map((f) => f.name)).toEqual(["1.jpg", "2.jpg"]);
  });

  it("lets a PDF replace photos, and photos replace a PDF, and says so", () => {
    const withPhotos = mergeFiles([], [photo("1.jpg")]).files;
    const toPdf = mergeFiles(withPhotos, [pdf()]);
    expect(toPdf.files.map((f) => f.name)).toEqual(["paper.pdf"]);
    expect(toPdf.note).toMatch(/replaced the photos/);
    const toPhotos = mergeFiles(toPdf.files, [photo("2.jpg", 2)]);
    expect(toPhotos.files.map((f) => f.name)).toEqual(["2.jpg"]);
    expect(toPhotos.note).toMatch(/replaced the PDF/);
  });

  it("keeps only one PDF when several arrive, and skips what is not a PDF or photo", () => {
    const result = mergeFiles([], [pdf("a.pdf"), pdf("b.pdf"), photo("c.jpg"), file("notes.docx")]);
    expect(result.files.map((f) => f.name)).toEqual(["a.pdf"]);
    expect(result.note).toMatch(/Only one PDF/);
    expect(result.note).toMatch(/1 file was skipped/);
  });

  it("leaves the list alone when nothing usable is added", () => {
    const existing = [photo("1.jpg")];
    const result = mergeFiles(existing, [file("notes.docx")]);
    expect(result.files).toBe(existing);
    expect(result.note).toMatch(/skipped/);
  });

  it("stops at the page limit", () => {
    const many = Array.from({ length: MAX_PAGES + 5 }, (_, i) => photo(`p${i}.jpg`, i));
    const result = mergeFiles([], many);
    expect(result.files).toHaveLength(MAX_PAGES);
    expect(result.note).toMatch(new RegExp(`${MAX_PAGES} pages`));
  });
});

describe("moveFile and formatSize", () => {
  it("moves a page without changing the original list", () => {
    const pages = ["a", "b", "c"];
    expect(moveFile(pages, 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveFile(pages, 0, 1)).toEqual(["b", "a", "c"]);
    expect(pages).toEqual(["a", "b", "c"]);
    expect(moveFile(pages, 0, 5)).toBe(pages);
  });
  it("formats sizes", () => {
    expect(formatSize(300)).toBe("1 KB");
    expect(formatSize(340 * 1024)).toBe("340 KB");
    expect(formatSize(2.4 * 1024 * 1024)).toBe("2.4 MB");
  });
});
