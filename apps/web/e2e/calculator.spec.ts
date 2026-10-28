import { test, expect, waitForHydration } from "./helpers";

const CHANGE_CN = "Change credits, target and expected marks for Computer Networks";

test.describe("CGPA planner", () => {
  test("builds internal marks from the ERP's CAE scores and plans the external", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/calculator");
    await waitForHydration(page);
    await expect(page.getByRole("heading", { level: 1, name: "CGPA planner" })).toBeVisible();

    const row = page.getByRole("listitem").filter({ hasText: "Computer Networks" });
    // mock CAE 17 and 18: (17 + 18) x 0.3 + 20 = 30.5, rounded to 31
    await expect(row.getByLabel("Computer Networks CAE 1")).toHaveValue("17");
    await expect(row).toContainText("31");
    await expect(row).not.toContainText(".50");
    // A theory paper is written for 100 and converted to 50: A+ needs 49 of 50, so 98 on the paper.
    await expect(row).toContainText("Need 98/100 in the exam");
    await expect(row).toContainText("49/50 after conversion, for A+");

    // An expected score goes in on the paper's scale: 80 of 100 is 40 of 50.
    await row.getByRole("button", { name: CHANGE_CN }).click();
    await row.getByLabel("Computer Networks expected exam marks").fill("80");
    await expect(row).toContainText("40/50 after conversion.");
    await expect(row).toContainText("expecting 80/100");
    await expect(row).toContainText("71 of 100"); // 31 + 40, a B++
    await expect(row).toContainText("B++");
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
    const row = page.getByRole("listitem").filter({ hasText: "Computer Networks" });
    const expected = row.getByLabel("Computer Networks expected exam marks");
    await row.getByRole("button", { name: CHANGE_CN }).click();
    await expected.fill("66");

    await page.reload();
    await waitForHydration(page);
    await expect(row).toContainText("expecting 66/100");
    await row.getByRole("button", { name: CHANGE_CN }).click();
    await expect(expected).toHaveValue("66");

    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(expected).toHaveValue("");
    await expect(row).not.toContainText("expecting");
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
    // internal 31, so A+ (80) needs 49 of 50 and B++ (70) needs 39: 98 and 78 on the paper
    await expect(row).toContainText("Need 98/100 in the exam");
    await expect(page.getByLabel("Target grade", { exact: true })).toHaveValue("A+");

    await page.getByLabel("Target grade", { exact: true }).selectOption("B++");
    await expect(row).toContainText("Need 78/100 in the exam");
    await expect(row).toContainText("39/50 after conversion, for B++");
    await expect(row).not.toContainText("for A");
    await expect(page.getByRole("region", { name: "Semester summary" })).toContainText(
      /You need about [\d.]+\/(?:100|50) (?:in each exam|on theory papers).* for B\+\+/,
    );

    await page.reload();
    await waitForHydration(page);
    await expect(page.getByLabel("Target grade", { exact: true })).toHaveValue("B++");
  });

  test("one subject can aim for a different grade than the semester", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/calculator");
    await waitForHydration(page);
    const row = page.getByRole("listitem").filter({ hasText: "Computer Networks" });
    // Credits, the per-subject target and an expected score sit behind the subject's "Change" toggle.
    await row.getByRole("button", { name: CHANGE_CN }).click();
    await row.getByLabel("Computer Networks target grade").selectOption("A++");
    // internal 31 plus a full 50 external cannot reach A++ (90); 81 is an A+
    await expect(row).toContainText("A++ is out of reach (best is A+)");
    await expect(row).toContainText("aiming for A++");
    await expect(page.getByLabel("Target grade", { exact: true })).toHaveValue("A+");
  });

  test("a target semester GPA picks the grade for every subject", async ({ loggedInPage: page }) => {
    await page.goto("/calculator");
    await waitForHydration(page);
    const summary = page.getByRole("region", { name: "Semester summary" });
    const row = page.getByRole("listitem").filter({ hasText: "Computer Networks" });
    await summary.getByRole("radio", { name: "Semester GPA", exact: true }).click();
    await summary.getByLabel("Target semester GPA").fill("8");
    // B++ everywhere gives exactly 8.00; A+ everywhere would overshoot
    await expect(summary).toContainText("Get B++ in every subject for a semester GPA of 8.00.");
    await expect(row).toContainText("Need 78/100 in the exam");

    // The goal survives a reload, and going back to a grade keeps the grade it worked out to.
    await page.reload();
    await waitForHydration(page);
    await expect(summary.getByLabel("Target semester GPA")).toHaveValue("8");
    await summary.getByRole("radio", { name: "Grade", exact: true }).click();
    await expect(page.getByLabel("Target grade", { exact: true })).toHaveValue("B++");
  });

  test("a CGPA out of reach says so and shows the best you can do", async ({ loggedInPage: page }) => {
    await page.goto("/calculator");
    await waitForHydration(page);
    const summary = page.getByRole("region", { name: "Semester summary" });
    await summary.getByRole("radio", { name: "CGPA", exact: true }).click();
    await summary.getByLabel("Target CGPA").fill("9.9");
    await expect(summary).toContainText(
      /That takes a semester GPA of [\d.]+, but the most your marks allow is [\d.]+\./,
    );
    await expect(summary).toContainText("Below is the best you can do.");
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
