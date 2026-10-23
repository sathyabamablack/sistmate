import { describe, expect, it } from "vitest";
import { courseAssignments, findCourseFile } from "@usp/core";
import { createMockLmsAdapter, mockFileBytes } from "../src/mock";

describe("mock getCourseContents", () => {
  const lms = createMockLmsAdapter();

  it("has contents for every mock course, and assignments agree with getAssignments()", async () => {
    const [courses, assignments] = await Promise.all([lms.getCourses(), lms.getAssignments()]);
    for (const course of courses) {
      const contents = await lms.getCourseContents(course.id);
      expect(contents.sections.length).toBeGreaterThan(0);
      const ids = courseAssignments(contents).map((a) => a.id);
      for (const a of assignments.filter((x) => x.courseId === course.id)) {
        expect(ids).toContain(a.id);
      }
    }
  });

  it("covers assignments in several states", async () => {
    const all = (await Promise.all([101, 102, 103, 104, 105].map((id) => lms.getCourseContents(id)))).flatMap(
      courseAssignments,
    );
    expect(all.some((a) => a.grade && a.feedback.length > 0)).toBe(true);
    expect(all.some((a) => a.submission === "submitted" && !a.grade)).toBe(true);
    expect(all.some((a) => a.submission === "draft")).toBe(true);
    expect(all.some((a) => a.submission === "none")).toBe(true);
  });

  it("resolves files by reference and serves placeholder bytes", async () => {
    const contents = await lms.getCourseContents(101);
    const syllabus = contents.sections[0]!.modules.find((m) => m.kind === "resource")!;
    const file = findCourseFile(contents, syllabus.id, "files", 0)!;
    expect(file.name).toMatch(/\.pdf$/);
    expect(findCourseFile(contents, syllabus.id, "files", 99)).toBeNull();
    expect(findCourseFile(contents, 1, "files", 0)).toBeNull();
    expect(new TextDecoder().decode(mockFileBytes(file).subarray(0, 5))).toBe("%PDF-");
  });

  it("rejects an unknown course", async () => {
    await expect(lms.getCourseContents(999)).rejects.toThrow();
  });
});
