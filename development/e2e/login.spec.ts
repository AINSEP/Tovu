import { test, expect } from "@playwright/test";
import { attemptLoginAsAdmin, DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME, loginAsAdmin, logoutAsAdmin } from "./auth-fixtures.js";

/**
 * @file MANDATE 1 ("does login even work?") — answered here, against a real browser hitting a real
 * `TOVU_DB=memory` boot through `playwright.destructive.config.ts`. See `auth-fixtures.ts`'s file
 * header for the write-up of what this proves about `dev-auth.ts` not being dev-only, and this
 * config's own header for a one-time, NOT reliably reproducible React crash found and investigated
 * while answering this mandate (9/9 later attempts passed clean — recorded, not worked around).
 *
 * Every test in this file fails loudly on any uncaught page error (see `beforeEach`/`afterEach`
 * below), specifically so that if that crash recurs it shows up as a clear assertion failure naming
 * the error, instead of the `.admin-layout` wait silently timing out with no explanation.
 *
 * These are ordinary specs (not ADR-055-gated) — login is orthogonal to the destructive-path bug
 * this dispatch's second mandate reproduces.
 */

test.describe("admin login (Mandate 1)", () => {
  let pageErrors: string[];

  test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(`${err.message}\n${err.stack ?? ""}`));
  });

  test.afterEach(() => {
    expect(pageErrors, "no uncaught page error during this test").toEqual([]);
  });

  test("valid credentials reach the authenticated admin shell", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.locator(".admin-layout")).toBeVisible();
    // The session cookie itself: HttpOnly (unreadable from page JS, so this is a network-level
    // assertion, not a DOM one), Secure, and scoped to the whole origin.
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name === "tovu_session");
    expect(sessionCookie, "tovu_session cookie must be set after login").toBeTruthy();
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.secure).toBe(true);
  });

  test("wrong password shows an error and never reaches the admin shell", async ({ page }) => {
    const response = page.waitForResponse((res) => res.url().endsWith("/api/admin/v1/auth/login") && res.request().method() === "POST");
    await attemptLoginAsAdmin(page, { username: DEFAULT_ADMIN_USERNAME, password: "definitely-not-the-password" });
    expect((await response).status()).toBe(401);
    expect(await (await response).json()).toEqual({ error: "invalid username or password", code: "UNAUTHENTICATED" });
    await expect(page.locator(".login-error")).toBeVisible();
    await expect(page.locator(".login-error")).toHaveText("invalid username or password");
    await expect(page.locator(".admin-layout")).toHaveCount(0);
    // Still on the login form, not silently redirected anywhere.
    await expect(page.locator(".login-card")).toBeVisible();
  });

  test("unknown username shows an error rather than a different failure mode", async ({ page }) => {
    const response = page.waitForResponse((res) => res.url().endsWith("/api/admin/v1/auth/login") && res.request().method() === "POST");
    await attemptLoginAsAdmin(page, { username: "not-a-real-user", password: DEFAULT_ADMIN_PASSWORD });
    expect((await response).status()).toBe(401);
    expect(await (await response).json()).toEqual({ error: "invalid username or password", code: "UNAUTHENTICATED" });
    await expect(page.locator(".login-error")).toBeVisible();
    await expect(page.locator(".login-error")).toHaveText("invalid username or password");
    await expect(page.locator(".admin-layout")).toHaveCount(0);
  });

  test("session survives a full page reload", async ({ page }) => {
    await loginAsAdmin(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    // `App.tsx` re-runs `api.me()` on mount; the cookie set by login must still authenticate it.
    await expect(page.locator(".admin-layout")).toBeVisible({ timeout: 10_000 });
  });

  test("logout returns to the login screen and the session cookie stops authenticating", async ({ page }) => {
    await loginAsAdmin(page);
    const session = (await page.context().cookies()).find((cookie) => cookie.name === "tovu_session");
    expect(session).toBeTruthy();
    const headers = { Cookie: `tovu_session=${session!.value}` };
    expect((await page.request.get("/api/admin/v1/auth/me", { headers })).status()).toBe(200);
    await logoutAsAdmin(page);
    await expect(page.locator(".login-card")).toBeVisible();

    const replay = await page.request.get("/api/admin/v1/auth/me", { headers });
    expect(replay.status()).toBe(401);
    expect((await replay.json()).code).toBe("UNAUTHENTICATED");

    // Reload also checks that App.tsx's next boot check keeps the browser signed out.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".login-card")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".admin-layout")).toHaveCount(0);
  });

  test("direct API call with no session cookie is rejected (REQ-06 fail-closed)", async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/api/admin/v1/auth/me`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHENTICATED");
  });
});
