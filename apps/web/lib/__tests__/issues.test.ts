import { describe, expect, it } from "vitest";
import { STALE_ISSUE_PREFIX, isStaleIssue, splitIssues, staleIssueMessage } from "../issues";

describe("stale issues", () => {
  it("formats the saved time in campus time with lowercase am/pm", () => {
    // 15:42 UTC is 21:12 in India.
    const message = staleIssueMessage(Date.UTC(2026, 9, 12, 15, 42));
    expect(message).toBe("Showing data saved at 9:12 pm");
    expect(message.startsWith(STALE_ISSUE_PREFIX)).toBe(true);
  });

  it("tells stale notices apart from failures", () => {
    const stale = { section: "marks", source: "erp" as const, message: staleIssueMessage(Date.now()) };
    const failed = { section: "fees", source: "erp" as const, message: "The ERP took too long to respond." };
    expect(isStaleIssue(stale)).toBe(true);
    expect(isStaleIssue(failed)).toBe(false);
    expect(splitIssues([stale, failed])).toEqual({ stale: [stale], failed: [failed] });
  });
});
