import { expect, test } from "./helpers";

test.describe("Sathyabama Black teasers", () => {
  test("the countdown page is public and says it is independent", async ({ page }) => {
    await page.goto("/black");
    await expect(page.getByRole("timer")).toBeVisible();
    await expect(page.getByText(/Not affiliated with/i)).toBeVisible();
  });

  test("the dashboard strip links to the countdown and can be dismissed", async ({ loggedInPage: page }) => {
    await page.goto("/");
    await page.evaluate(() => window.localStorage.removeItem("usp-black-strip"));
    await page.reload();
    const strip = page.getByRole("link", { name: /Sathyabama Black/ });
    await expect(strip).toBeVisible();
    await expect(strip).toHaveAttribute("href", "/black");
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(strip).toBeHidden();
    await page.reload();
    await expect(page.getByRole("link", { name: /Sathyabama Black/ })).toBeHidden();
  });

  test("the pop-up appears once, can be closed and lets people carry on", async ({ loggedInPage: page }) => {
    await page.goto("/");
    await page.evaluate(() => window.sessionStorage.removeItem("usp-black-popup"));
    await page.reload();
    const dialog = page.getByRole("dialog", { name: "Sathyabama Black" });
    await expect(dialog).toBeVisible({ timeout: 8_000 });
    await expect(dialog.getByRole("link", { name: /Take a look|Enter/ })).toHaveAttribute("href", "/black");
    await dialog.getByRole("button", { name: "Not now" }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await page.waitForTimeout(2_500);
    await expect(dialog).toBeHidden();
  });

  test("the pop-up closes with Escape", async ({ loggedInPage: page }) => {
    await page.goto("/");
    await page.evaluate(() => window.sessionStorage.removeItem("usp-black-popup"));
    await page.reload();
    const dialog = page.getByRole("dialog", { name: "Sathyabama Black" });
    await expect(dialog).toBeVisible({ timeout: 8_000 });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("a pinned notice sits at the top of Notifications", async ({ loggedInPage: page }) => {
    await page.goto("/notifications");
    await expect(page.getByRole("link", { name: /Sathyabama Black|Something is coming/ })).toHaveAttribute("href", "/black");
  });

  test("without a store the interest counter switches itself off", async ({ page, request }) => {
    // The e2e server is a production build with no Redis configured, so it must not take votes.
    const status = await request.get("/api/interest");
    expect(await status.json()).toEqual({ enabled: false, count: 0 });
    const vote = await request.post("/api/interest", { data: { token: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" } });
    expect((await vote.json()).enabled).toBe(false);
    await page.goto("/black");
    await expect(page.getByRole("timer")).toBeVisible();
    await page.waitForTimeout(1_500);
    await expect(page.getByRole("button", { name: /Interested|You're in/ })).toHaveCount(0);
  });

  test("the public footer has the red dot", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.getByRole("link", { name: "Something is coming" })).toHaveAttribute("href", "/black");
  });
});
