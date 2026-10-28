import type { Page } from "@playwright/test";
import { test, expect, pageHeading, waitForHydration } from "./helpers";

/**
 * OD and medical leave tracker (/attendance/od). The mock ERP marks whole days absent
 * (the first class day on or after the 6th and the 20th of each month) and everything
 * else present, so the days used here are found through the hour-wise endpoint
 * instead of being fixed dates.
 */

interface Day {
  date: string;
  totalHours: number;
  present: number;
  absent: number;
  notGiven: number;
}

const DAY_MS = 86_400_000;
const campusToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysSince = (date: string) => Math.round((Date.parse(`${campusToday()}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY_MS);
/** Same wording as lib/attendance-days formatDay: "Tue, 20 Oct". */
const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

/** The signed-in student's hour-wise days for the 100 days before today, oldest first. */
async function recentDays(page: Page): Promise<Day[]> {
  const today = campusToday();
  const res = await page.request.get(`/api/attendance/hourly?from=${addDays(today, -100)}&to=${addDays(today, -1)}`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { days: Day[] }).days;
}

/** Captures what "Copy for your class advisor" hands to the share sheet or the clipboard. */
async function captureSharing(page: Page) {
  await page.addInitScript(() => {
    const sent: string[] = [];
    (window as unknown as { __odSent: string[] }).__odSent = sent;
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => void sent.push(data.text ?? "") });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => void sent.push(text) },
    });
  });
}

test.describe("OD tracker: hour-wise endpoint", () => {
  test("answers 401 when signed out", async ({ request }) => {
    const res = await request.get("/api/attendance/hourly?from=2026-10-01&to=2026-10-10");
    expect(res.status()).toBe(401);
  });

  test("validates the range and caps it at 120 days", async ({ loggedInPage: page }) => {
    const today = campusToday();
    const get = (query: string) => page.request.get(`/api/attendance/hourly?${query}`);
    for (const bad of ["", "from=2026-10-01", "from=2026-10-10&to=2026-10-01", "from=2026-02-30&to=2026-03-02", "from=x&to=y"]) {
      expect((await get(bad)).status(), bad).toBe(400);
    }
    expect((await get(`from=${addDays(today, -121)}&to=${addDays(today, -1)}`)).status()).toBe(400); // 121 days
    expect((await get(`from=${addDays(today, -120)}&to=${addDays(today, -1)}`)).status()).toBe(200); // 120 days
    // The limit is on the range asked for; a 120-day range that runs past today is cut at today.
    expect((await get(`from=${addDays(today, -119)}&to=${addDays(today, 5)}`)).status()).toBe(400);
    const res = await get(`from=${addDays(today, -115)}&to=${addDays(today, 4)}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("no-store");
    const body = (await res.json()) as { from: string; to: string; days: Day[] };
    expect(body.to).toBe(today);
    expect(body.days.length).toBeGreaterThan(30);
    const dates = body.days.map((d) => d.date);
    expect(dates).toEqual([...dates].sort());
    expect(dates.every((d) => d >= body.from && d <= today)).toBe(true);
  });
});

