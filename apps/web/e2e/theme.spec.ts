import { test, expect, waitForHydration, openDisclosure } from "./helpers";

const DARK = /(^|\s)dark(\s|$)/;

test.describe("theme", () => {
  test("light is the default even on a dark device, signed out", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/welcome");
    await waitForHydration(page);
    await expect(page.locator("html")).not.toHaveClass(DARK);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f3f6f4");
  });

  test("light is the default even on a dark device, signed in", async ({ loggedInPage: page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await waitForHydration(page);
    await expect(page.locator("html")).not.toHaveClass(DARK);
  });

  test("choosing System follows the device and survives a reload", async ({ loggedInPage: page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/settings");
    await waitForHydration(page);
    await openDisclosure(page, "Appearance");
    await page.getByRole("main").getByRole("radio", { name: "System" }).check();
    await expect(page.locator("html")).toHaveClass(DARK);
    expect(await page.evaluate(() => localStorage.getItem("usp-theme"))).toBe("system");

    await page.reload();
    await waitForHydration(page);
    await expect(page.locator("html")).toHaveClass(DARK);
    await openDisclosure(page, "Appearance");
    await expect(page.getByRole("main").getByRole("radio", { name: "System" })).toBeChecked();

    // With System chosen, a light device gives the light theme.
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).not.toHaveClass(DARK);
  });
});
