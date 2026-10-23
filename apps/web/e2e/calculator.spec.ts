import { test, expect, waitForHydration } from "./helpers";

test.describe("CGPA planner", () => {
  test("builds internal marks from the ERP's CAE scores and plans the external", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/calculator");
    await waitForHydration(page);
    await expect(page.getByRole("heading", { level: 1, name: "CGPA planner" })).toBeVisible();

    const row = page.getByRole("listitem").filter({ hasText: "Computer Networks" });
    // mock CAE 17 and 18: (17 + 18) x 0.3 + 25 = 35.5, rounded to 36
    await expect(row.getByLabel("Computer Networks CAE 1")).toHaveValue("17");
    await expect(row).toContainText("36");
    await expect(row).not.toContainText(".50");
    await expect(row).toContainText("for A+");

    await row.getByLabel("Computer Networks external marks").fill("40");
    await expect(row).toContainText("76"); // 36 + 40, a B++
    await expect(row).toContainText("B++");
    await expect(row).not.toContainText("planned");
  });

  test("changing assignment and attendance marks changes the internal", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/calculator");
    await waitForHydration(page);
    const row = page.getByRole("listitem").filter({ hasText: "Computer Networks" });
    await row.getByLabel("Computer Networks assignment and attendance marks").fill("18");
    await expect(row).toContainText("29"); // (17 + 18) x 0.3 + 18 = 28.5, rounded
  });

  test("keeps your inputs after a reload and can reset them", async ({ loggedInPage: page }) => {
    await page.goto("/calculator");
    await waitForHydration(page);
    const external = page
      .getByRole("listitem")
      .filter({ hasText: "Computer Networks" })
      .getByLabel("Computer Networks external marks");
    await external.fill("33");

    await page.reload();
    await waitForHydration(page);
    await expect(external).toHaveValue("33");

    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(external).toHaveValue("");
  });

  test("projects the CGPA once earlier CGPA and credits are entered", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/calculator");
    await waitForHydration(page);
    const summary = page.getByRole("region", { name: "Semester summary" });
    // Earlier semesters' marks give an estimated CGPA, so the fields start filled in.
    await expect(page.getByText("Estimated").first()).toBeVisible();
    await expect(summary).toContainText("With this semester added.");
    await expect(summary).not.toContainText("Enter your CGPA and credits below");

    // Typed values win over the estimate.
    await page.getByLabel("CGPA so far").fill("8");
    await page.getByLabel("Credits completed").fill("60");
    await expect(page.getByLabel("CGPA so far")).toHaveValue("8");
    await expect(summary).toContainText("With this semester added.");
  });

  test("a chosen target grade changes the external marks needed", async ({ loggedInPage: page }) => {
    await page.goto("/calculator");
    await waitForHydration(page);
    const row = page.getByRole("listitem").filter({ hasText: "Computer Networks" });
    // internal 36, so A+ (80) needs 44 and B++ (70) needs 34
    await expect(row).toContainText("Need 44 of 50 for A+");
    await expect(page.getByLabel("Target grade for this semester")).toHaveValue("A+");

    await page.getByLabel("Target grade for this semester").selectOption("B++");
    await expect(row).toContainText("Need 34 of 50 for B++");
    await expect(row).not.toContainText("for A");
    await expect(page.getByRole("region", { name: "Semester summary" })).toContainText(
      "external marks on average",
    );

    await page.reload();
    await waitForHydration(page);
    await expect(page.getByLabel("Target grade for this semester")).toHaveValue("B++");
  });

  test("one subject can aim for a different grade than the semester", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/calculator");
    await waitForHydration(page);
    const row = page.getByRole("listitem").filter({ hasText: "Computer Networks" });
    await row.getByLabel("Computer Networks target grade").selectOption("A++");
    // internal 36 plus a full 50 external cannot reach A++ (90); 86 is an A+
    await expect(row).toContainText("A++ is out of reach (best is A+)");
    await expect(page.getByLabel("Target grade for this semester")).toHaveValue("A+");
  });

  test("a target semester GPA suggests a grade and can apply it", async ({ loggedInPage: page }) => {
    await page.goto("/calculator");
    await waitForHydration(page);
    const summary = page.getByRole("region", { name: "Semester summary" });
    await expect(summary.getByRole("heading", { name: "Or aim for a number" })).toBeVisible();
    await summary.getByLabel("Target semester GPA").fill("8");
    await expect(summary).toContainText(/Aim for [A-C+]+ in every subject/);
    await page.getByRole("button", { name: /^Use [A-C+]+ as the semester target$/ }).click();
    // B++ everywhere gives exactly 8.00; A+ everywhere would overshoot
    await expect(page.getByLabel("Target grade for this semester")).toHaveValue("B++");
  });

  test("is reachable from the navigation", async ({ loggedInPage: page, isMobile }) => {
    await page.goto("/");
    await waitForHydration(page);
    if (isMobile) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page.getByRole("dialog", { name: "Navigation" }).getByRole("link", { name: "CGPA planner" }).click();
    } else {
      await page.getByRole("navigation").getByRole("link", { name: "CGPA planner" }).click();
    }
    await expect(page).toHaveURL((u) => u.pathname === "/calculator");
  });
});