test.describe("OD tracker", () => {
  test("logs an OD for an absent day, shows what it covers and the projection, edits, deletes with undo, and keeps it", async ({
    loggedInPage: page,
  }) => {
    test.slow();
    await captureSharing(page);
    const absent = (await recentDays(page)).filter((d) => d.absent > 0 && d.absent === d.totalHours).at(-1)!;
    expect(absent, "the mock ERP has a whole absent day in the last 100 days").toBeTruthy();
    const label = dayLabel(absent.date);
    const waited = daysSince(absent.date);

    await page.goto("/attendance/od");
    await expect(pageHeading(page, "OD and medical leave")).toBeVisible();
    await waitForHydration(page);
    const main = page.getByRole("main");
    await expect(main.getByText("No OD or leave logged")).toBeVisible();

    // Log it: On duty is the default type, whole day the default span.
    await main.getByRole("button", { name: "Log an OD or leave" }).click();
    const dialog = page.getByRole("dialog", { name: "Log an OD or leave" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("radio", { name: "On duty" })).toBeChecked();
    await dialog.getByLabel("Date").fill(absent.date);
    await expect(dialog.getByText(`Covers ${absent.totalHours} hours`)).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: "Counts as attended" })).toBeChecked();
    await dialog.getByLabel(/^Note/).fill("Hackathon at IIT Madras");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    // The ERP still shows it absent: not updated yet, with its age and the subjects it covers.
    const waiting = main.getByRole("region", { name: "Waiting for the ERP" });
    const entry = waiting.getByTestId("od-entry").filter({ hasText: "Hackathon at IIT Madras" });
    await expect(entry.getByRole("heading", { name: label })).toBeVisible();
    await expect(entry).toContainText(`On duty · Whole day · ${absent.totalHours} hours`);
    await expect(entry.getByText(waited > 0 ? `Not updated yet, ${waited} ${waited === 1 ? "day" : "days"}` : "Not updated yet")).toBeVisible();
    if (waited > 7) await expect(entry.getByText(/Worth a reminder to your class advisor/)).toBeVisible();
    await entry.getByRole("button", { name: "Hour by hour" }).click();
    await expect(entry.getByText(/^Hour \d+$/)).toHaveCount(absent.totalHours);
    await expect(entry.getByText("Absent", { exact: true })).toHaveCount(absent.totalHours);
    await expect(main.getByTestId("od-headline")).toHaveText("1 entry not updated in the ERP yet");

    // Attendance once the ERP catches up: every subject of that day, now -> after.
    const projection = main.getByRole("region", { name: "Attendance after your ODs" });
    await expect(projection).toBeVisible();
    await expect(projection.getByText(new RegExp(`Overall .* once the ERP updates ${absent.totalHours} hours`))).toBeVisible();
    const rows = projection.getByRole("listitem");
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(rows.first()).toContainText(/hours? to update/);
    await expect(rows.first().getByLabel(/% now, .*% after/)).toBeVisible();

    // A plain-text list for the class advisor.
    await main.getByRole("button", { name: "Copy for your class advisor" }).click();
    await expect(page.getByTestId("od-toast")).toHaveText(/^(Copied|Shared)\./);
    const sent = await page.evaluate(() => (window as unknown as { __odSent: string[] }).__odSent);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("OD and leave not yet updated in the ERP");
    expect(sent[0]).toContain(`1. On duty: ${label}`);
    expect(sent[0]).toContain(`Hours 1–${absent.totalHours}: `);
    expect(sent[0]).toContain("Note: Hackathon at IIT Madras");

    // Edit: just the first two hours.
    await entry.getByRole("button", { name: `Edit On duty, ${label}` }).click();
    const edit = page.getByRole("dialog", { name: "Edit entry" });
    await expect(edit.getByLabel("Date")).toHaveValue(absent.date);
    await edit.getByText("Some hours").click();
    await edit.getByRole("checkbox", { name: /^Hour 1,/ }).check({ force: true });
    await edit.getByRole("checkbox", { name: /^Hour 2,/ }).check({ force: true });
    await expect(edit.getByText("Covers 2 hours")).toBeVisible();
    await edit.getByRole("button", { name: "Save changes" }).click();
    await expect(edit).toBeHidden();
    await expect(entry).toContainText("On duty · Hours 1, 2 · 2 hours");
    await expect(projection.getByText(/once the ERP updates 2 hours/)).toBeVisible();

    // Delete, then undo.
    await entry.getByRole("button", { name: `Delete On duty, ${label}` }).click();
    await expect(main.getByTestId("od-entry")).toHaveCount(0);
    await expect(page.getByTestId("od-undo")).toContainText(`Deleted On duty, ${label}`);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(entry).toBeVisible();
    await expect(entry.getByRole("button", { name: `Edit On duty, ${label}` })).toBeFocused();

    // Saved in this browser: still there after a reload.
    await page.reload();
    await waitForHydration(page);
    await expect(main.getByTestId("od-entry")).toHaveCount(1);
    await expect(entry).toContainText("On duty · Hours 1, 2 · 2 hours");
    await expect(main.getByText("Saved on this device only.")).toBeVisible();
  });

  test("an entry for a day the ERP shows present reads as updated", async ({ loggedInPage: page }) => {
    const present = (await recentDays(page)).filter((d) => d.absent === 0 && d.notGiven === 0 && d.present > 0).at(-1)!;
    await page.goto("/attendance/od");
    await waitForHydration(page);
    const main = page.getByRole("main");
    await main.getByRole("button", { name: "Log an OD or leave" }).click();
    const dialog = page.getByRole("dialog", { name: "Log an OD or leave" });
    await dialog.getByRole("radio", { name: "Medical leave" }).check({ force: true });
    // Leave is not counted as attended unless the student says so.
    await expect(dialog.getByRole("checkbox", { name: "Counts as attended" })).not.toBeChecked();
    await dialog.getByLabel("Date").fill(present.date);
    await dialog.getByRole("button", { name: "Save" }).click();

    const updated = main.getByRole("region", { name: "Updated in the ERP" });
    await expect(updated.getByRole("heading", { name: dayLabel(present.date) })).toBeVisible();
    await expect(updated.getByText("Updated in ERP")).toBeVisible();
    await expect(main.getByTestId("od-headline")).toHaveText("All updated in the ERP");
    await expect(main.getByRole("button", { name: "Copy for your class advisor" })).toHaveCount(0);
  });

  test("checks entries older than the dashboard's two weeks through the endpoint", async ({ loggedInPage: page }) => {
    const today = campusToday();
    const old = (await recentDays(page)).filter((d) => d.absent > 0 && d.date < addDays(today, -20)).at(-1)!;
    await page.addInitScript((date) => {
      if (localStorage.getItem("usp-od-v1")) return;
      localStorage.setItem(
        "usp-od-v1",
        JSON.stringify({ v: 1, entries: [{ id: "old", kind: "od", from: date, to: date, hours: null, note: "Football", counted: true, createdAt: "" }] }),
      );
    }, old.date);
    const asked = page.waitForRequest((r) => r.url().includes("/api/attendance/hourly?"));
    await page.goto("/attendance/od");
    expect(new URL((await asked).url()).searchParams.get("from")).toBe(old.date);
    const entry = page.getByTestId("od-entry").filter({ hasText: "Football" });
    await expect(entry.getByText(`Not updated yet, ${daysSince(old.date)} days`)).toBeVisible();
  });
});
