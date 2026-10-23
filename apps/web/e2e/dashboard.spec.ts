import type { Page } from "@playwright/test";
import { expect, setPrefs, test } from "./helpers";

/**
 * Dashboard alerts, countdowns and the saved layout. The mock data has a subject
 * at 62.5% (SCSA5105, Design and Analysis of Algorithms), three subjects within
 * 5 points of 80%, a CIA-2 exam 11 days out and assignments due in a few days.
 */

/** Distance of an element's top edge from the top of the document. */
const pageTop = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => el.getBoundingClientRect().top + window.scrollY);

test.describe("dashboard alerts", () => {
  test("flags the subject below the threshold with the exact action to take", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/");
    const main = page.getByRole("main");
    const banner = main.getByRole("group", { name: "Attendance alerts" });
    await expect(banner).toBeVisible();
    await expect(banner.getByText(/\d+ subjects? (is|are) below 80%/)).toBeVisible();
    await expect(
      banner.getByText(
        /Attend the next 42 classes in Design and Analysis of Algorithms to get back to 80%/,
      ),
    ).toBeVisible();
    // The alert is not a section: the dashboard still has exactly one "Attendance" heading.
    await expect(main.getByRole("heading", { name: "Attendance" })).toHaveCount(1);
    await expect(main.getByRole("heading", { name: "Heads up" })).toHaveCount(0);
  });

  test("shows a countdown chip for the next exam and none for deadlines", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/");
    const chips = page.getByRole("main").getByRole("list", { name: "Coming up" });
    await expect(chips).toBeVisible();
    await expect(
      chips.getByRole("listitem").filter({ hasText: /Next exam:/ }),
    ).toHaveText(/CIA-2 Examination.* (today|tomorrow|in \d+ days)/);
    await expect(page.getByRole("main").getByText(/Next deadline:/)).toHaveCount(0);
  });

  test("follows the attendance threshold from settings", async ({
    loggedInPage: page,
    context,
    baseURL,
  }) => {
    // At 60% the 62.5% subject is no longer below the line, only close to it.
    await setPrefs(context, baseURL, { attendanceThreshold: 60 });
    await page.goto("/");
    const banner = page.getByRole("main").getByRole("group", { name: "Attendance alerts" });
    await expect(banner.getByText("1 subject is close to 60%")).toBeVisible();
    await expect(banner.getByText(/Attend the next \d+ classes/)).toHaveCount(0);
  });

  test("today's attendance line is a link and never a second heading", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Today's attendance" })).toHaveCount(0);
    // Present only on days with classes; when it shows it points at the attendance page.
    const chip = main.locator('a[href="/attendance#todays-attendance"]');
    if ((await chip.count()) > 0) {
      await expect(chip).toContainText(/Today: .+ \(daily\), /);
    }
  });
});

test.describe("dashboard layout from settings", () => {
  test("hidden sections disappear and the rest stay", async ({
    loggedInPage: page,
    context,
    baseURL,
  }) => {
    await setPrefs(context, baseURL, {
      dashboard: {
        order: ["today", "glance", "attendance", "due", "notices", "courses"],
        hidden: ["notices", "courses", "glance"],
      },
    });
    await page.goto("/");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Notifications" })).toHaveCount(0);
    await expect(main.getByRole("heading", { name: "Courses" })).toHaveCount(0);
    await expect(main.getByRole("heading", { name: "At a glance" })).toHaveCount(0);
    await expect(main.getByText("CGPA", { exact: true })).toHaveCount(0);
    await expect(main.getByRole("heading", { name: "Attendance" })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Due soon" })).toBeVisible();
    await expect(main.locator("#next-class")).toBeVisible();
  });

  test("hiding everything still leaves the Today hero", async ({
    loggedInPage: page,
    context,
    baseURL,
  }) => {
    await setPrefs(context, baseURL, {
      dashboard: {
        order: ["today", "glance", "attendance", "due", "notices", "courses"],
        hidden: ["today", "glance", "attendance", "due", "notices", "courses"],
      },
    });
    await page.goto("/");
    const main = page.getByRole("main");
    await expect(main.locator("#next-class")).toBeVisible();
    await expect(main.getByRole("heading", { name: "Attendance" })).toHaveCount(0);
    await expect(main.getByRole("heading", { name: "Due soon" })).toHaveCount(0);
    // The greeting and alerts are not sections, so they stay.
    await expect(
      main.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening), / }),
    ).toBeVisible();
  });

  test("the saved order is applied", async ({
    loggedInPage: page,
    context,
    baseURL,
    isMobile,
  }) => {
    await setPrefs(context, baseURL, {
      dashboard: {
        order: ["courses", "notices", "glance", "due", "attendance", "today"],
        hidden: [],
      },
    });
    await page.goto("/");
    await expect(page.locator("#courses")).toBeVisible();

    const top = (id: string) => pageTop(page, `main #${id}`);
    const [courses, notices, glance, due, attendance, today] = await Promise.all(
      ["courses", "notices", "glance", "due-soon", "attendance", "next-class"].map(top),
    );

    // Inside each column the saved order holds.
    expect(courses).toBeLessThan(attendance!);
    expect(attendance).toBeLessThan(today!);
    expect(notices).toBeLessThan(glance!);
    expect(glance).toBeLessThan(due!);

    if (isMobile) {
      // One column: the saved order is the page order, top to bottom.
      expect(courses).toBeLessThan(notices!);
      expect(notices).toBeLessThan(glance!);
      expect(due).toBeLessThan(attendance!);
    }
  });

  test("the default order keeps Today first", async ({ loggedInPage: page }) => {
    await page.goto("/");
    await expect(page.locator("main #next-class")).toBeVisible();
    const today = await pageTop(page, "main #next-class");
    const attendance = await pageTop(page, "main #attendance");
    expect(today).toBeLessThan(attendance);
  });
});

test.describe("arrears", () => {
  test("results show a calm note when there is nothing to clear", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/results");
    const main = page.getByRole("main");
    await expect(main.getByText("No arrears")).toBeVisible();
    await expect(main.getByRole("heading", { name: "Arrears and papers to clear" })).toHaveCount(0);
  });
});
