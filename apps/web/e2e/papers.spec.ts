import type { Page } from "@playwright/test";
import { test, expect, apiLogin, waitForHydration } from "./helpers";

/**
 * Question papers against a local papers Worker (started by playwright.config.ts). Desktop and
 * mobile run in parallel on one Worker, so each test shares papers under its own made-up subject
 * code, or with unique file contents.
 */

/** PAPERS_ADMINS in playwright.config.ts. */
const ADMIN = "41119999";

// The default fixture adds X-Forwarded-For to every request, including the cross-origin calls to
// the Worker, whose CORS rules (rightly) don't allow it. apiLogin sets its own per request.
test.use({ extraHTTPHeaders: {} });

const uniqueCode = () => `SZZ${Math.floor(100000 + Math.random() * 900000)}`;
const pdf = (tag: string) => ({
  name: "paper.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from(`%PDF-1.4\n% e2e ${tag} ${Date.now()} ${Math.random()}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`),
});
/** A real PNG drawn by the browser, so it decodes like a phone photo would. */
async function photo(page: Page, colour: string): Promise<Buffer> {
  const dataUrl = await page.evaluate((fill) => {
    const c = document.createElement("canvas");
    c.width = 40;
    c.height = 60;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 40, 60);
    return c.toDataURL("image/png");
  }, colour);
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

async function share(page: Page, opts: { code: string; title?: string; files: Parameters<Page["setInputFiles"]>[1] }) {
  await page.goto("/papers");
  await waitForHydration(page);
  await page.getByRole("main").getByRole("button", { name: "Share a paper" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Share a question paper" });
  const subject = dialog.getByLabel("Subject", { exact: true });
  const known = await subject.locator(`option[value="${opts.code}"]`).count();
  if (known) {
    await subject.selectOption(opts.code);
  } else {
    await subject.selectOption("__other");
    await dialog.getByLabel("Subject code").fill(opts.code);
    await dialog.getByLabel("Subject name").fill(opts.title ?? "E2E Subject");
  }
  await dialog.getByLabel("Kind").selectOption("model");
  await dialog.getByLabel("Year").selectOption(String(new Date().getFullYear() - 1));
  await dialog.getByLabel("File").setInputFiles(opts.files);
  await dialog.getByRole("button", { name: "Share paper" }).click();
  await expect(dialog.getByText("Thanks! It's in the queue.")).toBeVisible();
  await page.keyboard.press("Escape");
}

/** Signs in as the admin and approves every waiting paper for `code`; returns their file links. */
async function approveAll(page: Page, code: string): Promise<string[]> {
  await apiLogin(page, ADMIN);
  await page.goto("/papers/review");
  await waitForHydration(page);
  const items = page.getByRole("main").locator("div[aria-labelledby^='review-']").filter({ hasText: code });
  await expect(items.first()).toBeVisible();
  // Pin each item by its id: after one is approved, "first()" would point at the next one.
  const ids = await items.evaluateAll((els) => els.map((el) => el.getAttribute("aria-labelledby")!));
  const hrefs: string[] = [];
  for (const id of ids) {
    const item = page.locator(`[aria-labelledby="${id}"]`);
    hrefs.push((await item.getByRole("link", { name: "Open file" }).getAttribute("href")) ?? "");
    await item.getByRole("button", { name: "Approve" }).click();
    await expect(item).toBeHidden();
  }
  return hrefs;
}

test.describe("question papers", () => {
  test("a shared paper waits for review, then everyone can open and report it", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const code = uniqueCode();

    await apiLogin(page);
    await share(page, { code, title: "E2E Algorithms", files: pdf(code) });

    // Not visible to students until approved.
    await page.goto(`/papers?q=${code}`);
    await expect(page.getByText(`No papers match “${code}”`)).toBeVisible();

    const [href] = await approveAll(page, code);
    const file = await page.request.get(href!);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-type"]).toBe("application/pdf");
    expect((await file.body()).subarray(0, 5).toString()).toBe("%PDF-");

    // Another student finds it and flags it.
    await apiLogin(page);
    await page.goto(`/papers?q=${code}`);
    await waitForHydration(page);
    const group = page.getByRole("main").locator(`[aria-labelledby="papers-${code}"]`);
    await expect(group.getByRole("heading", { name: "E2E Algorithms" })).toBeVisible();
    await expect(group.getByRole("link", { name: new RegExp(`^Open ${code} Model exam`) })).toHaveAttribute("target", "_blank");
    await group.getByRole("button", { name: new RegExp(`^Report ${code}`) }).click();
    await page.getByRole("menuitem", { name: "Can't read it" }).click();
    await expect(group.getByText("Thanks, we'll take a look.")).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("photos are joined into one PDF in the browser", async ({ page }) => {
    const code = uniqueCode();
    await apiLogin(page);
    await page.goto("/papers");
    const files = [
      { name: "page1.png", mimeType: "image/png", buffer: await photo(page, `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`) },
      { name: "page2.png", mimeType: "image/png", buffer: await photo(page, `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`) },
    ];
    await share(page, { code, files });
    const [href] = await approveAll(page, code);
    const body = (await (await page.request.get(href!)).body()).toString("latin1");
    expect(body.startsWith("%PDF-1.4")).toBe(true);
    expect(body).toContain("/Count 2");
    expect(body).toContain("/DCTDecode");
    expect(body.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  test("a course page lists its previous papers", async ({ page }) => {
    await apiLogin(page);
    await share(page, { code: "SCSA5101", files: pdf("course-page") });
    await approveAll(page, "SCSA5101");
    await page.goto("/courses");
    await waitForHydration(page);
    await page.getByRole("link", { name: /Computer Networks/ }).first().click();
    const section = page.locator("section[aria-labelledby='course-papers']");
    await expect(section.getByRole("heading", { name: "Previous papers" })).toBeVisible();
    await expect(section.getByRole("link", { name: /^Open SCSA5101/ }).first()).toBeVisible();
  });

  test("the review queue is only for admins", async ({ page }) => {
    await apiLogin(page);
    // The app shell streams behind a loading state, so the status is already 200; check the page.
    await page.goto("/papers/review");
    await expect(page.getByRole("heading", { name: "Review papers" })).toHaveCount(0);
    await expect(page.getByText("Page not found")).toBeVisible();
  });

  test("two PDFs at once are refused with a clear message", async ({ page }) => {
    await apiLogin(page);
    await page.goto("/papers");
    await waitForHydration(page);
    await page.getByRole("main").getByRole("button", { name: "Share a paper" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Share a question paper" });
    await dialog.getByLabel("File").setInputFiles([pdf("a"), pdf("b")]);
    await dialog.getByRole("button", { name: "Share paper" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(/Attach one PDF, or photos only/);
  });
});
