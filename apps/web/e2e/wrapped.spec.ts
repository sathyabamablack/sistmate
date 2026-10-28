import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect, pageHeading, waitForHydration } from "./helpers";

/** The story, its current slide and how many slides there are. */
async function openWrapped(page: Page) {
  await page.goto("/results/wrapped");
  await expect(pageHeading(page, /^Semester \d+ wrapped$/)).toBeVisible();
  await waitForHydration(page);
  const story = page.getByRole("region", { name: /^Semester \d+ wrapped$/ });
  const slide = story.locator('[aria-roledescription="slide"]');
  await expect(slide).toHaveAttribute("aria-label", /^1 of \d+$/);
  const total = Number((await slide.getAttribute("aria-label"))!.split(" of ")[1]);
  expect(total).toBeGreaterThanOrEqual(5);
  return { story, slide, total };
}

test.describe("semester wrapped", () => {
  test("slides advance by click and by keyboard, and each one is announced", async ({ loggedInPage: page }) => {
    const { story, slide, total } = await openWrapped(page);
    // The demo student's results are worked out from marks, and the slides say so.
    await expect(story.getByRole("heading", { name: /Your GPA/ })).toBeVisible();
    await expect(story.getByText("Estimated", { exact: true })).toBeVisible();

    await story.getByRole("button", { name: "Next slide" }).click();
    await expect(slide).toHaveAttribute("aria-label", `2 of ${total}`);
    await expect(story.getByRole("heading", { name: /Your CGPA/ })).toBeVisible();
    await expect(page.getByText(new RegExp(`^Slide 2 of ${total}\\. CGPA`))).toBeAttached();

    await page.keyboard.press("ArrowRight");
    await expect(slide).toHaveAttribute("aria-label", `3 of ${total}`);
    await page.keyboard.press("ArrowLeft");
    await expect(slide).toHaveAttribute("aria-label", `2 of ${total}`);

    await story.getByRole("button", { name: "Previous slide" }).click();
    await expect(slide).toHaveAttribute("aria-label", `1 of ${total}`);
    // Nothing before the first slide.
    await page.keyboard.press("ArrowLeft");
    await expect(slide).toHaveAttribute("aria-label", `1 of ${total}`);

    await page.keyboard.press("End");
    await expect(slide).toHaveAttribute("aria-label", `${total} of ${total}`);
    await page.keyboard.press("Home");
    await expect(slide).toHaveAttribute("aria-label", `1 of ${total}`);
  });

  test("a swipe moves between slides", async ({ loggedInPage: page }) => {
    const { story, slide, total } = await openWrapped(page);
    const box = (await story.boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.8, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, y, { steps: 6 });
    await page.mouse.up();
    await expect(slide).toHaveAttribute("aria-label", `2 of ${total}`);
  });

  test("the summary hides the GPA on request and shares or downloads a 1080 x 1920 image", async ({
    loggedInPage: page,
  }) => {
    const { story, slide, total } = await openWrapped(page);
    await page.keyboard.press("End");
    await expect(slide).toHaveAttribute("aria-label", `${total} of ${total}`);

    const summary = story.getByRole("region", { name: "Summary card" });
    await expect(summary.getByText(/^Semester \d+ GPA/)).toBeVisible();
    await expect(summary.getByText("CGPA", { exact: true })).toBeVisible();
    await expect(summary.getByText("Best subject")).toBeVisible();
    await expect(summary.getByText(/^Estimated from marks/)).toBeVisible();

    const hide = story.getByRole("switch", { name: "Hide GPA" });
    await expect(hide).toHaveAttribute("aria-checked", "false");
    await hide.click();
    await expect(hide).toHaveAttribute("aria-checked", "true");
    await expect(summary.getByText(/GPA/)).toHaveCount(0);
    // Everything else stays.
    await expect(summary.getByText("Best subject")).toBeVisible();
    await expect(summary.getByText("Credits earned")).toBeVisible();

    await expect(story.getByRole("button", { name: "Share" })).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      story.getByRole("button", { name: "Download" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^semester-\d+-wrapped\.png$/);
    const png = readFileSync((await download.path())!);
    // PNG signature, then the IHDR width and height.
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1080);
    expect(png.readUInt32BE(20)).toBe(1920);

    // Back to the start from the summary.
    await story.getByRole("button", { name: "Watch again" }).click();
    await expect(slide).toHaveAttribute("aria-label", `1 of ${total}`);
  });

  test("fits a phone without sideways scrolling", async ({ loggedInPage: page }) => {
    await openWrapped(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
