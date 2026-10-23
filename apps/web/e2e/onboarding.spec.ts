import type { Locator, Page } from "@playwright/test";
import { apiLogin, expect, setPrefs, test as base, waitForHydration, openDisclosure } from "./helpers";

/**
 * The first-time walkthrough (lib/tour.ts, components/tour/). Every other spec signs in
 * with the tour marked as done; these sign in as a brand-new student instead, with no
 * preferences cookie at all.
 */

const test = base.extend<{ freshPage: Page }>({
  freshPage: async ({ page, context }, provide) => {
    await apiLogin(page);
    await context.clearCookies({ name: "usp-prefs" });
    await provide(page);
  },
});

/** The tour's popover; `data-tour-step` names the step on screen. */
const popover = (page: Page) => page.locator("[data-tour-step]");

async function expectStep(page: Page, id: string, title?: string | RegExp) {
  await expect(popover(page)).toHaveAttribute("data-tour-step", id);
  if (title) await expect(page.getByRole("dialog", { name: title })).toBeVisible();
}

/** The visible element a step points at: the rail link on desktop, the tab bar link on a phone. */
const hook = (page: Page, name: string): Locator => page.locator(`[data-tour="${name}"]:visible`).first();

async function next(page: Page) {
  await popover(page).getByRole("button", { name: "Next", exact: true }).click();
}

/** Clicks through the welcome and the two dashboard info steps, onto "Open Attendance". */
async function toOpenAttendance(page: Page) {
  await page.goto("/");
  await waitForHydration(page);
  await expectStep(page, "welcome");
  await popover(page).getByRole("button", { name: "Start the tour" }).click();
  await expectStep(page, "next-class");
  await next(page);
  await expectStep(page, "attendance-overall");
  await next(page);
  await expectStep(page, "open-attendance", "Open Attendance");
}

async function tourCookie(page: Page): Promise<unknown> {
  const cookie = (await page.context().cookies()).find((c) => c.name === "usp-prefs");
  if (!cookie) return undefined;
  return (JSON.parse(decodeURIComponent(cookie.value)) as { onboarding?: { tour?: string } }).onboarding?.tour;
}

