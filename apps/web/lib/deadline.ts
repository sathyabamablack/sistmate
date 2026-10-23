/**
 * Helpers for the shared per-request time budget used by lib/data.ts.
 * Pure (no Next.js imports) so they can be unit tested.
 */

export type PortalSource = "erp" | "lms";

export class SectionTimeoutError extends Error {
  constructor(source: PortalSource) {
    super(`${source === "erp" ? "The ERP" : "The LMS"} took too long to respond.`);
    this.name = "SectionTimeoutError";
  }
}

/** A section came back in a shape the app does not understand. */
export class SectionShapeError extends Error {
  constructor(source: PortalSource) {
    super(`${source === "erp" ? "The ERP" : "The LMS"} sent data in an unexpected format.`);
    this.name = "SectionShapeError";
  }
}

/**
 * Settles with `work`, or rejects with a {@link SectionTimeoutError} as soon as
 * `deadline` aborts, even if `work` never settles (a hung socket, say).
 */
export function raceDeadline<T>(work: Promise<T>, deadline: AbortSignal, source: PortalSource): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (deadline.aborted) {
      reject(new SectionTimeoutError(source));
      work.catch(() => undefined); // already abandoned: swallow its eventual rejection
      return;
    }
    const onAbort = () => reject(new SectionTimeoutError(source));
    deadline.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => deadline.removeEventListener("abort", onAbort));
  });
}
