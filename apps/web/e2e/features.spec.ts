import { test, expect, pageHeading, waitForHydration } from "./helpers";

test.describe("features", () => {
  test("theme toggle switches html.dark and persists across reload", async ({
    loggedInPage: page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await waitForHydration(page);

    const html = page.locator("html");
    await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);

    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
    await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();

    await page.reload();
    await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
    await waitForHydration(page);
    await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();

    await page.getByRole("button", { name: "Switch to light theme" }).click();
    await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);
    await page.reload();
    await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);
  });

  test("results leads with the CGPA and sends planning to the calculator", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/results");
    await expect(pageHeading(page, "Results")).toBeVisible();

    const standing = page.getByRole("region", { name: "Your standing" });
    await expect(standing).toBeVisible();
    // A real CGPA, not a dash.
    await expect(standing.getByText(/^\d+\.\d{2}$/).first()).toBeVisible();
    // Forward planning lives on /calculator now, and exactly one link goes there.
    await expect(page.getByRole("main").getByRole("link", { name: /Plan your next CGPA/ })).toHaveCount(1);
    await expect(page.getByRole("main").getByText("What-if planner")).toHaveCount(0);
  });

  test("results grade each paper by the official rules, out of the course maximum", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/results");
    await expect(pageHeading(page, "Results")).toBeVisible();
    const main = page.getByRole("main");
    // Chemistry Lab is a one-credit lab out of 50: 42 / 50 is 84%.
    await expect(main.getByText(/42 \/ 50/).filter({ visible: true }).first()).toBeVisible();
    // Physics failed its exam in semester 2 and was cleared later: shown, but not in GPA.
    await expect(main.getByText("Reappear", { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(main.getByText("No arrears")).toBeVisible();
    await main.getByText("How this is calculated").click();
    await expect(main.getByText(/50% of the total and 30%/)).toBeVisible();
  });

  test("attendance page states each subject's position against 80% in plain words", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/attendance");
    await expect(pageHeading(page, "Attendance")).toBeVisible();
    const main = page.getByRole("main");
    await expect(main.getByText(/^\d+ of \d+ hours$/).first()).toBeVisible();
    // Mock data includes a subject below the line and ones with room to skip.
    await expect(main.getByText(/Attend next \d+/).filter({ visible: true }).first()).toBeVisible();
    await expect(main.getByText(/Can skip \d+/).filter({ visible: true }).first()).toBeVisible();
    // Zero-hour subjects must never read as "at the limit".
    await expect(main.getByText("Not started")).toHaveCount(0);
  });

  test("marks page shows per-subject components", async ({ loggedInPage: page }) => {
    await page.goto("/marks");
    await expect(pageHeading(page, "Marks")).toBeVisible();
    await expect(page.getByRole("main").getByRole("heading", { level: 2 }).first()).toBeVisible();
  });

  test("notifications search filters the list", async ({ loggedInPage: page }) => {
    await page.goto("/notifications");
    await expect(pageHeading(page, "Notifications")).toBeVisible();
    await waitForHydration(page);

    const items = page.getByRole("main").getByRole("listitem");
    const total = await items.count();
    expect(total).toBeGreaterThan(1);

    // Search for a word from the last notification's title.
    const lastTitle = (await items.last().locator("[data-notice-title]").first().textContent()) ?? "";
    const word =
      lastTitle
        .split(/\W+/)
        .filter((w) => w.length >= 5)
        .sort((a, b) => b.length - a.length)[0] ?? lastTitle;
    expect(word.length).toBeGreaterThan(0);

    const search = page.getByRole("searchbox", { name: "Search notifications" });
    await search.fill(word);

    await expect(items.first()).toBeVisible();
    await expect(async () => {
      const texts = await items.allTextContents();
      expect(texts.length).toBeGreaterThan(0);
      expect(texts.length).toBeLessThanOrEqual(total);
      for (const t of texts) expect(t.toLowerCase()).toContain(word.toLowerCase());
    }).toPass();
    // Unless every notification mentions the word, the list must shrink.
    const matching = await items.count();
    expect(matching).toBeLessThan(total);

    await search.fill("zzz-no-such-notification");
    await expect(items).toHaveCount(0);
    await expect(page.getByText("No matching notifications")).toBeVisible();

    await search.fill("");
    await expect(items).toHaveCount(total);
  });
});
