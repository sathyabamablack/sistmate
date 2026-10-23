import { test, expect, NAV_PAGES, navigateTo, pageHeading, waitForHydration } from "./helpers";

test.describe("navigation", () => {
  for (const { label, path } of NAV_PAGES) {
    test(`${label} page loads from the nav`, async ({ loggedInPage: page, isMobile }) => {
      await page.goto("/");
      await waitForHydration(page);

      await navigateTo(page, label, isMobile);

      await expect(page).toHaveURL((url) => url.pathname === path);
      await expect(pageHeading(page, label)).toBeVisible();
      // The (app) error boundary must not have taken over.
      await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    });
  }

  test("phones get a bottom tab bar and a More sheet, desktop gets a rail", async ({
    loggedInPage: page,
    isMobile,
  }) => {
    await page.goto("/");
    await waitForHydration(page);

    const primary = page.getByRole("navigation", { name: "Primary" });
    await expect(primary).toBeVisible();

    if (isMobile) {
      await primary.getByRole("link", { name: "Attendance", exact: true }).click();
      await expect(page).toHaveURL((url) => url.pathname === "/attendance");

      await page.getByRole("button", { name: "Open navigation" }).click();
      const sheet = page.getByRole("dialog", { name: "Navigation" });
      for (const label of ["Marks", "Results", "Fees", "Notifications"]) {
        await expect(sheet.getByRole("link", { name: label, exact: true })).toBeVisible();
      }
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    } else {
      await expect(primary.getByRole("link", { name: "Fees", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Open navigation" })).toBeHidden();
    }
  });

  test("Open ERP is one labelled link to the real ERP, outside the page content", async ({
    loggedInPage: page,
    isMobile,
  }) => {
    await page.goto("/");
    await waitForHydration(page);

    // Exactly one visible link at each breakpoint while the menu and sheet are closed.
    const erp = page.getByRole("link", { name: /Open ERP/ });
    await expect(erp).toBeVisible();
    await expect(erp).toHaveAttribute("href", /^https:\/\/erp\.sathyabama\.ac\.in\/?/);
    await expect(erp).toHaveAttribute("target", "_blank");
    await expect(erp).toHaveAttribute("rel", /noopener/);
    await expect(page.getByRole("main").getByRole("link", { name: /Open ERP/ })).toHaveCount(0);

    // The account menu has both portals.
    await page.getByRole("button", { name: "Account menu" }).click();
    const menuErp = page.getByRole("menuitem", { name: /Open ERP/ });
    const menuLms = page.getByRole("menuitem", { name: /Open LMS/ });
    await expect(menuErp).toHaveAttribute("target", "_blank");
    await expect(menuLms).toHaveAttribute("rel", /noopener/);
    await expect(menuLms).toHaveAttribute("href", /^https?:\/\//);
    await page.keyboard.press("Escape");

    if (isMobile) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      const sheet = page.getByRole("dialog", { name: "Navigation" });
      await expect(sheet.getByRole("link", { name: /Open ERP/ })).toHaveAttribute("target", "_blank");
      await expect(sheet.getByRole("link", { name: /Open LMS/ })).toBeVisible();
    }
  });

  test("command palette: Ctrl+K, type, Enter navigates", async ({ loggedInPage: page }) => {
    await page.goto("/");
    await waitForHydration(page);

    const input = page.getByPlaceholder("Jump to a page…");
    await expect(async () => {
      await page.keyboard.press("Control+k");
      await expect(input).toBeVisible({ timeout: 1_000 });
    }).toPass();

    await expect(input).toBeFocused();
    await input.fill("time");
    await expect(page.getByRole("option", { name: /Timetable/ })).toBeVisible();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL((url) => url.pathname === "/timetable");
    await expect(pageHeading(page, "Timetable")).toBeVisible();
    await expect(input).toBeHidden();
  });

  test("no console or page errors during a full navigation pass", async ({
    loggedInPage: page,
    isMobile,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(`console.error: ${msg.text()} [${msg.location().url}] on ${page.url()}`);
      }
    });

    await page.goto("/");
    await waitForHydration(page);
    await expect(pageHeading(page, /^Good /)).toBeVisible();

    for (const { label, path } of NAV_PAGES) {
      await navigateTo(page, label, isMobile);
      await expect(page).toHaveURL((url) => url.pathname === path);
      await expect(pageHeading(page, label)).toBeVisible();
      await waitForHydration(page);
    }

    // Full (non-client-side) loads too, which exercise hydration of each page.
    for (const { label, path } of NAV_PAGES) {
      await page.goto(path);
      await expect(pageHeading(page, label)).toBeVisible();
      await waitForHydration(page);
    }

    expect(errors, errors.join("\n")).toEqual([]);
  });
});
