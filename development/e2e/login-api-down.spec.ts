import { test, expect } from "@playwright/test";

/**
 * @file Reproduction for "the repo owner cannot log in to the admin UI" (QA/E2E dispatch,
 * 2026-08-06). See `../playwright.login-api-down.config.ts`'s header for the full investigation
 * write-up and why this fixture shape (Vite up, API deliberately unreachable) was chosen over the
 * alternatives that were tried and ruled out live: a fresh `npm run dev` boot and a standalone
 * `tsx watch src/index.ts` boot (serving the possibly-stale `apps/admin/dist` build) both logged in
 * successfully via curl and a real headless Chromium session — login itself has no bug. The only
 * reproducible failure is the API being unreachable, which is what this file asserts against.
 */

test.describe("admin login when the API is unreachable (symptom reproduction)", () => {
  test("login attempt fails with a status-only message that does not name the real cause", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/admin/", { waitUntil: "domcontentloaded" });
    await page.locator(".login-card").waitFor({ state: "visible", timeout: 10_000 });

    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("tovu-dev");
    await page.getByRole("button", { name: /sign in/i }).click();

    // The failure IS visible — this is not a silent hang. But the on-screen text is the generic
    // `request failed (${status})` fallback (apps/admin/src/lib/api.ts:819), because Vite's dev
    // proxy answers an unreachable upstream with a bare 500 and no JSON body for `request()` to
    // read a real message from. Asserting the exact string live-documents why "start the server"
    // alone doesn't obviously fix this for a human reading it: "500" reads as a server-side crash,
    // not as "no server is listening at all."
    const errorEl = page.locator(".login-error");
    await expect(errorEl).toBeVisible({ timeout: 10_000 });
    await expect(errorEl).toHaveText("request failed (500)");

    // Never reaches the authenticated shell, and stays on the login screen rather than redirecting
    // anywhere or leaving a blank page.
    await expect(page.locator(".admin-layout")).toHaveCount(0);
    await expect(page.locator(".login-card")).toBeVisible();

    // The 500 is real and observable in devtools — an operator who opens the console (rather than
    // just reading the on-page text) does get a signal, just not one that says "process not
    // running."
    expect(consoleErrors.some((line) => line.includes("500"))).toBe(true);
  });
});
