/**
 * @file Reopens the admin, navigates to `/admin/source-control`, and screenshots the page as it
 * currently renders. Adapted from `inspect-assistant-pane.mjs`'s login+navigate pattern (same
 * `.login-card`/`.admin-layout` sequence, admin/tovu-dev credentials).
 *
 * Written for the Source Control UI restructure (2026-08-16): the owner asked to SEE the page,
 * before and after, rather than take a description on faith. Pass a suffix (`before`/`after`) to
 * name the screenshot; defaults to `current`.
 *
 * Usage: node development/e2e/inspect-source-control.mjs [before|after|<any-suffix>]
 */
import { chromium } from "@playwright/test";

const BASE = process.env.TOVU_ADMIN_URL ?? "http://localhost:5173";
const suffix = process.argv[2] ?? "current";

const browser = await chromium.launch({
  headless: false,
  slowMo: 80,
  args: ["--window-size=1680,1050", "--window-position=40,40"],
});
const page = await (await browser.newContext({ viewport: { width: 1600, height: 950 } })).newPage();

await page.goto(`${BASE}/admin/`, { waitUntil: "domcontentloaded" });
await page.locator(".login-card").waitFor({ state: "visible", timeout: 20_000 });
await page.getByLabel("Username").fill(process.env.TOVU_ADMIN_USER ?? "admin");
await page.getByLabel("Password").fill(process.env.TOVU_ADMIN_PASSWORD ?? "tovu-dev");
await page.getByRole("button", { name: /sign in/i }).click();
await page.locator(".admin-layout").waitFor({ state: "visible", timeout: 20_000 });

await page.goto(`${BASE}/admin/source-control`, { waitUntil: "domcontentloaded" });
await page.locator(".page, .source-control-page").first().waitFor({ state: "visible", timeout: 15_000 });
await page.waitForTimeout(800);

const outPath = `development/e2e/.artifacts/source-control-${suffix}.png`;
await page.screenshot({ path: outPath, fullPage: true });
console.log(`screenshot: ${outPath}`);

await browser.close();
