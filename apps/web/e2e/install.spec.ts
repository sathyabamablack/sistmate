import { test, expect, waitForHydration } from "./helpers";
import type { Page } from "@playwright/test";

/**
 * /install is the "add to home screen" guide: one animated walkthrough for
 * Android (Chrome) and one for iPhone (Safari). The connector and phone
 * hand-off guides went away with the single-password sign-in.
 */

/** Console errors and uncaught exceptions for the life of a page. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

const player = (page: Page) => page.locator("[data-guide]").first();
const osGroup = (page: Page) => page.getByRole("group", { name: "Your phone" });

test.describe("install guide", () => {
  test("renders the heading, the phone switch, a player with transcript and video downloads", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto("/install");
    await waitForHydration(page);

    await expect(page.getByRole("heading", { level: 1, name: "Add to home screen" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    // Only the two home-screen guides remain; no device tablist.
    await expect(page.getByRole("tablist", { name: "Your device" })).toHaveCount(0);
    await expect(osGroup(page).getByRole("button")).toHaveCount(2);

    await expect(player(page).getByRole("button", { name: /^(Play|Pause|Replay)$/ })).toBeVisible();
    await expect(player(page).getByRole("button", { name: "Restart" })).toBeVisible();
    await expect(
      player(page).getByRole("list", { name: /steps$/ }).getByRole("listitem"),
    ).toHaveCount(5);

    // Every guide offers its recorded video for download.
    const downloads = page.getByRole("link", { name: /^Download video/ });
    for (const href of await downloads.evaluateAll((els) => els.map((a) => a.getAttribute("href")))) {
      expect(href).toMatch(/^\/guides\/(android|iphone)\.(mp4|webm)$/);
    }

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("step markers move the caption and the transcript", async ({ page }) => {
    await page.goto("/install#android");
    await waitForHydration(page);
    await expect(player(page)).toHaveAttribute("data-guide", "android");

    await player(page).getByRole("button", { name: "Step 3 of 5: Tap Install app" }).click();
    await expect(player(page).getByText("Step 3 of 5", { exact: true })).toBeVisible();
    await expect(player(page).locator("[aria-current=step]").first()).toHaveAccessibleName(
      /Step 3 of 5/,
    );
    await expect(player(page).getByRole("listitem").nth(2)).toHaveAttribute("aria-current", "step");

    await player(page).getByRole("button", { name: "Pause" }).click();
    await expect(player(page).getByRole("button", { name: "Play" })).toBeVisible();
    await expect(player(page)).toHaveAttribute("data-state", "paused");
  });

  test("deep links pick the guide, and the switch flips Android and iPhone", async ({ page }) => {
    await page.goto("/install#iphone");
    await waitForHydration(page);
    await expect(player(page)).toHaveAttribute("data-guide", "iphone");

    await osGroup(page).getByRole("button", { name: /Android/ }).click();
    await expect(player(page)).toHaveAttribute("data-guide", "android");

    // A link to a guide that no longer exists must not break the page.
    await page.goto("/install#laptop");
    await waitForHydration(page);
    await expect(player(page)).toBeVisible();
  });

  test("shares or copies the /install link", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "Clipboard permissions are Chromium-only in Playwright");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/install");
    await waitForHydration(page);
    // Force the copy fallback: the headless share sheet would never resolve.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    });
    await page.getByRole("button", { name: "Share this guide" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Link copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/install$/);
  });

  test("does not scroll sideways at 390 px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/install");
    await waitForHydration(page);
    for (const os of ["Android", "iPhone"]) {
      await osGroup(page).getByRole("button", { name: new RegExp(os) }).click();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, os).toBeLessThanOrEqual(0);
    }
  });

  test("with reduced motion it shows still steps with Back and Next instead of playing", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/install#android");
    await waitForHydration(page);
    await expect(player(page)).toHaveAttribute("data-motion", "stills");
    await expect(player(page).getByRole("button", { name: /^(Play|Pause)$/ })).toHaveCount(0);
    await expect(player(page)).toHaveAttribute("data-state", "idle");

    const next = player(page).getByRole("button", { name: "Next" });
    await expect(player(page).getByRole("button", { name: "Back" })).toBeDisabled();
    await next.click();
    await expect(player(page).getByText("Step 2 of 5", { exact: true })).toBeVisible();
    await expect(player(page).getByText("Tap the ⋮ menu").first()).toBeVisible();
    await player(page).getByRole("button", { name: "Back" }).click();
    await expect(player(page).getByText("Step 1 of 5", { exact: true })).toBeVisible();
  });
});

test.describe("links to the install guide", () => {
  test("the welcome footer points at the home-screen guide", async ({ page }) => {
    await page.goto("/welcome");
    await waitForHydration(page);
    await expect(
      page.getByRole("link", { name: "Add to home screen" }).first(),
    ).toHaveAttribute("href", "/install");
    // The old connector/phone-handoff deep links are gone.
    await expect(page.locator('a[href*="phone-connect"], a[href*="#laptop"]')).toHaveCount(0);
  });
});
