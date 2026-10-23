import type { Page } from "@playwright/test";
import { test, expect, navigateTo, openDisclosure, pageHeading, waitForHydration } from "./helpers";

const OFFICIAL = "Sathyabama official (Regulations 2019 and 2023)";

test.describe("settings", () => {
  test("opens from the nav with a single h1 and both sections", async ({
    loggedInPage: page,
    isMobile,
  }) => {
    await page.goto("/");
    await waitForHydration(page);

    await navigateTo(page, "Settings", isMobile);

    await expect(page).toHaveURL((url) => url.pathname === "/settings");
    await expect(pageHeading(page, "Settings")).toBeVisible();
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveCount(1);

    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 2, name: "Appearance" })).toBeVisible();
    await expect(main.getByRole("heading", { level: 2, name: "Grade scheme" })).toBeVisible();
    await openDisclosure(page, "Grade scheme");
    // One grading scheme: the official Sathyabama rules, with their grade bands.
    await openDisclosure(page, "Grade scheme");
    await expect(main.getByRole("heading", { level: 3, name: OFFICIAL })).toBeVisible();
    await expect(main.getByRole("table", { name: /Grade bands/ })).toContainText("A++");
  });

  test("an old template cookie reads as the official scheme and credit corrections can be reset", async ({
    loggedInPage: page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      {
        name: "usp-grading",
        value: encodeURIComponent(JSON.stringify({ preset: "four-credit", credits: { SCSB1303: 4 } })),
        url: baseURL ?? "http://localhost:3210",
      },
    ]);
    await page.goto("/settings");
    await waitForHydration(page);

    const main = page.getByRole("main");
    await openDisclosure(page, "Grade scheme");
    await expect(main.getByRole("heading", { level: 3, name: OFFICIAL })).toBeVisible();
    await expect(main.getByText(/You have corrected credits for 1 subject\./)).toBeVisible();
    await main.getByRole("button", { name: "Reset credit corrections" }).click();
    await expect(main.getByText(/You have corrected credits/)).toHaveCount(0);

    await page.reload();
    await expect(pageHeading(page, "Settings")).toBeVisible();
    await expect(main.getByText(/You have corrected credits/)).toHaveCount(0);
  });

  test("picking Dark under Appearance applies the dark theme", async ({
    loggedInPage: page,
    isMobile,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await waitForHydration(page);
    await navigateTo(page, "Settings", isMobile);
    await expect(pageHeading(page, "Settings")).toBeVisible();
    await waitForHydration(page);

    const html = page.locator("html");
    await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);

    await openDisclosure(page, "Appearance");
    const dark = page.getByRole("main").getByRole("radio", { name: "Dark" });
    await dark.check();
    await expect(dark).toBeChecked();
    await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);

    await page.reload();
    await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
  });
});

