/**
 * @file Decides one question with evidence: can an EXTERNAL driver (Playwright) operate an MCP-UI
 * confirmation surface, given the surface is a `srcdoc` iframe sandboxed to `allow-scripts` with
 * no `allow-same-origin` (Jini `MCP_UI_VIEW_SANDBOX`)?
 *
 * Why it matters: that sandbox denies the PARENT document any access to the frame's DOM, so the
 * in-page scanner behind `page.find_elements` cannot see the buttons no matter how they are tagged.
 * Playwright drives via CDP, below the origin boundary, so it should be unaffected. "Should be" is
 * not evidence — this file produces the evidence.
 *
 * SAFETY: this probe clicks **Cancel**, never Publish. It raises a real confirmation dialog for a
 * real publish tool and then declines it, so it can be run freely without touching the public
 * internet. Asserting the cancel is observed end-to-end (the parked tool call returns
 * `cancelled: true`) is the actual proof — a click that lands but resolves nothing would be a
 * false positive.
 *
 * Usage: node development/e2e/surface-automation-probe.mjs
 */
import { chromium } from "@playwright/test";

const BASE = process.env.TOVU_ADMIN_URL ?? "http://localhost:5173";
const stamp = () => new Date().toISOString().slice(11, 19);
const log = (m) => console.log(`[${stamp()}] ${m}`);

const browser = await chromium.launch({
  headless: false,
  slowMo: 120,
  args: ["--window-size=1680,1050", "--window-position=40,40"],
});
const page = await (await browser.newContext({ viewport: { width: 1600, height: 950 } })).newPage();

await page.goto(`${BASE}/admin/`, { waitUntil: "domcontentloaded" });
await page.locator(".login-card").waitFor({ state: "visible", timeout: 20_000 });
await page.getByLabel("Username").fill(process.env.TOVU_ADMIN_USER ?? "admin");
await page.getByLabel("Password").fill(process.env.TOVU_ADMIN_PASSWORD ?? "tovu-dev");
await page.getByRole("button", { name: /sign in/i }).click();
await page.locator(".admin-layout").waitFor({ state: "visible", timeout: 20_000 });
await page.locator(".chat-fab").click();
await page.locator("textarea.jini-composer-input").waitFor({ state: "visible", timeout: 15_000 });
log("logged in, chat open");

await page
  .locator("textarea.jini-composer-input")
  .fill(
    "Publish the site to GitHub Pages, owner leonaburime-ucla, repo tovu-demo, project name " +
      "\"automation probe\". Go straight to the publish tool."
  );
await page.locator("button.jini-composer-send").click();
log("request sent; waiting for the confirmation surface");

const frame = page.frameLocator(".admin-chat-dock iframe");
const cancelBtn = frame.locator('[data-mcpui-action="cancel"]');

// ── PROOF STEP 1: can Playwright even SEE inside the sandboxed frame? ────────────────────────
await cancelBtn.waitFor({ state: "visible", timeout: 180_000 });
const confirmLabel = await frame.locator('[data-mcpui-action="confirm"]').textContent();
const cancelLabel = await cancelBtn.textContent();
log(`READABLE across the sandbox boundary — confirm="${confirmLabel?.trim()}" cancel="${cancelLabel?.trim()}"`);

// ── PROOF STEP 2: can it CLICK, and does the click actually resolve the parked call? ─────────
log("clicking Cancel (never Publish)");
await cancelBtn.click();

const transcript = async () =>
  page.evaluate(() => {
    const pane = document.querySelector(".jini-chat-pane") ?? document.querySelector(".admin-chat-dock");
    if (!pane) return "";
    const clone = pane.cloneNode(true);
    for (const el of clone.querySelectorAll("style, script")) el.remove();
    return (clone.textContent || "").trim();
  });

let resolved = false;
for (let i = 0; i < 30 && !resolved; i += 1) {
  await page.waitForTimeout(3000);
  const text = await transcript();
  if (/cancelled|canceled|"cancelled":\s*true|did not publish|nothing was published/i.test(text)) {
    resolved = true;
    log("CONFIRMED — the cancel reached the parked tool call and it returned a cancellation");
  }
}
if (!resolved) log("INCONCLUSIVE — click landed but no cancellation observed in the transcript");

await page.screenshot({ path: "development/e2e/.artifacts/surface-automation-probe.png" });
log(`RESULT: sandbox-readable=YES clickable=YES resolved=${resolved ? "YES" : "NO"}`);
await browser.close();
