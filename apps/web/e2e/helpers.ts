import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { PREFS_VERSION } from "@/lib/prefs";

export { expect };

/** Pages reachable from the sidebar / mobile drawer, with their `<h1>`. */
export const NAV_PAGES = [
  { label: "Attendance", path: "/attendance" },
  { label: "Marks", path: "/marks" },
  { label: "Results", path: "/results" },
  { label: "CGPA planner", path: "/calculator" },
  { label: "Timetable", path: "/timetable" },
  { label: "Fees", path: "/fees" },
  { label: "Notifications", path: "/notifications" },
  { label: "Courses", path: "/courses" },
] as const;

const rand = (max: number) => Math.floor(Math.random() * max);

/**
 * A register number that is unique per test. The login route throttles to
 * 5 attempts per (client IP, username) per 10 minutes, so sharing one would
 * make parallel runs and retries flaky.
 */
export function uniqueRegisterNumber(): string {
  return `4211${String(rand(1e8)).padStart(8, "0")}`;
}

export const test = base.extend<{ loggedInPage: Page }>({
  /*
   * Give every test its own client "IP" (the server reads X-Forwarded-For) so
   * the per-IP login throttle never leaks state between tests or reruns
   * against a reused server.
   */
  extraHTTPHeaders: async ({}, provide) => {
    await provide({ "X-Forwarded-For": `10.${rand(256)}.${rand(256)}.${1 + rand(254)}` });
  },

  /**
   * A page in a fresh context that is already signed in (via the API). The first-time
   * walkthrough is marked as done, so it never covers the page; e2e/onboarding.spec.ts
   * clears that to test the tour itself.
   */
  loggedInPage: async ({ page }, provide) => {
    await apiLogin(page);
    await provide(page);
  },
});

/** The walkthrough's saved state (lib/prefs.ts `onboarding.tour`): done, so it never starts by itself. */
export const TOUR_DONE = { onboarding: { tour: "done" } } as const;

/**
 * Writes the `usp-prefs` cookie (JSON, URI-encoded) the same way lib/prefs.ts reads it.
 * It replaces the whole cookie, so the walkthrough stays marked as done unless `prefs`
 * says otherwise.
 */
export async function setPrefs(
  context: BrowserContext,
  baseURL: string | undefined,
  prefs: Record<string, unknown>,
): Promise<void> {
  await context.addCookies([
    {
      name: "usp-prefs",
      value: encodeURIComponent(JSON.stringify({ v: PREFS_VERSION, ...TOUR_DONE, ...prefs })),
      url: baseURL ?? "http://localhost:3210",
    },
  ]);
}

/**
 * Sign in through the API; the session cookie lands in the page's context. The walkthrough
 * is marked as done too (any preferences already set are kept).
 */
export async function apiLogin(page: Page, username = uniqueRegisterNumber()): Promise<string> {
  const res = await page.request.post("/api/auth/login", {
    data: { username, password: "e2e-password" },
  });
  expect(res.ok(), `API login failed: ${res.status()} ${await res.text()}`).toBe(true);
  await markTourDone(page.context(), new URL(res.url()).origin);
  return username;
}

/** Adds `onboarding.tour: "done"` to the preferences cookie, keeping whatever else it holds. */
async function markTourDone(context: BrowserContext, origin: string): Promise<void> {
  // The Sathyabama Black pop-up and strip are marked as seen once per context, so they never cover a page
  // under test; e2e/black.spec.ts clears these flags to test them.
  await context.addInitScript(() => {
    try {
      if (window.sessionStorage.getItem("usp-e2e-black")) return;
      window.sessionStorage.setItem("usp-e2e-black", "1");
      window.sessionStorage.setItem("usp-black-popup", "1");
      window.localStorage.setItem("usp-black-strip", "before");
    } catch {
      /* storage blocked: nothing to suppress */
    }
  });
  const existing = (await context.cookies(origin)).find((c) => c.name === "usp-prefs");
  let prefs: Record<string, unknown> = {};
  try {
    if (existing) prefs = JSON.parse(decodeURIComponent(existing.value)) as Record<string, unknown>;
  } catch {
    /* unreadable: start from the defaults */
  }
  await setPrefs(context, origin, { ...prefs, ...TOUR_DONE });
}

/** Sign in through the real login form. The walkthrough is marked as done, as for `apiLogin`. */
export async function uiLogin(page: Page, username = uniqueRegisterNumber()): Promise<string> {
  await page.goto("/login");
  await markTourDone(page.context(), new URL(page.url()).origin);
  await waitForHydration(page);
  await page.getByLabel("Register number").fill(username);
  await page.getByLabel("Password", { exact: true }).fill("e2e-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  return username;
}

/**
 * Client components ignore input until React hydrates. There is no explicit
 * hydration marker, so wait until the JS chunks have loaded and settled.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
}

/**
 * Open a page from the app navigation: the sidebar on desktop, the drawer
 * (opened from the top bar menu button) on mobile.
 */
export async function navigateTo(page: Page, label: string, isMobile: boolean): Promise<void> {
  if (isMobile) {
    const drawer = page.getByRole("dialog", { name: "Navigation" });
    await expect(async () => {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(drawer).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await drawer.getByRole("link", { name: label, exact: true }).click();
    await expect(drawer).toBeHidden();
  } else if (label === "Notifications") {
    // The desktop rail leaves it out; the top bar's bell is the way in.
    await page.getByRole("banner").getByRole("link", { name: /notifications/i }).click();
  } else {
    await page
      .getByRole("navigation")
      .getByRole("link", { name: label, exact: true })
      .click();
  }
}

/** The page's main `<h1>`. */
export function pageHeading(page: Page, name: string | RegExp) {
  return page.getByRole("main").getByRole("heading", { level: 1, name });
}

/**
 * Expand one of the settings page's collapsed `Disclosure` blocks (Grade
 * scheme, Appearance, Home screen) and wait for its contents. Already-open
 * blocks are left alone, so calling it twice is safe.
 */
export async function openDisclosure(page: Page, title: string): Promise<void> {
  const heading = page.getByRole("heading", { level: 2, name: title, exact: true });
  await expect(heading).toBeVisible();
  const details = page.locator("details").filter({ has: heading }).first();
  if (!(await details.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await heading.click();
  }
  await expect(details).toHaveAttribute("open", "");
}
