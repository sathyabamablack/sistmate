import { test, expect, uiLogin, waitForHydration } from "./helpers";

test.describe("authentication", () => {
  test("unauthenticated /attendance redirects to /login", async ({ page }) => {
    await page.goto("/attendance");
    await expect(page).toHaveURL((url) => url.pathname === "/login");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("unauthenticated / shows the public overview with a working skip calculator", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL((url) => url.pathname === "/welcome");
    await expect(
      page.getByRole("heading", { level: 1, name: /skip tomorrow's class/i }),
    ).toBeVisible();

    await waitForHydration(page);
    const calc = page.getByRole("form", { name: "Skip calculator" });
    await expect(calc).toContainText("classes you can still skip");
    await calc.getByLabel("Hours attended").fill("30");
    await expect(calc).toContainText("to attend to get back to 80%");
    await calc.getByLabel("Hours attended").fill("60");
    await expect(calc.getByRole("alert")).toContainText("more hours than were marked");

    await page.getByRole("link", { name: "Sign in" }).first().click();
    await expect(page).toHaveURL((url) => url.pathname === "/login");
  });

  test("submitting an empty form shows a validation error and stays on /login", async ({
    page,
  }) => {
    await page.goto("/login");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(
      page.getByRole("alert").filter({ hasText: /Enter your register number/ }),
    ).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === "/login" && url.search === "");
  });

  test("offers one way in: register number and password, with nothing else to choose", async ({
    page,
  }) => {
    await page.goto("/login");
    const main = page.getByRole("main");
    await expect(main.locator("input")).toHaveCount(2);
    await expect(main.getByLabel("Register number")).toBeVisible();
    await expect(main.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(main.getByRole("button")).toHaveCount(1);
    // No LMS field, no connector, no token paste, no "other ways" disclosure.
    await expect(main.locator("details")).toHaveCount(0);
    for (const dead of [/LMS password/i, /connector/i, /session token/i, /accessToken/i]) {
      await expect(main.getByText(dead)).toHaveCount(0);
    }
  });

  test("UI login lands on the dashboard", async ({ page }) => {
    await uiLogin(page);

    await expect(
      page.getByRole("main").getByRole("heading", {
        level: 1,
        name: /^Good (morning|afternoon|evening), /,
      }),
    ).toBeVisible();

    const main = page.getByRole("main");
    for (const name of ["At a glance", "Attendance", "Due soon", "Notifications"]) {
      await expect(main.getByRole("heading", { name })).toBeVisible();
    }
    await expect(main.getByText("CGPA", { exact: true })).toBeVisible();
    await expect(main.getByText("Unread alerts")).toHaveCount(0);
  });

  test("logout returns to /login and protected pages stay locked", async ({
    loggedInPage: page,
    isMobile,
  }) => {
    await page.goto("/");
    await waitForHydration(page);

    if (isMobile) {
      // Below lg the log out button lives in the account menu.
      await page.getByRole("button", { name: "Account menu" }).click();
      await page.getByRole("menuitem", { name: "Log out" }).click();
    } else {
      await page.getByRole("button", { name: "Log out" }).click();
    }
    await expect(page).toHaveURL((url) => url.pathname === "/login");

    await page.goto("/attendance");
    await expect(page).toHaveURL((url) => url.pathname === "/login");

    await page.goto("/");
    await expect(page).toHaveURL((url) => url.pathname === "/welcome");
  });
});
