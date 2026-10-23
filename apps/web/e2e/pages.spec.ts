import { test, expect, pageHeading, waitForHydration } from "./helpers";

test.describe("notifications, fees and timetable pages", () => {
  test("a notice expands in place with its full text, and collapses again", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/notifications");
    await waitForHydration(page);

    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 2 }).first()).toBeVisible();

    const toggle = main.getByRole("button", { expanded: false }).filter({ hasText: /\S/ }).nth(3);
    await toggle.click();
    const open = main.getByRole("button", { expanded: true }).first();
    await expect(open).toBeVisible();
    await expect(main.locator("[id^=notice-]").getByText(/^Posted /)).toBeVisible();

    await open.click();
    await expect(main.locator("[id^=notice-]")).toHaveCount(0);
  });

  test("the unread filter is offered when something is unread", async ({ loggedInPage: page }) => {
    await page.goto("/notifications");
    await waitForHydration(page);
    const group = page.getByRole("group", { name: "Filter notifications" });
    await expect(group.getByRole("button", { name: /^Unread/ })).toBeVisible();
    await group.getByRole("button", { name: /^LMS/ }).click();
    const items = page.getByRole("main").getByRole("listitem");
    await expect(items.first()).toBeVisible();
    for (const t of await items.allTextContents()) expect(t).toContain("LMS");
  });

  test("fees page is a ledger with amounts and says payment happens on the ERP portal", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/fees");
    await expect(pageHeading(page, "Fees")).toBeVisible();
    const main = page.getByRole("main");
    await expect(main.getByText(/is outstanding/)).toBeVisible();
    await expect(main.getByText("Paid in full")).toBeVisible();
    await expect(main.getByText(/₹/).first()).toBeVisible();
    await expect(main.getByText(/Pay on the ERP fee portal/)).toBeVisible();
    await expect(main.getByRole("link")).toHaveCount(0);
  });

  test("timetable shows the week for the current viewport and keeps calendar export", async ({
    loggedInPage: page,
    isMobile,
  }) => {
    await page.goto("/timetable");
    await expect(pageHeading(page, "Timetable")).toBeVisible();
    await waitForHydration(page);
    const main = page.getByRole("main");

    if (isMobile) {
      await expect(main.getByRole("group", { name: "Choose a day" })).toBeVisible();
      await expect(main.getByRole("table")).toBeHidden();
    } else {
      await expect(main.getByRole("table", { name: /Weekly class timetable/ })).toBeVisible();
    }
    await expect(main.getByRole("heading", { level: 2, name: "Subjects this week" })).toBeVisible();

    const link = main.getByRole("link", { name: "Add to calendar" });
    await expect(link).toHaveAttribute("href", "/api/calendar");
    const res = await page.request.get("/api/calendar");
    expect(res.ok()).toBe(true);
    expect(await res.text()).toContain("BEGIN:VCALENDAR");
  });
});
