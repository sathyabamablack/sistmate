import { test, expect, waitForHydration } from "./helpers";

test.describe("welcome page: get started", () => {
  test("shows the same three steps on every device, with nothing to install or paste", async ({
    page,
  }) => {
    await page.goto("/welcome");
    await waitForHydration(page);

    const install = page.locator("#install");
    await expect(install.getByRole("heading", { level: 2, name: "Getting started" })).toBeVisible();
    await expect(install.getByRole("heading", { level: 4 })).toHaveText([
      "Sign in",
      "Add it to your home screen",
      "Connect your LMS",
    ]);

    // The connector, the phone hand-off and the token paste are gone for good.
    for (const dead of [/connector/i, /extension/i, /session token/i, /devtools/i]) {
      await expect(install.getByText(dead)).toHaveCount(0);
    }
    await expect(page.locator('a[href="/erp-connector.zip"]')).toHaveCount(0);
    await expect(page.locator('a[href^="/connect"]')).toHaveCount(0);
  });

  test("Get started links jump to the guide, and sign-in links stay unambiguous", async ({
    page,
  }) => {
    await page.goto("/welcome");
    await waitForHydration(page);

    // The first link named "Sign in" must be the real one (auth.spec relies on it).
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toHaveAttribute("href", "/login");
    // No guide link may contain that name.
    await expect(page.locator("#install").getByRole("link", { name: /sign.?in/i })).toHaveCount(0);

    await page.getByRole("main").getByRole("link", { name: "Get started" }).first().click();
    await expect(page).toHaveURL((url) => url.hash === "#install");
    await expect(page.locator("#install")).toBeInViewport();
  });

  test("the phone preview shows three screens and the captions switch between them", async ({ page }) => {
    await page.goto("/welcome");
    await waitForHydration(page);

    const preview = page.getByRole("region", { name: "See it on your phone" });
    await expect(preview.getByRole("heading", { level: 2, name: "See it on your phone" })).toBeVisible();
    // One caption per screen; the first is showing.
    await expect(preview.locator("button[aria-pressed]")).toHaveCount(3);
    await expect(preview.getByRole("button", { name: /^Home/ })).toHaveAttribute("aria-pressed", "true");

    await preview.getByRole("button", { name: /^Results/ }).click();
    await expect(preview.getByRole("button", { name: /^Results/ })).toHaveAttribute("aria-pressed", "true");
    await expect(preview.getByRole("button", { name: /^Home/ })).toHaveAttribute("aria-pressed", "false");

    // Motion is allowed here, so the preview can be paused.
    await preview.getByRole("button", { name: "Pause the preview" }).click();
    await expect(preview.getByRole("button", { name: "Play the preview" })).toBeVisible();
  });

  test("with reduced motion the preview holds still until a caption is chosen", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/welcome");
    await waitForHydration(page);

    const preview = page.getByRole("region", { name: "See it on your phone" });
    await preview.scrollIntoViewIfNeeded();
    // Longer than one slide (4.5 s) of the animated preview: nothing moved on.
    await page.waitForTimeout(5000);
    await expect(preview.getByRole("button", { name: /^Home/ })).toHaveAttribute("aria-pressed", "true");
    await expect(preview.getByRole("button", { name: /preview$/ })).toHaveCount(0);
    await preview.getByRole("button", { name: /^Attendance/ }).click();
    await expect(preview.getByRole("button", { name: /^Attendance/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("the questions open and close", async ({ page }) => {
    await page.goto("/welcome");
    await waitForHydration(page);

    const faq = page.getByRole("region", { name: "Questions" });
    await expect(faq.locator("details")).toHaveCount(5);
    const item = faq.locator("details").filter({ hasText: "Is my password stored?" });
    const answer = item.getByText("It is exchanged once for a session and then discarded");
    await expect(answer).toBeHidden();
    await item.getByText("Is my password stored?").click();
    await expect(answer).toBeVisible();
    await item.getByText("Is my password stored?").click();
    await expect(answer).toBeHidden();
  });

  test("the header links jump to their sections", async ({ page, isMobile }) => {
    test.skip(isMobile, "the section links are hidden on phones; the header keeps only the sign-in button");
    await page.goto("/welcome");
    await waitForHydration(page);

    const nav = page.getByRole("navigation", { name: "On this page" });
    for (const [name, id] of [
      ["What you get", "features"],
      ["Getting started", "install"],
      ["Privacy", "sign-in"],
    ] as const) {
      await nav.getByRole("link", { name }).click();
      await expect(page).toHaveURL((url) => url.hash === `#${id}`);
      await expect(page.locator(`#${id}`)).toBeInViewport();
    }
    await expect(page.locator("#sign-in").getByRole("heading", { level: 2, name: "Privacy" })).toBeVisible();
  });

  test("no horizontal overflow and no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()} [${msg.location().url}]`);
    });

    await page.goto("/welcome");
    await waitForHydration(page);
    await page.locator("#install").scrollIntoViewIfNeeded();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
