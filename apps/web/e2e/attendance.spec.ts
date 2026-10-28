import type { Page } from "@playwright/test";
import { test, expect, pageHeading, waitForHydration } from "./helpers";

/** Campus date ("YYYY-MM-DD") `days` from today. */
function campusDate(days = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Clicks a tab until React has attached its handler (hydration can lag on a busy machine). */
async function openTab(page: Page, name: string) {
  const tab = page.getByRole("main").getByRole("tab", { name, exact: true });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  return page.getByRole("main").getByRole("tabpanel", { name, exact: true });
}

test.describe("attendance: overview, records and planner", () => {
  test("leads with the overall figure and subjects, then the planner and the day-by-day records", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/attendance");
    await expect(pageHeading(page, "Attendance")).toBeVisible();
    await waitForHydration(page);

    const main = page.getByRole("main");
    await expect(main.getByText(/of \d+ hours$/).first()).toBeVisible();
    const wanted = ["By subject", "Plan ahead", "Day by day"];
    const headings = (await main.getByRole("heading", { level: 2 }).allTextContents()).filter((t) =>
      wanted.includes(t),
    );
    expect(headings).toEqual(wanted);

    // The OD tracker is one quiet link under the subjects.
    await expect(main.getByRole("region", { name: "By subject" }).getByRole("link", { name: /Track it/ })).toHaveAttribute(
      "href",
      "/od",
    );

    // Today's records open first: two separate verdicts from the ERP, each with its own label.
    const records = main.getByRole("region", { name: "Day by day" });
    await expect(records.getByRole("tab", { name: "Today" })).toHaveAttribute("aria-selected", "true");
    const today = records.getByRole("tabpanel", { name: "Today" });
    await expect(today).toBeVisible();
    await expect(today.getByRole("group", { name: "Daily attendance" })).toBeVisible();
    await expect(today.getByRole("group", { name: "Hour-wise attendance" })).toBeVisible();
    await expect(today.getByText("The ERP counts a day as present from 3 pm unless you are marked absent.")).toBeVisible();
    await expect(today.getByRole("button", { name: "Check again" })).toBeEnabled();
    // The other records wait behind their tabs.
    await expect(records.getByRole("tabpanel")).toHaveCount(1);
  });

  test("the daily tab shows the month as a table with a caption, and its totals", async ({ loggedInPage: page }) => {
    await page.goto("/attendance");
    await waitForHydration(page);
    const panel = await openTab(page, "Daily");
    // Longer periods show one table per month, newest first.
    const table = panel.getByRole("table").first();
    await expect(table.locator("caption")).toContainText(/[A-Z][a-z]+ \d{4}/);
    await expect(table.getByRole("columnheader")).toHaveCount(7);
    await expect(panel.getByText("Present days", { exact: true })).toBeVisible();
    await expect(panel.getByText("Absent days", { exact: true })).toBeVisible();
  });

  test("the hour-wise tab lists recent dates with hours present", async ({ loggedInPage: page }) => {
    await page.goto("/attendance");
    await waitForHydration(page);
    const panel = await openTab(page, "Hour-wise");
    await expect(panel.getByText(/\d+ of \d+ hours? present/).first()).toBeVisible();
  });

  test("arrow keys move between the record tabs", async ({ loggedInPage: page }) => {
    await page.goto("/attendance");
    await waitForHydration(page);
    const records = page.getByRole("main").getByRole("region", { name: "Day by day" });
    const today = records.getByRole("tab", { name: "Today" });
    await expect(async () => {
      await today.focus();
      await page.keyboard.press("ArrowRight");
      await expect(records.getByRole("tab", { name: "Daily" })).toBeFocused({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await expect(records.getByRole("tab", { name: "Daily" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("End");
    await expect(records.getByRole("tab", { name: "Hour-wise" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(today).toBeFocused();
    await expect(records.getByRole("tabpanel", { name: "Today" })).toBeVisible();
  });

  test("period dropdowns load last month and the last 7 days into the URL, and the URL opens their tab", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/attendance");
    await waitForHydration(page);

    const daily = await openTab(page, "Daily");
    const days = daily.getByRole("combobox", { name: "Period for daily attendance" });
    await expect(days).toHaveValue("this-month");
    await expect(async () => {
      await days.selectOption({ label: "Last month" });
      await expect(page).toHaveURL(/[?&]days=last-month/, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    // The previous month in campus time, worded like the caption ("September 2026").
    const [y, m] = campusDate().split("-").map(Number);
    const previous = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(y!, m! - 2, 1)),
    );
    await expect(daily.getByRole("table").first().locator("caption")).toContainText(previous);
    await expect(daily.getByText("Present days", { exact: true })).toBeVisible();
    await expect(days).toHaveValue("last-month");

    const hourly = await openTab(page, "Hour-wise");
    const hours = hourly.getByRole("combobox", { name: "Period for hour-wise attendance" });
    await expect(hours).toHaveValue("last-14-days");
    await hours.selectOption({ label: "Last 7 days" });
    await expect(page).toHaveURL(/[?&]hours=last-7-days/);
    await expect(page).toHaveURL(/[?&]days=last-month/); // the other tab keeps its period
    // The tab stays open while the new period loads.
    await expect(hourly).toBeVisible();
    await expect(hourly.getByText(/^Present \d+ of \d+ hours? \(/)).toBeVisible();
    const rows = hourly.locator("li").filter({ has: page.locator("time") });
    expect(await rows.count()).toBeLessThanOrEqual(7);

    // The URL alone renders the same choices, with the daily tab open.
    await page.reload();
    await waitForHydration(page);
    await expect(daily).toBeVisible();
    await expect(days).toHaveValue("last-month");
    await openTab(page, "Hour-wise");
    await expect(hours).toHaveValue("last-7-days");

    await page.goto("/attendance?hours=last-7-days");
    await expect(page.getByRole("main").getByRole("tabpanel", { name: "Hour-wise" })).toBeVisible();
  });

  test("a link to a record's anchor opens its tab", async ({ loggedInPage: page }) => {
    await page.goto("/attendance#daily-attendance");
    await waitForHydration(page);
    const main = page.getByRole("main");
    await expect(main.getByRole("tab", { name: "Daily" })).toHaveAttribute("aria-selected", "true");
    await expect(main.getByRole("tabpanel", { name: "Daily" })).toBeInViewport();

    // The dashboard's "Today" line links here.
    await page.goto("/attendance#todays-attendance");
    await waitForHydration(page);
    await expect(main.getByRole("tabpanel", { name: "Today" })).toBeVisible();
    await expect(main.getByRole("button", { name: "Check again" })).toBeInViewport();
  });

  test("check again refreshes from the portal without an error", async ({ loggedInPage: page }) => {
    await page.goto("/attendance");
    await waitForHydration(page);
    const panel = page.getByRole("main").getByRole("tabpanel", { name: "Today" });
    const button = panel.getByRole("button", { name: "Check again" });

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
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Couldn't reach the portal")).toHaveCount(0);
  });
});

test.describe("attendance: plan this week", () => {
  test("skipping a class changes the projected percentage", async ({ loggedInPage: page }) => {
    await page.goto("/attendance");
    await waitForHydration(page);

    const plan = page.getByRole("main").getByRole("region", { name: "Plan ahead" });
    await expect(plan.getByRole("tab", { name: "This week" })).toHaveAttribute("aria-selected", "true");

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
    // The open day counts its skip.
    await expect(plan.getByRole("radio", { checked: true })).toHaveAccessibleName(/, 1 to skip$/);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(projected).toHaveText(before);
    await expect(plan.getByRole("status")).toHaveText("No classes marked to skip.");
  });

  test("picking a day lists that day's classes", async ({ loggedInPage: page }) => {
    await page.goto("/attendance");
    await waitForHydration(page);

    const plan = page.getByRole("main").getByRole("region", { name: "Plan ahead" });
    const days = plan.getByRole("radiogroup", { name: "Day" }).getByRole("radio");
    test.skip((await days.count()) < 2, "only one day left to plan this week");

    const other = days.nth(1);
    const dayName = ((await other.getAttribute("aria-label")) ?? "").split(",")[0]!;
    await expect(async () => {
      await other.click();
      await expect(other).toHaveAttribute("aria-checked", "true", { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    const list = plan.getByRole("list", { name: `Classes on ${dayName}` });
    await expect(list).toBeVisible();
    const classes = list.getByRole("button", { name: /^Skip / });
    expect(await classes.count()).toBeGreaterThan(0);
    await expect(classes.first()).toHaveAccessibleName(new RegExp(`, ${dayName} `));
  });

  test("applying the suggestion keeps every subject above the line", async ({ loggedInPage: page }) => {
    await page.goto("/attendance");
    await waitForHydration(page);

    const plan = page.getByRole("main").getByRole("region", { name: "Plan ahead" });
    const apply = plan.getByRole("button", { name: "Apply suggestion" });
    // Late on a Saturday there can be nothing safe left to skip; the button is disabled then.
    test.skip(!(await apply.isEnabled()), "no class is safe to skip at this time of the week");

    await expect(async () => {
      await apply.click();
      await expect(plan.getByRole("button", { pressed: true }).first()).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await expect(plan.getByText(/Drops below \d+%/)).toHaveCount(0);
    await expect(plan.getByRole("status")).toContainText("Every subject stays at or above");

    await plan.getByRole("button", { name: "Clear skips" }).click();
    await expect(plan.getByRole("button", { pressed: true })).toHaveCount(0);
  });
});

test.describe("attendance: plan a leave", () => {
  test("counts the classes in the dates, lets a holiday be ticked off, and says what to attend after", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/attendance");
    await waitForHydration(page);
    const panel = await openTab(page, "A leave");

    // A whole week away from tomorrow: every weekday with classes falls in it.
    await panel.getByLabel("First day away").fill(campusDate(1));
    await panel.getByLabel("Last day away").fill(campusDate(7));

    const status = panel.getByRole("status");
    await expect(status).toContainText(/^Missing \d+ classes over \d+ days\./);
    const missed = Number((await status.innerText()).match(/Missing (\d+)/)![1]);

    const days = panel.getByRole("group", { name: "Days with classes" }).getByRole("checkbox");
    expect(await days.count()).toBeGreaterThan(1);
    // No Sunday: days without classes are left out.
    await expect(panel.getByRole("group", { name: "Days with classes" })).not.toContainText("Sun,");

    // A subject's figure after the leave.
    const figure = panel.getByTestId(/^leave-/).first();
    await expect(figure).toHaveText(/^\d+(\.\d)?%$/);

    // A subject already below the line needs classes after the leave.
    await expect(panel.getByText(/^To reach \d+% again after the leave$/)).toBeVisible();
    await expect(panel.getByText(/^Attend the next (\d+ .+ classes|.+ class)$/).first()).toBeVisible();

    // Ticking a day off as a holiday takes its classes out.
    await days.first().uncheck();
    await expect(status).not.toContainText(`Missing ${missed} classes`);
    const fewer = Number((await status.innerText()).match(/Missing (\d+)/)?.[1] ?? 0);
    expect(fewer).toBeLessThan(missed);
    await days.first().check();
    await expect(status).toContainText(`Missing ${missed} classes`);

    // A last day before the first explains itself.
    await panel.getByLabel("Last day away").fill(campusDate(1));
    await panel.getByLabel("First day away").fill(campusDate(3));
    await expect(status).not.toHaveText("The last day is before the first.");
    await panel.getByLabel("Last day away").fill(campusDate(2));
    await expect(status).toHaveText("The last day is before the first.");
  });
});

test("attendance: no console errors and no horizontal overflow", async ({ loggedInPage: page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()} [${msg.location().url}]`);
  });

  await page.goto("/attendance");
  await expect(pageHeading(page, "Attendance")).toBeVisible();
  await waitForHydration(page);

  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  const plan = page.getByRole("main").getByRole("region", { name: "Plan ahead" });
  await plan.getByRole("button", { name: /^Skip /, pressed: false }).first().click();
  await page.getByRole("main").getByRole("button", { name: "Check again" }).click();
  await waitForHydration(page);
  expect(await overflow()).toBeLessThanOrEqual(0);

  for (const tab of ["A leave", "Daily", "Hour-wise"]) {
    await openTab(page, tab);
    expect(await overflow(), `overflow on the ${tab} tab`).toBeLessThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});
