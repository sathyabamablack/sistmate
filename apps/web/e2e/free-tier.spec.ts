import type { Request } from "@playwright/test";
import { test, expect, apiLogin, setPrefs, waitForHydration } from "./helpers";

/**
 * Behaviour that keeps the site inside the hosting plan's request budget without changing what a
 * student sees: static public pages, preferences applied by the boot script, prefetch on intent.
 */
test.describe("free-tier budget", () => {
  test("/welcome is the signed-out version without a session, the signed-in one with it", async ({ page, browser }) => {
    await apiLogin(page);
    await page.goto("/welcome");
    await expect(page).toHaveURL((url) => url.pathname === "/welcome");
    await expect(page.getByRole("link", { name: "Open your dashboard" }).first()).toHaveAttribute("href", "/");
    await expect(page.getByText("Your dashboard is ready.")).toBeVisible();

    const guest = await browser.newPage();
    await guest.goto("/welcome");
    await expect(guest.getByRole("link", { name: "Sign in" }).first()).toHaveAttribute("href", "/login");
    await expect(guest.getByRole("link", { name: "Open your dashboard" })).toHaveCount(0);
    await guest.close();
  });

  test("the public pages are static HTML with default looks; saved preferences still apply", async ({
    page,
    context,
    baseURL,
  }) => {
    const res = await page.request.get("/welcome");
    expect(await res.text()).toContain('data-accent="pine"');

    await setPrefs(context, baseURL, { accent: "plum", text: "large", density: "compact", reduceMotion: true });
    await page.goto("/welcome", { waitUntil: "domcontentloaded" });
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-accent", "plum");
    await expect(html).toHaveAttribute("data-text", "large");
    await expect(html).toHaveAttribute("data-density", "compact");
    await expect(html).toHaveAttribute("data-motion", "reduce");
    await waitForHydration(page);
    // Hydration keeps them (the server sent the defaults).
    await expect(html).toHaveAttribute("data-accent", "plum");
  });

  test("dashboard links prefetch on hover, not when they come into view", async ({ loggedInPage: page, isMobile }) => {
    const prefetches: string[] = [];
    const onRequest = (req: Request) => {
      if (req.headers()["next-router-prefetch"]) prefetches.push(new URL(req.url()).pathname);
    };
    page.on("request", onRequest);

    await page.goto("/");
    await waitForHydration(page);
    await page.waitForTimeout(1_500);
    expect(prefetches, `prefetched on sight: ${prefetches.join(", ")}`).toEqual([]);

    test.skip(isMobile, "hover is a desktop gesture; touch starts the prefetch on phones");
    await page.getByRole("navigation").getByRole("link", { name: "Attendance", exact: true }).hover();
    await expect.poll(() => prefetches).toContain("/attendance");
  });
});
