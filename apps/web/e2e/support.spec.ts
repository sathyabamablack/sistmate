import { test, expect, pageHeading, waitForHydration } from "./helpers";

/**
 * The UPI id is baked in at build time (NEXT_PUBLIC_UPI_ID), so the build under test either has
 * the amount picker or the "not open yet" card. Both are valid; the checks below accept either.
 */
const UPI_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_UPI_ID);

test.describe("support / donate", () => {
  test("signed in: Support is reachable from the nav and keeps the app shell", async ({
    loggedInPage: page,
    isMobile,
  }) => {
    await page.goto("/");
    await waitForHydration(page);

    if (isMobile) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      const drawer = page.getByRole("dialog", { name: "Navigation" });
      // One card at the top of the sheet, not a second row in the list.
      await expect(drawer.getByRole("link", { name: /support the portal/i })).toHaveCount(1);
      await expect(
        drawer.getByRole("navigation", { name: "All pages" }).getByRole("link", { name: "Support" }),
      ).toHaveCount(0);
      await drawer.getByRole("link", { name: /support the portal/i }).click();
    } else {
      await page.getByRole("navigation").getByRole("link", { name: "Support", exact: true }).click();
    }

    await expect(page).toHaveURL((url) => url.pathname === "/support");
    await expect(pageHeading(page, /found it useful/i)).toBeVisible();
    // Still inside the app: the primary navigation is present.
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    if (UPI_CONFIGURED) {
      await expect(page.getByRole("group", { name: "Choose an amount" })).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { name: "Tips are not open yet" })).toBeVisible();
    }
  });

  test("picking an amount builds a UPI link", async ({ loggedInPage: page }) => {
    test.skip(!UPI_CONFIGURED, "needs NEXT_PUBLIC_UPI_ID set when the app is built");
    await page.goto("/support");
    await waitForHydration(page);

    await page.getByRole("button", { name: "₹200" }).click();
    const pay = page.getByRole("link", { name: /pay ₹200 with upi/i });
    await expect(pay).toHaveAttribute("href", /^upi:\/\/pay\?pa=.+&pn=.+&am=200&cu=INR/);

    await page.getByLabel("Or enter your own amount").fill("0");
    await expect(page.getByRole("alert")).toContainText("whole amount");
    await expect(page.getByRole("link", { name: /pay .* with upi/i })).toHaveCount(0);
  });

  test("the desktop rail drops Notifications (the top bar has it) and does not scroll", async ({
    loggedInPage: page,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop rail only");
    await page.goto("/");
    await waitForHydration(page);

    const rail = page.getByRole("navigation", { name: "Primary" });
    await expect(rail.getByRole("link", { name: "Notifications" })).toHaveCount(0);
    await expect(rail.getByRole("link", { name: "Fees", exact: true })).toBeVisible();
    // The top bar's bell still reaches the page.
    await expect(page.getByRole("banner").getByRole("link", { name: /notifications/i })).toBeVisible();

    const scrolls = await rail.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(scrolls).toBe(false);
  });

  test("Fees stays in the phone More sheet", async ({ loggedInPage: page, isMobile }) => {
    test.skip(!isMobile, "phone sheet only");
    await page.goto("/");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(
      page.getByRole("dialog", { name: "Navigation" }).getByRole("link", { name: "Fees", exact: true }),
    ).toBeVisible();
  });

  test("public calculators link to the public donate page", async ({ page }) => {
    for (const path of ["/attendance-calculator", "/cgpa-calculator"]) {
      await page.goto(path);
      const link = page.getByRole("main").getByRole("link", { name: "Chip in" });
      await expect(link).toHaveAttribute("href", "/donate");
    }
    await page.goto("/donate");
    await expect(pageHeading(page, /found it useful/i)).toBeVisible();
  });
});
