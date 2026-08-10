import { test, expect, type Page } from "@playwright/test";

/**
 * @file Media → "Media providers" credential persistence, driven through the REAL admin SPA against
 * the REAL Tovu API (`../playwright.media-providers.config.ts`'s hermetic two-server harness). No
 * route stubbing anywhere in this file — every assertion below is the actual browser talking to the
 * actual server and the actual sealed credential store.
 *
 * This tab used to render `@jini-ai/ui`'s component against an in-memory fake, so nothing typed
 * survived a reload. These tests exist to keep that from silently coming back.
 *
 * What each test pins:
 * - The catalogue is the ENGINE's roster, not `@jini-ai/ui`'s curated sample — checked by the
 *   presence of vendors only the engine catalogue has, since a regression here would otherwise
 *   surface much later as credentials stored under ids the dispatch engine cannot resolve.
 * - A typed key survives a full page reload, coming back as a masked marker.
 * - The key itself never comes back to the browser, in any form.
 * - Clear really deletes server-side, not just locally.
 *
 * No real provider keys anywhere in this file — every value is an obvious dummy.
 */

const ADMIN_PATH = "/admin/";
const DUMMY_KEY = "sk-E2E-DUMMY-NOT-A-REAL-KEY-4242";

async function login(page: Page): Promise<void> {
  await page.goto(ADMIN_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".login-card", { timeout: 20_000 });
  await page.fill('.login-card label:has-text("Username") input', "admin");
  await page.fill('.login-card label:has-text("Password") input', "tovu-dev");
  await page.click('.login-card button:has-text("Sign in")');
  await page.waitForSelector(".login-card", { state: "detached", timeout: 20_000 });
}

async function gotoMediaProviders(page: Page): Promise<void> {
  await page.goto(`${ADMIN_PATH}media`, { waitUntil: "domcontentloaded" });
  await page.click('.media-tab:has-text("Media providers")');
  await page.waitForSelector(".jini-media-provider-card", { timeout: 20_000 });
}

/** The OpenAI card — first in the catalogue, and the one every test here edits. */
function openaiCard(page: Page) {
  return page.locator(".jini-media-provider-card").filter({ hasText: "OpenAI" }).first();
}

test("the tab renders the engine's vendor roster, not @jini-ai/ui's curated sample", async ({ page }) => {
  await login(page);
  await gotoMediaProviders(page);

  const labels = await page.locator(".jini-media-provider-card-head strong").allInnerTexts();

  // Present only in `@jini-ai/integrations/media-providers`' `MEDIA_PROVIDERS`.
  expect(labels).toContain("Black Forest Labs");
  expect(labels).toContain("Replicate");
  expect(labels).toContain("ComfyUI");
  // Excluded on purpose: no credential surface / test-only placeholder.
  expect(labels).not.toContain("HyperFrames");
  expect(labels).not.toContain("Stub (placeholder)");
  // Materially larger than the 15-entry curated sample.
  expect(labels.length).toBeGreaterThan(15);
});

test("a typed key survives a full page reload as a masked marker, and never comes back in plaintext", async ({
  page,
}) => {
  await login(page);
  await gotoMediaProviders(page);

  const card = openaiCard(page);
  await card.locator('input[type="password"], input[type="text"]').first().fill(DUMMY_KEY);
  await page.getByRole("button", { name: /^Save/ }).first().click();
  await expect(card.locator(".jini-field-status-badge-success")).toHaveText(/Saved \(••••4242\)/, {
    timeout: 15_000,
  });

  // The whole point: a full reload, not a re-render.
  await page.reload({ waitUntil: "domcontentloaded" });
  await gotoMediaProviders(page);

  await expect(openaiCard(page).locator(".jini-field-status-badge-success")).toHaveText(/Saved \(••••4242\)/, {
    timeout: 15_000,
  });
  expect(await page.content()).not.toContain(DUMMY_KEY);
});

test("the stored key is never delivered to the browser — the field stays empty", async ({ page }) => {
  await login(page);
  await gotoMediaProviders(page);

  const card = openaiCard(page);
  await card.locator('input[type="password"], input[type="text"]').first().fill(DUMMY_KEY);
  await page.getByRole("button", { name: /^Save/ }).first().click();
  await expect(card.locator(".jini-field-status-badge-success")).toBeVisible({ timeout: 15_000 });

  await page.reload({ waitUntil: "domcontentloaded" });
  await gotoMediaProviders(page);

  // A stored key comes back as a marker only; the input itself holds nothing re-sendable.
  const value = await openaiCard(page).locator('input[type="password"], input[type="text"]').first().inputValue();
  expect(value).toBe("");
});

test("Clear removes the credential server-side, so a reload does not bring it back", async ({ page }) => {
  await login(page);
  await gotoMediaProviders(page);

  const card = openaiCard(page);
  await card.locator('input[type="password"], input[type="text"]').first().fill(DUMMY_KEY);
  await page.getByRole("button", { name: /^Save/ }).first().click();
  await expect(card.locator(".jini-field-status-badge-success")).toBeVisible({ timeout: 15_000 });

  await openaiCard(page).getByRole("button", { name: "Clear" }).click();
  await expect(openaiCard(page).locator(".jini-field-status-badge-success")).toHaveCount(0, { timeout: 15_000 });

  // A local-only clear would reappear here; a server-side delete does not.
  await page.reload({ waitUntil: "domcontentloaded" });
  await gotoMediaProviders(page);
  await expect(openaiCard(page).locator(".jini-field-status-badge-success")).toHaveCount(0, { timeout: 15_000 });
});