test.describe("settings: customization", () => {
  const html = (page: Page) => page.locator("html");

  test("an accent color sets html[data-accent] and survives a reload", async ({ loggedInPage: page }) => {
    await page.goto("/settings");
    await waitForHydration(page);

    await openDisclosure(page, "Appearance");
    await expect(html(page)).toHaveAttribute("data-accent", "pine");
    const main = page.getByRole("main");
    await main.getByRole("radio", { name: "Ocean" }).check();
    await expect(main.getByRole("radio", { name: "Ocean" })).toBeChecked();
    await expect(html(page)).toHaveAttribute("data-accent", "ocean");

    await page.reload();
    await expect(html(page)).toHaveAttribute("data-accent", "ocean");
    await openDisclosure(page, "Appearance");
    await expect(main.getByRole("radio", { name: "Ocean" })).toBeChecked();
    await expect(main.getByRole("radio", { name: "Pine" })).not.toBeChecked();
  });

  test("compact density and large text set data attributes and persist", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/settings");
    await waitForHydration(page);

    await expect(html(page)).toHaveAttribute("data-density", "comfortable");
    await openDisclosure(page, "Appearance");
    await expect(html(page)).toHaveAttribute("data-text", "normal");

    const main = page.getByRole("main");
    await main.getByRole("radio", { name: "Compact" }).check();
    await main.getByRole("radio", { name: "Large" }).check();
    await expect(html(page)).toHaveAttribute("data-density", "compact");
    await expect(html(page)).toHaveAttribute("data-text", "large");

    await page.reload();
    await expect(html(page)).toHaveAttribute("data-density", "compact");
    await expect(html(page)).toHaveAttribute("data-text", "large");
    await openDisclosure(page, "Appearance");
    await expect(main.getByRole("radio", { name: "Compact" })).toBeChecked();
    await expect(main.getByRole("radio", { name: "Large" })).toBeChecked();
    // Large text scales the root font size to 17px.
    await expect
      .poll(() => html(page).evaluate((el) => getComputedStyle(el).fontSize))
      .toBe("17px");
  });

  test("reduce motion sets html[data-motion]", async ({ loggedInPage: page }) => {
    await page.goto("/settings");
    await waitForHydration(page);
    await openDisclosure(page, "Appearance");
    await expect(html(page)).toHaveAttribute("data-motion", "auto");

    const box = page.getByRole("main").getByRole("checkbox", { name: "Reduce motion" });
    await box.check();
    await expect(html(page)).toHaveAttribute("data-motion", "reduce");

    await page.reload();
    await expect(html(page)).toHaveAttribute("data-motion", "reduce");
    await openDisclosure(page, "Appearance");
    await expect(box).toBeChecked();
  });

  test("an attendance requirement of 80 shows up on the Attendance page", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/settings");
    await waitForHydration(page);

    const main = page.getByRole("main");
    await expect(main.getByText("Subjects below 80% are flagged.")).toBeVisible();
    await main.getByLabel("Attendance requirement (%)").fill("85");
    await expect(main.getByText("Subjects below 85% are flagged.")).toBeVisible();

    await page.goto("/attendance");
    await expect(pageHeading(page, "Attendance")).toBeVisible();
    await expect(page.getByRole("main")).toContainText(/below 85%/i);

    await page.goto("/settings");
    await expect(page.getByRole("main").getByLabel("Attendance requirement (%)")).toHaveValue("85");
  });

  test("a requirement outside 60 to 90 is corrected when you leave the field", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/settings");
    await waitForHydration(page);

    const field = page.getByRole("main").getByLabel("Attendance requirement (%)");
    await field.fill("20");
    await field.blur();
    await expect(field).toHaveValue("60");
    await field.fill("95");
    await field.blur();
    await expect(field).toHaveValue("90");
  });

  test("dashboard sections can be hidden and reordered with buttons, and persist", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/settings");
    await waitForHydration(page);

    await openDisclosure(page, "Home screen");
    const list = page.getByRole("main").getByRole("list", { name: "Dashboard sections" });
    const order = () =>
      list.getByRole("checkbox").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    const moved = [
      "Show Today",
      "Show At a glance",
      "Show Attendance",
      "Show Notices",
      "Show Due soon",
      "Show Courses",
    ];

    await expect.poll(order).toEqual([
      "Show Today",
      "Show At a glance",
      "Show Attendance",
      "Show Due soon",
      "Show Notices",
      "Show Courses",
    ]);

    await page.getByRole("button", { name: "Move Notices up" }).click();
    await list.getByRole("checkbox", { name: "Show Courses" }).uncheck();
    await expect.poll(order).toEqual(moved);

    await page.reload();
    await openDisclosure(page, "Home screen");
    await expect.poll(order).toEqual(moved);
    await expect(list.getByRole("checkbox", { name: "Show Courses" })).not.toBeChecked();
    await expect(list.getByRole("checkbox", { name: "Show Notices" })).toBeChecked();
  });

  test("start page and time format persist", async ({ loggedInPage: page }) => {
    await page.goto("/settings");
    await waitForHydration(page);

    const main = page.getByRole("main");
    await openDisclosure(page, "Home screen");
    await main.getByLabel("Start page").selectOption("/timetable");
    await main.getByRole("radio", { name: "24-hour" }).check();

    await page.reload();
    await expect(main.getByLabel("Start page")).toHaveValue("/timetable");
    await expect(main.getByRole("radio", { name: "24-hour" })).toBeChecked();
    await expect(main.getByRole("radio", { name: "12-hour" })).not.toBeChecked();
  });

  test("Reset all settings restores the defaults and clears the cookie", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/settings");
    await waitForHydration(page);

    const main = page.getByRole("main");
    await openDisclosure(page, "Appearance");
    await main.getByRole("radio", { name: "Plum" }).check();
    await openDisclosure(page, "Appearance");
    await main.getByRole("radio", { name: "Small" }).check();
    await main.getByLabel("Attendance requirement (%)").fill("85");
    await expect(html(page)).toHaveAttribute("data-accent", "plum");
    await expect(html(page)).toHaveAttribute("data-text", "small");

    await main.getByRole("button", { name: "Reset all settings" }).click();
    await expect(main.getByText("Settings reset.")).toBeVisible();
    await expect(html(page)).toHaveAttribute("data-accent", "pine");
    await expect(html(page)).toHaveAttribute("data-text", "normal");
    await expect(main.getByLabel("Attendance requirement (%)")).toHaveValue("80");
    await expect(main.getByRole("radio", { name: "Pine" })).toBeChecked();

    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === "usp-prefs")).toBe(false);

    await page.reload();
    await expect(html(page)).toHaveAttribute("data-accent", "pine");
    await expect(main.getByLabel("Attendance requirement (%)")).toHaveValue("80");
  });

  test("the settings page does not scroll sideways on a phone", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/settings");
    await waitForHydration(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
