import type { BrowserContext, Page } from "@playwright/test";
import { expect, test, waitForHydration } from "./helpers";
import { BRIEF_COOKIE, campusDayKey, markKey, parseBriefMemory, serializeBriefMemory, type BriefMemory } from "@/lib/brief";

/**
 * The dashboard's "To do today" brief (lib/brief.ts). The mock's CIA-2 exam (Operating
 * Systems) is always 11 days out, so the brief always has its prep line. The attendance
 * line depends on the real weekday and time, so it is only checked when it shows.
 */

const brief = (page: Page) => page.getByRole("main").getByRole("region", { name: "To do today" });
const DAY_MS = 86_400_000;
const yesterday = () => campusDayKey(new Date(Date.now() - DAY_MS));

async function readMemory(context: BrowserContext): Promise<BriefMemory | null> {
  const c = (await context.cookies()).find((x) => x.name === BRIEF_COOKIE);
  return c ? parseBriefMemory(c.value) : null;
}

async function writeMemory(context: BrowserContext, baseURL: string | undefined, memory: BriefMemory) {
  await context.addCookies([
    { name: BRIEF_COOKIE, value: serializeBriefMemory(memory), url: baseURL ?? "http://localhost:3210" },
  ]);
}

test.describe("morning brief", () => {
  test("carries the exam countdown with a link to prepare, in place of the chip", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/");
    const exam = brief(page).getByRole("link", { name: /^Prepare for CIA-2 Examination: Operating Systems/ });
    await expect(exam).toHaveAttribute("href", "/prep/SCSA5102");
    await expect(exam).toContainText(/In \d+ days, \w{3} \d{1,2} \w{3}/);
    // The countdown shows once: the chip steps aside while the brief has it.
    await expect(page.getByRole("main").getByRole("list", { name: "Coming up" })).toHaveCount(0);
  });

  test("lists one to four links, each starting with what to do", async ({ loggedInPage: page }) => {
    await page.goto("/");
    const links = brief(page).getByRole("listitem").getByRole("link");
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(4);
    for (const link of await links.all()) {
      await expect(link).toHaveText(/^(Attend|Submit|See|Check|Prepare) /);
      await expect(link).toHaveAttribute("href", /^\//);
    }
    // Only on days and times with an at-risk class still ahead.
    const attend = brief(page).getByRole("link", { name: /^Attend / });
    if ((await attend.count()) > 0) {
      await expect(attend).toHaveAttribute("href", "/attendance");
      await expect(attend).toContainText(/, you're at \d+(\.\d)?%/);
    }
    // The Today hero stays first among the sections, under the brief.
    const top = (sel: string) => page.locator(sel).evaluate((el) => el.getBoundingClientRect().top);
    expect(await top("main section[aria-labelledby='brief-heading']")).toBeLessThan(await top("main #next-class"));
  });

  test("shows a mark graded since the last visit for the rest of the day", async ({
    loggedInPage: page,
    context,
    baseURL,
  }) => {
    // The first visit only notes what is there.
    await page.goto("/");
    await expect.poll(async () => (await readMemory(context))?.seen?.length ?? 0).toBeGreaterThan(0);
    await expect(brief(page).getByRole("link", { name: /^See / })).toHaveCount(0);

    // Pretend DBMS's CIA-2 (19 of 20 in the mock) was not out last time.
    const memory = (await readMemory(context))!;
    const cia2 = markKey("SCSA5103", "CIA-2", 19, 20);
    expect(memory.seen).toContain(cia2);
    await writeMemory(context, baseURL, { ...memory, seen: memory.seen!.filter((k) => k !== cia2) });

    await page.reload();
    const mark = brief(page).getByRole("link", {
      name: "See your CIA-2 mark for Database Management Systems: 19/20",
    });
    await expect(mark).toHaveAttribute("href", "/marks#m-SCSA5103");
    await expect.poll(async () => (await readMemory(context))?.fresh?.keys).toEqual([cia2]);

    // Still there later the same day, gone the next.
    await page.reload();
    await expect(mark).toBeVisible();
    const seenToday = (await readMemory(context))!;
    await writeMemory(context, baseURL, { ...seenToday, fresh: { day: yesterday(), keys: [cia2] } });
    await page.reload();
    await expect(brief(page)).toBeVisible();
    await expect(mark).toHaveCount(0);
  });

  test("dismissing hides it until tomorrow and brings the exam chip back", async ({
    loggedInPage: page,
    context,
    baseURL,
  }) => {
    await page.goto("/");
    await waitForHydration(page);
    await brief(page).getByRole("button", { name: "Dismiss for today" }).click();
    await expect(brief(page)).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Hidden until tomorrow." })).toBeFocused();
    const chip = page.getByRole("main").getByRole("list", { name: "Coming up" });
    await expect(chip).toContainText(/Next exam: CIA-2 Examination.* in \d+ days/);

    // The server knows too, so the card never flashes in on the next visit.
    await page.reload();
    await expect(chip).toBeVisible();
    await expect(brief(page)).toHaveCount(0);

    // A dismissal from yesterday no longer counts.
    await writeMemory(context, baseURL, { ...(await readMemory(context))!, dismissed: yesterday() });
    await page.reload();
    await expect(brief(page)).toBeVisible();
    await expect(chip).toHaveCount(0);
  });

  test("counts ODs the ERP has not updated, drawn by the server from the next visit", async ({
    loggedInPage: page,
    context,
  }) => {
    // A Monday about five weeks back: a class day outside the dashboard's hour-wise window,
    // so the entry keeps the status it last had, still absent in the ERP.
    const d = new Date(`${campusDayKey(new Date(Date.now() - 35 * DAY_MS))}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const date = d.toISOString().slice(0, 10);
    const entry = {
      id: "e2e-od",
      kind: "od",
      from: date,
      to: date,
      hours: null,
      note: "",
      counted: true,
      createdAt: `${date}T09:00:00.000Z`,
      last: { status: "pending", since: date, on: date },
    };
    await context.addInitScript((json) => {
      window.localStorage.setItem("usp-od-v1", json);
    }, JSON.stringify({ v: 1, entries: [entry] }));

    await page.goto("/");
    const od = brief(page).getByRole("link", { name: /^Check an OD not updated in the ERP yet/ });
    await expect(od).toHaveAttribute("href", "/attendance/od");
    await expect(od).toContainText(/The oldest has waited \d+ days, time to follow it up/);
    await expect.poll(async () => (await readMemory(context))?.od?.pending).toBe(1);

    // Next visit, the line is in the server's HTML: nothing moves when the page hydrates.
    const html = await (await page.request.get("/")).text();
    expect(html).toContain("Check an OD not updated in the ERP yet");
  });

  test("fits a phone and keeps a 44px dismiss target", async ({ loggedInPage: page, isMobile }) => {
    test.skip(!isMobile, "phone layout");
    await page.goto("/");
    await expect(brief(page)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await brief(page).getByRole("button", { name: "Dismiss for today" }).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
