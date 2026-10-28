import { test, expect, waitForHydration } from "./helpers";

// The default fixture adds X-Forwarded-For to every request, including the papers Worker calls,
// whose CORS rules don't allow it (see papers.spec.ts). apiLogin sets its own per request.
test.use({ extraHTTPHeaders: {} });

test.describe("Exam prep", () => {
  test("lists this semester's subjects and opens one", async ({ loggedInPage: page }) => {
    await page.goto("/prep");
    await waitForHydration(page);
    await expect(page.getByRole("heading", { level: 1, name: "Exam prep" })).toBeVisible();

    const main = page.getByRole("main");
    for (const title of ["Computer Networks", "Operating Systems", "Web Technology Laboratory"]) {
      await expect(main.getByRole("link", { name: new RegExp(title) })).toBeVisible();
    }
    // The planner's default target, and the one exam the demo calendar names a subject for.
    const cn = main.getByRole("link", { name: /Computer Networks/ });
    await expect(cn).toContainText("98/100 for A+");
    await expect(cn).toContainText("0 of 5 revised");
    await expect(main.getByRole("link", { name: /Operating Systems/ })).toContainText(/CIA-2 Examination in \d+ days/);

    await cn.click();
    await expect(page).toHaveURL(/\/prep\/SCSA5101$/);
    await expect(page.getByRole("heading", { level: 1, name: "Computer Networks" })).toBeVisible();
  });

  test("shows the exam marks the CGPA planner works out", async ({ loggedInPage: page }) => {
    await page.goto("/prep/SCSA5101");
    await waitForHydration(page);
    const need = page.getByRole("region", { name: "What you need" });
    // CAE 17 and 18 make the internal 31, so A+ takes 49 of 50: 98 on a paper written for 100.
    await expect(need).toContainText("98/100 in the exam (49/50 after conversion) for A+.");

    // Aim lower in the planner and read what it says...
    await need.getByRole("link", { name: "Change in CGPA planner" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "CGPA planner" })).toBeVisible();
    await waitForHydration(page);
    await page.getByLabel("Target grade").selectOption("B++");
    const row = page.getByRole("listitem").filter({ hasText: "Computer Networks" });
    await expect(row).toContainText("for B++");
    const text = (await row.textContent()) ?? "";
    const paper = /(\d+)\/100 in the exam/.exec(text)?.[1];
    const converted = /(\d+)\/50 after conversion/.exec(text)?.[1];
    expect(paper && converted).toBeTruthy();

    // ...and the prep pages say the same.
    await page.goto("/prep/SCSA5101");
    await waitForHydration(page);
    await expect(need).toContainText(`${paper}/100 in the exam (${converted}/50 after conversion) for B++.`);
    await page.goto("/prep");
    await waitForHydration(page);
    await expect(page.getByRole("main").getByRole("link", { name: /Computer Networks/ })).toContainText(
      `${paper}/100 for B++`,
    );
  });

  test("keeps the revision checklist after a reload", async ({ loggedInPage: page }) => {
    await page.goto("/prep/SCSA5101");
    await waitForHydration(page);
    const revision = page.getByRole("region", { name: "Revision" });
    await expect(revision).toContainText("0 of 5 revised");

    await revision.getByRole("checkbox", { name: "Unit 1" }).check();
    await revision.getByLabel("New topic").fill("Subnetting");
    await revision.getByRole("button", { name: "Add" }).click();
    await expect(revision).toContainText("1 of 6 revised");

    // Renaming and removing wait behind Edit topics.
    await revision.getByRole("button", { name: "Edit topics" }).click();
    await revision.getByLabel("Rename Unit 2").fill("Transport layer");
    await revision.getByLabel("Rename Unit 2").press("Enter");
    await revision.getByRole("button", { name: "Remove Unit 5" }).click();
    await revision.getByRole("button", { name: "Done" }).click();
    await expect(revision).toContainText("1 of 5 revised");

    await page.reload();
    await waitForHydration(page);
    await expect(revision.getByRole("checkbox", { name: "Unit 1" })).toBeChecked();
    await expect(revision.getByRole("checkbox", { name: "Transport layer" })).not.toBeChecked();
    await expect(revision.getByRole("checkbox", { name: "Subnetting" })).toBeVisible();
    await expect(revision.getByRole("checkbox", { name: "Unit 5" })).toHaveCount(0);
    await expect(revision).toContainText("1 of 5 revised");

    // The subject list reads the same checklist.
    await page.goto("/prep");
    await waitForHydration(page);
    await expect(page.getByRole("main").getByRole("link", { name: /Computer Networks/ })).toContainText("1 of 5 revised");
  });

  test("lists the subject's papers, its course and attendance", async ({ loggedInPage: page }) => {
    await page.goto("/prep/SCSA5101");
    await waitForHydration(page);
    const papers = page.getByRole("region", { name: /Previous papers|Papers and notes/ });
    await expect(papers).toBeVisible();
    await expect(papers.getByRole("button", { name: /^Share/ })).toBeVisible();
    // Loaded (the list, or the line saying there is nothing yet) and no error.
    await expect(papers).toContainText(/SCSA5101|Open|Download/);
    await expect(papers.getByRole("alert")).toHaveCount(0);

    const more = page.getByRole("region", { name: "Course and attendance" });
    await expect(more.getByRole("link", { name: /Course material on the LMS/ })).toHaveAttribute("href", "/courses/104");
    await expect(more.getByRole("link", { name: /attendance/ })).toHaveAttribute("href", "/attendance");
    await expect(more).toContainText("42 of 48 hours");
  });

  test("no horizontal scroll on a phone", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const overflows = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    await page.goto("/prep");
    await waitForHydration(page);
    expect(await overflows()).toBe(false);
    await page.goto("/prep/SCSA5102");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Edit topics" }).click();
    expect(await overflows()).toBe(false);
  });

  test("a subject that isn't this semester's is not found", async ({ loggedInPage: page }) => {
    await page.goto("/prep/SXXX9999");
    await expect(page.getByRole("heading", { level: 1, name: "Subject not found" })).toBeVisible();
    await page.getByRole("link", { name: "Back to exam prep" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Exam prep" })).toBeVisible();
  });
});
