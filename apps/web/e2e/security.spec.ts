import { test, expect, apiLogin } from "./helpers";

test.describe("security headers", () => {
  test("/login sends CSP, frame protection and hides X-Powered-By", async ({ request }) => {
    const res = await request.get("/login");
    expect(res.status()).toBe(200);
    const headers = res.headers();

    const csp = headers["content-security-policy"];
    expect(csp, "Content-Security-Policy header").toBeTruthy();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    // Production builds must not allow eval.
    expect(csp).not.toContain("'unsafe-eval'");

    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("the session cookie is HttpOnly and SameSite=Lax", async ({ page }) => {
    await apiLogin(page);
    const cookie = (await page.context().cookies()).find((c) => c.name === "usp_session");
    expect(cookie, "usp_session cookie").toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("Lax");
  });
});