test.describe("first-time walkthrough", () => {
  test("a new student is welcomed on the dashboard and the info steps move on with Next and Back", async ({
    freshPage: page,
  }) => {
    await page.goto("/");
    await waitForHydration(page);

    const welcome = page.getByRole("dialog", { name: /^Welcome to your portal, \S+/ });
    await expect(welcome).toBeVisible();
    await expect(welcome).toContainText("Take a 1-minute tour?");
    await expect(welcome.getByRole("button", { name: "Skip for now" })).toBeVisible();
    // Focus moves into the popover, so keyboard users start there.
    await expect(popover(page)).toBeFocused();

    await welcome.getByRole("button", { name: "Start the tour" }).click();
    await expectStep(page, "next-class", "Your next class");
    await expect(popover(page)).toContainText(/^1 of 12/);
    await expect(popover(page)).toContainText("whether you can skip it");
    await expect(hook(page, "next-class")).toBeInViewport();

    await next(page);
    await expectStep(page, "attendance-overall", "Attendance at a glance");
    await expect(popover(page)).toContainText("Overall attendance against the 80% line");
    await expect(popover(page)).toContainText("2 of 12");

    await popover(page).getByRole("button", { name: "Back" }).click();
    await expectStep(page, "next-class");
    await next(page);
    await next(page);
    await expectStep(page, "open-attendance", "Open Attendance");
    // A click step has no Next: it waits for the student.
    await expect(popover(page).getByRole("button", { name: "Next", exact: true })).toHaveCount(0);
  });

  test("the Attendance step only moves on after the highlighted nav item is clicked, then resumes on /attendance", async ({
    freshPage: page,
    isMobile,
  }) => {
    await toOpenAttendance(page);
    await expect(popover(page)).toContainText(isMobile ? "Tap Attendance in the bar at the bottom" : "Click Attendance in the menu on the left");

    const target = hook(page, "nav-attendance");
    const box = (await target.boundingBox())!;
    const viewport = page.viewportSize()!;
    if (isMobile) {
      // The phone tab bar, not the rail.
      expect(box.y).toBeGreaterThan(viewport.height / 2);
      await expect(page.getByRole("navigation", { name: "Primary" }).last()).toContainText("Attendance");
    } else {
      expect(box.x).toBeLessThan(120);
    }

    // The dimmed page does not respond: clicking it neither navigates nor moves the tour on.
    await page.mouse.click(viewport.width / 2, viewport.height - 160);
    await expectStep(page, "open-attendance");
    await expect(page).toHaveURL((url) => url.pathname === "/");

    await target.click();
    await expect(page).toHaveURL((url) => url.pathname === "/attendance");
    await expectStep(page, "todays-attendance", "Today's attendance");
    await expect(popover(page)).toContainText("Hour-wise usually appears after 7 pm");
    await expect(hook(page, "todays-attendance")).toBeInViewport();
  });

  test("Plan your week waits for a class to be marked, and the undo puts it back", async ({ freshPage: page }) => {
    await toOpenAttendance(page);
    await hook(page, "nav-attendance").click();
    await expectStep(page, "todays-attendance");
    await next(page);

    await expectStep(page, "plan-skip", "Plan your week");
    await expect(popover(page).getByRole("button", { name: "Next", exact: true })).toHaveCount(0);
    const toggle = hook(page, "plan-first-class");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    await expectStep(page, "plan-result", "Where each subject ends up");
    await expect(hook(page, "plan-result")).toContainText("skipping 1");
    await popover(page).getByRole("button", { name: "Undo the skip" }).click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expectStep(page, "open-courses", "Open Courses");
  });

  test("the courses steps open the chooser, pick this semester and save, then the tour finishes", async ({
    freshPage: page,
  }) => {
    await toOpenAttendance(page);
    await hook(page, "nav-attendance").click();
    await expectStep(page, "todays-attendance");
    await next(page);
    await hook(page, "plan-first-class").click();
    await expectStep(page, "plan-result");
    await next(page);

    await expectStep(page, "open-courses");
    await hook(page, "nav-courses").click();
    await expect(page).toHaveURL((url) => url.pathname === "/courses");

    await expectStep(page, "choose-courses", "Hide old semesters' courses");
    await hook(page, "choose-courses").click();
    const chooser = page.getByRole("dialog", { name: "Choose courses" });
    await expect(chooser).toBeVisible();

    await expectStep(page, "this-semester", "This semester only");
    await chooser.getByRole("radio", { name: "This semester" }).click();
    await expectStep(page, "save-courses", "Save your choice");
    await chooser.getByRole("button", { name: "Save", exact: true }).click();
    await expect(chooser).toBeHidden();

    await expectStep(page, "settings", "Make it yours");
    await expect(popover(page)).toContainText("Change your start page, colours and the attendance rule in Settings");
    await next(page);

    const finish = page.getByRole("dialog", { name: "You're all set" });
    await expect(finish).toContainText("You can replay this tour any time from Settings or the search");
    await finish.getByRole("button", { name: "Add the app to your home screen" }).click();
    await expect(finish.getByText(/Add to Home Screen/)).toBeVisible();
    await finish.getByRole("button", { name: "Done" }).click();
    await expect(popover(page)).toHaveCount(0);
    expect(await tourCookie(page)).toBe("done");

    await page.goto("/");
    await waitForHydration(page);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    await expect(popover(page)).toHaveCount(0);
  });

  test("a reload mid-tour picks up the same step", async ({ freshPage: page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await popover(page).getByRole("button", { name: "Start the tour" }).click();
    await next(page);
    await expectStep(page, "attendance-overall");

    await page.reload();
    await waitForHydration(page);
    await expectStep(page, "attendance-overall");
  });

  test("Escape ends the tour and it does not start again after a reload", async ({ freshPage: page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await popover(page).getByRole("button", { name: "Start the tour" }).click();
    await expectStep(page, "next-class");

    await page.keyboard.press("Escape");
    await expect(popover(page)).toHaveCount(0);
    expect(await tourCookie(page)).toBe("skipped");

    await page.reload();
    await waitForHydration(page);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    await expect(popover(page)).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("Skip for now on the welcome ends it for good", async ({ freshPage: page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await popover(page).getByRole("button", { name: "Skip for now" }).click();
    await expect(popover(page)).toHaveCount(0);
    // Focus lands on the page, not on <body>.
    await expect(page.locator("#main")).toBeFocused();

    await page.reload();
    await waitForHydration(page);
    await expect(popover(page)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Take the 1-minute tour" })).toHaveCount(0);
  });

  test("Skip tour part-way through ends it too", async ({ freshPage: page }) => {
    await toOpenAttendance(page);
    await popover(page).getByRole("button", { name: "Skip tour" }).click();
    await expect(popover(page)).toHaveCount(0);
    expect(await tourCookie(page)).toBe("skipped");
    // The page is usable again.
    await hook(page, "nav-attendance").click();
    await expect(page).toHaveURL((url) => url.pathname === "/attendance");
  });

  test("it never starts by itself on a page other than the dashboard", async ({ freshPage: page }) => {
    await page.goto("/attendance");
    await waitForHydration(page);
    await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "Attendance" })).toBeVisible();
    await expect(popover(page)).toHaveCount(0);

    await hook(page, "nav-home").click();
    await expectStep(page, "welcome");
  });

  test("Settings replays the tour from the start", async ({ loggedInPage: page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await expect(popover(page)).toHaveCount(0);

    await page.goto("/settings");
    await waitForHydration(page);
    await openDisclosure(page, "Home screen");
    await page.getByRole("main").getByRole("button", { name: "Take the tour" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await expectStep(page, "welcome", /^Welcome to your portal/);
    await popover(page).getByRole("button", { name: "Start the tour" }).click();
    await expectStep(page, "next-class");
  });

  test("the command palette starts the tour", async ({ loggedInPage: page }) => {
    await page.goto("/attendance");
    await waitForHydration(page);

    const input = page.getByPlaceholder("Jump to a page…");
    await expect(async () => {
      await page.keyboard.press("Control+k");
      await expect(input).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await input.fill("take the tour");
    const option = page.getByRole("option", { name: "Take the tour" });
    await expect(option).toBeVisible();
    await option.click();

    await expect(input).toBeHidden();
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await expectStep(page, "welcome");
    await expect(popover(page)).toBeFocused();
  });

  test("after it has started once, the dashboard offers it with a card instead", async ({ freshPage: page }) => {
    // This browser already saw the tour start by itself, but it was never finished.
    await page.addInitScript(() => window.localStorage.setItem("usp-tour-auto", "1"));
    await page.goto("/");
    await waitForHydration(page);

    const card = page.getByRole("main").getByRole("region", { name: "Take the 1-minute tour" });
    await expect(card).toBeVisible();
    await expect(popover(page)).toHaveCount(0);

    await card.getByRole("button", { name: "Not now" }).click();
    await expect(card).toHaveCount(0);
    await expect(page.getByText("The tour is in Settings whenever you want it.")).toBeVisible();
    expect(await tourCookie(page)).toBe("skipped");

    await page.reload();
    await waitForHydration(page);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    await expect(card).toHaveCount(0);
  });

  test("the card's Start begins the tour", async ({ freshPage: page }) => {
    await page.addInitScript(() => window.localStorage.setItem("usp-tour-auto", "1"));
    await page.goto("/");
    await waitForHydration(page);
    await page.getByRole("region", { name: "Take the 1-minute tour" }).getByRole("button", { name: "Start" }).click();
    await expectStep(page, "welcome");
    await expect(page.getByRole("region", { name: "Take the 1-minute tour" })).toHaveCount(0);
  });

  test("an older preferences cookie without the tour field reads as a new student", async ({
    freshPage: page,
    context,
    baseURL,
  }) => {
    await setPrefs(context, baseURL, { accent: "plum", onboarding: { dismissed: true, done: ["install"] } });
    await page.goto("/");
    await waitForHydration(page);
    await expectStep(page, "welcome");
    await expect(page.locator("html")).toHaveAttribute("data-accent", "plum");
  });

  test("the tour fits a phone screen and the dark theme", async ({ freshPage: page }) => {
    // Light is the default, so dark has to be chosen explicitly.
    await page.addInitScript(() => localStorage.setItem("usp-theme", "dark"));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await waitForHydration(page);
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
    await popover(page).getByRole("button", { name: "Start the tour" }).click();
    await expectStep(page, "next-class");

    // The popover is measured off-screen for a frame and animates in; wait until it has settled.
    await expect(popover(page)).toBeVisible();
    await expect
      .poll(async () => (await popover(page).boundingBox())?.y ?? -1, { timeout: 3_000 })
      .toBeGreaterThanOrEqual(0);
    await page.waitForTimeout(300);
    const box = (await popover(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    // No sideways scrolling.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
