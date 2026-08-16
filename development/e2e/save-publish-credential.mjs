/**
 * @file Saves a publish credential through the REAL admin form (Deployment → Static Site →
 * Connect <provider>), so the token is sealed server-side by the same path a human uses.
 *
 * The token is read from the `GH_PUBLISH_TOKEN` environment variable and typed straight into the
 * form's `type="password"` input. It is never echoed, logged, or passed on a command line — only
 * its length is reported, as a "did the fill land" signal.
 *
 * Usage:
 *   GH_PUBLISH_TOKEN=... node development/e2e/save-publish-credential.mjs
 *   PROVIDER=github-pages GH_PUBLISH_TOKEN=... node development/e2e/save-publish-credential.mjs
 */
import { chromium } from "@playwright/test";

const BASE = process.env.TOVU_ADMIN_URL ?? "http://localhost:5173";
const PROVIDER = process.env.PROVIDER ?? "github-pages";
const TOKEN = process.env.GH_PUBLISH_TOKEN ?? "";

if (!TOKEN) {
  console.error("GH_PUBLISH_TOKEN is empty — refusing to save a blank credential.");
  process.exit(1);
}

const stamp = () => new Date().toISOString().slice(11, 19);
const log = (m) => console.log(`[${stamp()}] ${m}`);
log(`token received via env: ${TOKEN.length} chars, prefix ${TOKEN.slice(0, 4)}`);

const browser = await chromium.launch({
  headless: false,
  slowMo: 150,
  args: ["--window-size=1680,1050", "--window-position=40,40"],
});
const page = await (await browser.newContext({ viewport: { width: 1600, height: 950 } })).newPage();

await page.goto(`${BASE}/admin/`, { waitUntil: "domcontentloaded" });
await page.locator(".login-card").waitFor({ state: "visible", timeout: 20_000 });
await page.getByLabel("Username").fill(process.env.TOVU_ADMIN_USER ?? "admin");
await page.getByLabel("Password").fill(process.env.TOVU_ADMIN_PASSWORD ?? "tovu-dev");
await page.getByRole("button", { name: /sign in/i }).click();
await page.locator(".admin-layout").waitFor({ state: "visible", timeout: 20_000 });
log("logged in");

// Real paths, base `/admin/` (lib/router.ts) — no hash routing.
await page.goto(`${BASE}/admin/deployment`, { waitUntil: "domcontentloaded" });
await page.locator(".admin-layout").waitFor({ state: "visible", timeout: 20_000 });
log("on the Deployment panel");

await page.getByRole("tab", { name: /static site/i }).click().catch(async () => {
  await page.getByText(/^Static Site$/i).first().click();
});
await page.waitForTimeout(1500);
log("Static Site tab open");

const tokenInput = page.locator(`#deployment-static-site-credentials-token-${PROVIDER}`);
const saveBtn = page.locator(`[data-agent-element="deployment-static-site-credentials-save-${PROVIDER}"]`);

// A CONNECTED provider collapses its step into a closed <details> (StaticSiteTab.tsx's
// "step is done, so it gets out of the way"), so the input does not exist until it is expanded.
if ((await tokenInput.count()) === 0 || !(await tokenInput.isVisible().catch(() => false))) {
  log("credential row is collapsed — expanding its <details>");
  const row = page.locator(`[data-agent-element="deployment-static-site-credentials-row-${PROVIDER}"]`);
  const summary = row.locator("summary").first();
  if ((await summary.count()) > 0) await summary.click();
  else await row.click();
  await page.waitForTimeout(1200);
}

await tokenInput.waitFor({ state: "visible", timeout: 15_000 });
log("token field visible; filling");
await tokenInput.fill(TOKEN);

const filled = await tokenInput.inputValue();
log(`field now holds ${filled.length} chars (expected ${TOKEN.length})`);

await saveBtn.waitFor({ state: "visible", timeout: 10_000 });
log("clicking Save");
await saveBtn.click();
await page.waitForTimeout(4000);

const err = await page.locator(".save-error").first().textContent().catch(() => null);
log(err ? `SAVE ERROR: ${err}` : "no save error shown");

await page.screenshot({ path: "development/e2e/.artifacts/credential-saved.png" });
log("screenshot: development/e2e/.artifacts/credential-saved.png");
await browser.close();
