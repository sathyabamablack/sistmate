import { test, expect, pageHeading, waitForHydration } from "./helpers";

test.describe("attendance: today's check and week planner", () => {
  test("shows today's daily and hour-wise attendance before the subject list", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/attendance");
    await expect(pageHeading(page, "Attendance")).toBeVisible();
    await waitForHydration(page);

    const main = page.getByRole("main");
    const section = main.getByRole("region", { name: "Today's attendance" });
    await expect(main.getByRole("heading", { level: 2, name: "Today's attendance" })).toHaveCount(1);
    await expect(section).toBeVisible();
    // Two separate verdicts from the ERP, each with its own label.
    await expect(section.getByRole("group", { name: "Daily attendance" })).toBeVisible();
    await expect(section.getByRole("group", { name: "Hour-wise attendance" })).toBeVisible();
    await expect(section.getByText("The ERP counts a day as present from 3 pm unless you are marked absent.")).toBeVisible();
    await expect(section.getByRole("button", { name: "Check again" })).toBeEnabled();
    // The old browser-baseline check is gone.
    await expect(section.getByText("We compare with what the ERP showed earlier today.")).toHaveCount(0);

    const wanted = ["Today's attendance", "Daily attendance", "Hour-wise by day", "By subject", "Plan your week"];
    const headings = (await main.getByRole("heading", { level: 2 }).allTextContents()).filter((t) =>
      wanted.includes(t),
    );
    expect(headings).toEqual(wanted);
  });

  test("daily attendance shows the month as a table with a caption, and its totals", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/attendance");
    const section = page.getByRole("main").getByRole("region", { name: "Daily attendance" });
    await expect(section).toBeVisible();
    // Longer periods show one table per month, newest first.
    const table = section.getByRole("table").first();
    await expect(table.locator("caption")).toContainText(/[A-Z][a-z]+ \d{4}/);
    await expect(table.getByRole("columnheader")).toHaveCount(7);
    await expect(section.getByText("Present days", { exact: true })).toBeVisible();
    await expect(section.getByText("Absent days", { exact: true })).toBeVisible();
  });

  test("hour-wise by day lists recent dates with hours present", async ({ loggedInPage: page }) => {
    await page.goto("/attendance");
    const section = page.getByRole("main").getByRole("region", { name: "Hour-wise by day" });
    await expect(section).toBeVisible();
    await expect(section.getByText(/\d+ of \d+ hours? present/).first()).toBeVisible();
  });

  test("period dropdowns load last month and the last 7 days into the URL", async ({ loggedInPage: page }) => {
    await page.goto("/attendance");
    await waitForHydration(page);
    const main = page.getByRole("main");

    const daily = main.getByRole("region", { name: "Daily attendance" });
    const days = daily.getByRole("combobox", { name: "Period for daily attendance" });
    await expect(days).toHaveValue("this-month");
    // Retry until React has attached its handler (hydration can lag on a busy machine).
    await expect(async () => {
      await days.selectOption({ label: "Last month" });
      await expect(page).toHaveURL(/[?&]days=last-month/, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    // The previous month in campus time, worded like the caption ("September 2026").
    const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" })
      .format(new Date())
      .split("-")
      .map(Number);
    const previous = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(y!, m! - 2, 1)),
    );
    await expect(daily.getByRole("table").first().locator("caption")).toContainText(previous);
    await expect(daily.getByText("Present days", { exact: true })).toBeVisible();
    await expect(days).toHaveValue("last-month");

    const hourly = main.getByRole("region", { name: "Hour-wise by day" });
    const hours = hourly.getByRole("combobox", { name: "Period for hour-wise attendance" });
    await expect(hours).toHaveValue("last-14-days");
    await hours.selectOption({ label: "Last 7 days" });
    await expect(page).toHaveURL(/[?&]hours=last-7-days/);
    await expect(page).toHaveURL(/[?&]days=last-month/); // the other section keeps its period
    await expect(hourly.getByText(/^Present \d+ of \d+ hours? \(/)).toBeVisible();
    const rows = hourly.locator("li").filter({ has: page.locator("time") });
    expect(await rows.count()).toBeLessThanOrEqual(7);

    // The URL alone renders the same choice.
    await page.reload();
    await expect(days).toHaveValue("last-month");
    await expect(hours).toHaveValue("last-7-days");
  });

  test("check again refreshes from the portal without an error", async ({ loggedInPage: page }) => {
    await page.goto("/attendance");
    await waitForHydration(page);
    const section = page.getByRole("main").getByRole("region", { name: "Today's attendance" });
    const button = section.getByRole("button", { name: "Check again" });

    // Retry the click until React has attached its handler (hydration can lag on a busy machine).
    let status = 0;
    await expect(async () => {
      const [res] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes("/api/refresh") && r.request().method() === "POST",
          { timeout: 2_000 },
        ),
        button.click(),
      ]);
      status = res.status();
    }).toPass({ timeout: 20_000 });
    expect(status).toBe(200);
    await expect(button).toBeEnabled();
    await expect(section).toBeVisible();
    await expect(section.getByText("Could not reach the portal")).toHaveCount(0);
  });

  test("skipping a class changes the projected percentage", async ({ loggedInPage: page }) => {
    await page.goto("/attendance");
    await waitForHydration(page);

    const plan = page.getByRole("main").getByRole("region", { name: "Plan your week" });
    await expect(plan).toBeVisible();

    // Pin the button by its exact name: a `pressed: false` locator would move to the next class after the click.
    const first = plan.getByRole("button", { name: /^Skip /, pressed: false }).first();
    await expect(first).toBeVisible();
    const name = (await first.getAttribute("aria-label")) ?? "";
    const toggle = plan.getByRole("button", { name, exact: true });
    const code = (await toggle.innerText()).match(/[A-Z]{4}\d{4}/)?.[0];
    expect(code, "the class button shows its subject code").toBeTruthy();

    const projected = plan.getByTestId(`projected-${code}`);
    const before = await projected.innerText();
    expect(before).toMatch(/^\d+(\.\d)?%$/);

    await expect(async () => {
      if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
      await expect(toggle).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await expect(projected).not.toHaveText(before);
    await expect(plan.getByRole("status")).toContainText(/Skipping 1 class\./);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(projected).toHaveText(before);
    await expect(plan.getByRole("status")).toHaveText("No classes marked to skip.");
  });

  test("applying the suggestion keeps every subject above the line", async ({ loggedInPage: page }) => {
    await page.goto("/attendance");
    await waitForHydration(page);

    const plan = page.getByRole("main").getByRole("region", { name: "Plan your week" });
    const apply = plan.getByRole("button", { name: "Apply suggestion" });
    // Late on a Saturday there can be nothing safe left to skip; the button is disabled then.
    test.skip(!(await apply.isEnabled()), "no class is safe to skip at this time of the week");

    await apply.click();
    await expect(plan.getByRole("button", { pressed: true }).first()).toBeVisible();
    await expect(plan.getByText(/Drops below \d+%/)).toHaveCount(0);
    await expect(plan.getByRole("status")).toContainText("Every subject stays at or above");

    await plan.getByRole("button", { name: "Clear skips" }).click();
    await expect(plan.getByRole("button", { pressed: true })).toHaveCount(0);
  });

  test("no console errors and no horizontal overflow", async ({ loggedInPage: page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()} [${msg.location().url}]`);
    });

    await page.goto("/attendance");
    await expect(pageHeading(page, "Attendance")).toBeVisible();
    await waitForHydration(page);

    const plan = page.getByRole("main").getByRole("region", { name: "Plan your week" });
    await plan.getByRole("button", { name: /^Skip /, pressed: false }).first().click();
    await page.getByRole("main").getByRole("button", { name: "Check again" }).click();
    await waitForHydration(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
});
