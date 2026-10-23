import { describe, expect, it } from "vitest";
import { SectionTimeoutError, raceDeadline } from "../deadline";

describe("raceDeadline", () => {
  it("passes through a result that arrives in time", async () => {
    const controller = new AbortController();
    await expect(raceDeadline(Promise.resolve(5), controller.signal, "erp")).resolves.toBe(5);
  });

  it("passes through the work's own error", async () => {
    const controller = new AbortController();
    await expect(raceDeadline(Promise.reject(new Error("boom")), controller.signal, "erp")).rejects.toThrow("boom");
  });

  it("turns a hung call into a plain timeout message when the deadline passes", async () => {
    const controller = new AbortController();
    const hung = new Promise<never>(() => undefined);
    const race = raceDeadline(hung, controller.signal, "lms");
    controller.abort();
    await expect(race).rejects.toBeInstanceOf(SectionTimeoutError);
    await expect(race).rejects.toThrow("The LMS took too long to respond.");
  });

  it("rejects at once when the deadline already passed", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(raceDeadline(Promise.resolve(1), controller.signal, "erp")).rejects.toThrow(
      "The ERP took too long to respond.",
    );
  });
});
