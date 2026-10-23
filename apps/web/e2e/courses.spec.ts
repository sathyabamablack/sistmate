import { test, expect, pageHeading, waitForHydration } from "./helpers";

test.describe("courses (in-app LMS)", () => {
  test("course list links to in-app pages and has no external links", async ({ loggedInPage: page }) => {
    await page.goto("/courses");
    await expect(pageHeading(page, "Courses")).toBeVisible();

    const main = page.getByRole("main");
    await expect(main.locator('a[target="_blank"]')).toHaveCount(0);
    await expect(main.locator('a[href^="http"]')).toHaveCount(0);

    const link = main.getByRole("link", { name: "Design and Analysis of Algorithms" });
    await expect(link).toHaveCount(1);
    await link.click();
    await expect(page).toHaveURL(/\/courses\/101$/);
    await expect(pageHeading(page, "Design and Analysis of Algorithms")).toBeVisible();
  });

  test("course page shows units, files and quiet assignment rows", async ({ loggedInPage: page }) => {
    await page.goto("/courses/101");
    const main = page.getByRole("main");

    await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(main.getByRole("heading", { level: 2, name: "Unit 3: Dynamic programming" })).toBeVisible();
    // Assignments are still listed inside their unit, as ordinary rows.
    await expect(main.getByText(/Not submitted/).first()).toBeVisible();
    const graded = main.getByText(/Graded · 9 \/ 10/);
    await expect(graded).toHaveCount(1);
    await expect(graded).toBeVisible();

    // Files are served by the app's own route, never by an LMS URL, and appear once.
    const fileLink = main.getByRole("link", { name: "Unit 3 - Dynamic Programming.pdf" });
    await expect(fileLink).toHaveCount(1);
    await expect(fileLink).toHaveAttribute("href", /^\/api\/lms\/file\?/);
    await expect(main.getByRole("link", { name: "View" }).first()).toHaveAttribute("target", "_blank");

    // Page content expands in place.
    await main.getByText("Matrix chain multiplication: recurrence and table fill order").click();
    await expect(main.getByText("Fill the table by increasing chain length")).toBeVisible();
  });

  test("a file downloads through the app with safe headers", async ({ loggedInPage: page }) => {
    await page.goto("/courses/101");
    const href = await page
      .getByRole("main")
      .getByRole("link", { name: "Unit 3 - Dynamic Programming.pdf" })
      .getAttribute("href");
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toMatch(/^attachment; filename="Unit 3 - Dynamic Programming\.pdf"/);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");
  });

  test("the file route rejects bad references and signed-out requests", async ({ loggedInPage: page, playwright, baseURL }) => {
    expect((await page.request.get("/api/lms/file?course=101&cm=1&group=files&i=0")).status()).toBe(404);
    expect((await page.request.get("/api/lms/file?course=abc&cm=1&i=0")).status()).toBe(400);
    expect((await page.request.get("/api/lms/file?course=101&cm=1&i=0&group=../../etc")).status()).toBe(400);

    const anon = await playwright.request.newContext({ baseURL });
    expect((await anon.get("/api/lms/file?course=101&cm=8101&group=files&i=0")).status()).toBe(401);
    await anon.dispose();
  });

  test("assignment page shows description, status and read-only note", async ({ loggedInPage: page }) => {
    await page.goto("/courses/102/assignments/5002");
    const main = page.getByRole("main");
    await expect(pageHeading(page, "Assignment 3: Normalization to BCNF")).toBeVisible();
    await expect(main.getByText("Graded · 18 / 20").first()).toBeVisible();
    await expect(main.getByText("Show the closure computation for R3.")).toBeVisible();
    await expect(main.getByText(/read-only/)).toBeVisible();

    await page.goto("/courses/103/assignments/5003");
    await expect(page.getByRole("main").getByText(/Not submitted · overdue by/).first()).toBeVisible();
  });

  test("unknown course or assignment is a 404 inside the app", async ({ loggedInPage: page }) => {
    await page.goto("/courses/999");
    await expect(page.getByRole("heading", { name: "Course not found" })).toBeVisible();
  });

  test("course page has no horizontal scroll on a phone", async ({ loggedInPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/courses/101");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test.describe("course page as a study page", () => {
    test("header shows progress and grade, with no to-do summary", async ({ loggedInPage: page }) => {
      await page.goto("/courses/101");
      const main = page.getByRole("main");

      await expect(main.getByRole("progressbar", { name: "Course progress" })).toBeVisible();
      await expect(main.getByText("72%", { exact: true })).toBeVisible();
      await expect(main.getByText("34.5 / 50")).toBeVisible();
      await expect(main.getByText("4 units, 9 files")).toBeVisible();
      for (const gone of ["Next up", "To submit", "Overdue", "Due this week"]) {
        await expect(main.getByText(gone, { exact: true })).toHaveCount(0);
      }
      await expect(main.getByRole("heading", { name: "To do" })).toHaveCount(0);
      await expect(main.getByRole("button", { name: /^To do/ })).toHaveCount(0);
    });

    test("units start open and group items by kind, study material first", async ({ loggedInPage: page }) => {
      await page.goto("/courses/101");
      await waitForHydration(page);
      const main = page.getByRole("main");

      await expect(page.locator("#unit-0 > details")).toHaveAttribute("open", "");
      await expect(page.locator("#unit-4 > details")).toHaveAttribute("open", "");
      await expect(main.getByText("Course outline and evaluation scheme")).toBeVisible();
      await expect(page.locator("#unit-3").getByRole("heading", { level: 3 })).toHaveText([
        "Files",
        "Pages and links",
        "Quizzes",
        "Other activities",
      ]);

      // Collapsing keeps the unit heading on screen.
      await page.locator("#unit-3 > details > summary").click();
      await expect(page.locator("#unit-3 > details")).not.toHaveAttribute("open", "");
      await expect(main.getByRole("heading", { level: 2, name: "Unit 3: Dynamic programming" })).toBeVisible();
      await expect(main.getByRole("link", { name: "Unit 3 - Dynamic Programming.pdf" })).toBeHidden();
    });

    test("search this course matches unit, module and file names", async ({ loggedInPage: page }) => {
      await page.goto("/courses/101");
      await waitForHydration(page);
      const main = page.getByRole("main");
      const search = main.getByRole("searchbox", { name: "Search this course" });

      // Lab 4 also mentions "matrix", so match words only the page title has.
      await search.fill("fill order");
      await expect(main.getByText("Showing 1 of 13 items.")).toBeVisible();
      await expect(main.getByRole("heading", { level: 2, name: "Unit 3: Dynamic programming" })).toBeVisible();
      await expect(main.getByRole("heading", { level: 2, name: "Unit 1: Algorithm analysis" })).toBeHidden();

      await search.fill("recurrences");
      await expect(main.getByRole("link", { name: "Unit 1 - Recurrences Worked Examples.pdf" })).toBeVisible();

      await search.fill("zzzz");
      await expect(main.getByText("Nothing matches")).toBeVisible();
      await main.getByRole("button", { name: "Clear search" }).click();
      await expect(search).toHaveValue("");
      await expect(main.getByText("Nothing matches")).toBeHidden();
      await expect(main.getByRole("heading", { level: 2, name: "Unit 1: Algorithm analysis" })).toBeVisible();
    });

    test("All files lists every file once in a flat, searchable list", async ({ loggedInPage: page }) => {
      await page.goto("/courses/101");
      await waitForHydration(page);
      const main = page.getByRole("main");
      const byUnit = main.getByRole("button", { name: "By unit" });
      const allFiles = main.getByRole("button", { name: /^All files/ });
      const fileLink = main.getByRole("link", { name: "Unit 3 - Dynamic Programming.pdf" });

      await expect(byUnit).toHaveAttribute("aria-pressed", "true");
      await allFiles.click();
      await expect(allFiles).toHaveAttribute("aria-pressed", "true");
      await expect(byUnit).toHaveAttribute("aria-pressed", "false");
      await expect(main.getByRole("heading", { level: 2, name: "Unit 3: Dynamic programming" })).toBeHidden();
      await expect(fileLink).toHaveCount(1);
      await expect(fileLink).toBeVisible();
      await expect(fileLink).toHaveAttribute("href", /^\/api\/lms\/file\?/);
      await expect(main.getByRole("link", { name: "CIA-2 2024.pdf" })).toBeVisible();
      // Assignments and pages are not files.
      await expect(main.getByText(/Graded · 9 \/ 10/)).toBeHidden();

      await main.getByRole("searchbox", { name: "Search this course" }).fill("recurrences");
      await expect(main.getByText("Showing 1 of 9 files.")).toBeVisible();
      await expect(main.getByRole("link", { name: "Unit 1 - Recurrences Worked Examples.pdf" })).toBeVisible();
      await expect(fileLink).toHaveCount(0);

      await main.getByRole("searchbox", { name: "Search this course" }).fill("");
      await byUnit.click();
      await expect(main.getByRole("heading", { level: 2, name: "Unit 3: Dynamic programming" })).toBeVisible();
      await expect(fileLink).toHaveCount(1);
    });

    test("unit chips scroll inside their own row on a phone and jump to a unit", async ({ loggedInPage: page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/courses/101");
      await waitForHydration(page);
      const main = page.getByRole("main");
      const nav = main.getByRole("navigation", { name: "Units" });
      await expect(nav).toBeVisible();

      const scrolls = await nav.locator("ol").evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(scrolls).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

      // A collapsed unit opens when its chip is used.
      await page.locator("#unit-4 > details > summary").click();
      await expect(page.locator("#unit-4 > details")).not.toHaveAttribute("open", "");
      await nav.getByRole("link", { name: /^Unit 4: Graph algorithms/ }).click();
      await expect(page.locator("#unit-4 > details")).toHaveAttribute("open", "");
      await expect(main.getByText("Previous year question papers")).toBeVisible();

      // From the All files view, a chip switches back to the units.
      await main.getByRole("button", { name: /^All files/ }).click();
      await nav.getByRole("link", { name: /^Unit 2: Divide and conquer/ }).click();
      await expect(main.getByRole("button", { name: "By unit" })).toHaveAttribute("aria-pressed", "true");
      await expect(main.getByRole("heading", { level: 2, name: "Unit 2: Divide and conquer" })).toBeInViewport();
    });

    test("rows show the LMS's own dates", async ({ loggedInPage: page }) => {
      await page.goto("/courses/101");
      await expect(page.getByRole("main").getByText(/^Added \d{1,2} \w{3}/).first()).toBeVisible();
    });
  });

  test.describe("course list", () => {
    test("cards show code, progress, grade, materials and when the course was last opened", async ({
      loggedInPage: page,
    }) => {
      await page.goto("/courses");
      const main = page.getByRole("main");
      const card = main
        .getByRole("listitem")
        .filter({ has: page.getByRole("link", { name: "Design and Analysis of Algorithms", exact: true }) });
      await expect(card.getByText("SCSA5105")).toBeVisible();
      await expect(card.getByRole("progressbar")).toBeVisible();
      await expect(card.getByText(/69 %/)).toBeVisible();
      await expect(card.getByText("4 units, 9 files")).toBeVisible();
      await expect(card.getByText(/^Opened .* ago$/)).toBeVisible();
      // No to-do columns or filters any more.
      await expect(main.getByText(/to submit|overdue|Next deadline/i)).toHaveCount(0);
      await expect(main.getByRole("navigation", { name: "Filter courses" })).toHaveCount(0);
    });

    test("most recently opened courses come first", async ({ loggedInPage: page }) => {
      await page.goto("/courses");
      const names = await page.getByRole("main").getByRole("listitem").getByRole("heading", { level: 2 }).allTextContents();
      expect(names.slice(0, 2)).toEqual(["Design and Analysis of Algorithms", "Computer Networks"]);
      expect(names.at(-1)).toBe("Software Engineering");
    });

    test("search filters courses by name or code", async ({ loggedInPage: page }) => {
      await page.goto("/courses");
      await waitForHydration(page);
      const main = page.getByRole("main");
      const course = (name: string) => main.getByRole("link", { name, exact: true });
      const search = main.getByRole("searchbox", { name: "Search courses" });

      await search.fill("scsa5103");
      await expect(course("Database Management Systems")).toBeVisible();
      await expect(course("Operating Systems")).toHaveCount(0);
      await expect(main.getByText("1 of 6 courses match")).toBeVisible();

      await search.fill("operating");
      await expect(course("Operating Systems")).toBeVisible();

      await search.fill("zzzz");
      await expect(main.getByText("No course matches")).toBeVisible();
      await main.getByRole("button", { name: "Clear search" }).click();
      await expect(course("Operating Systems")).toBeVisible();
    });

    test("choose courses hides a course everywhere and Every semester brings it back", async ({ loggedInPage: page }) => {
      await page.goto("/courses");
      await waitForHydration(page);
      const main = page.getByRole("main");
      const course = (name: string) => main.getByRole("link", { name, exact: true });
      const dialog = page.getByRole("dialog", { name: "Choose courses" });

      await expect(course("Computer Networks")).toBeVisible();
      await main.getByRole("button", { name: "Choose courses" }).click();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("radio", { name: "This semester" })).toBeEnabled();
      await dialog.getByRole("checkbox", { name: /Computer Networks/ }).uncheck();
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog).toBeHidden();

      await expect(course("Computer Networks")).toHaveCount(0);
      await expect(main.getByText("This semester, 5 of 6 courses.")).toBeVisible();

      // Gone from the dashboard too, but the course page still opens directly.
      await page.goto("/");
      await expect(page.locator("#courses").getByText("Computer Networks")).toHaveCount(0);
      await page.goto("/courses/104");
      await expect(pageHeading(page, "Computer Networks")).toBeVisible();

      await page.goto("/courses");
      await waitForHydration(page);
      await main.getByRole("button", { name: "Choose courses" }).click();
      await dialog.getByRole("radio", { name: "Every semester" }).click();
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(course("Computer Networks")).toBeVisible();
      await expect(main.getByText(/\d+ of \d+ courses\.$/)).toHaveCount(0);
    });

    test("settings links to the course chooser", async ({ loggedInPage: page }) => {
      await page.goto("/settings");
      await page.getByRole("main").getByRole("link", { name: "Choose courses" }).click();
      await expect(page).toHaveURL(/\/courses\?choose=1$/);
      await expect(page.getByRole("dialog", { name: "Choose courses" })).toBeVisible();
    });
  });
});
