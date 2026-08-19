import { test, expect, type Page } from "@playwright/test";

import { loginAsAdmin } from "./auth-fixtures.js";

/**
 * @file Visual capture of the Connectors tab's three real states, run against the same harness as
 * `connectors-composio.spec.ts`. Assertion-light on purpose — the behavioral guarantees live in
 * that file; this exists so a human can see what shipped without booting the stack by hand.
 *
 * Screenshots land in `development/e2e/__screenshots__/`.
 */

const OUT = "development/e2e/__screenshots__";
const DUMMY_KEY = "comp_E2E_DUMMY_NOT_A_REAL_KEY_4242";
const API_BASE = "/api/admin/v1/workspaces/workspace-local/connectors";

async function gotoConnectors(page: Page): Promise<void> {
  await page.goto("/admin/settings?tab=connectors", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".composio-key-field", { timeout: 20_000 });
  await page.locator(".connector-card").first().waitFor({ state: "attached", timeout: 20_000 });
}

function githubCard(page: Page) {
  return page
    .locator(".connector-card")
    .filter({ has: page.locator(".connector-card-title-name", { hasText: /^GitHub$/ }) })
    .first();
}

test("capture the locked, unlocked, and connected states", async ({ page }) => {
  await loginAsAdmin(page);
  await page.request.post(`${API_BASE}/github/disconnect`).catch(() => undefined);
  await page.request.put(`${API_BASE}/config`, { data: { apiKey: null } }).catch(() => undefined);

  await gotoConnectors(page);
  await page.screenshot({ path: `${OUT}/connectors-01-locked.png` });

  await page.locator("#composio-api-key").fill(DUMMY_KEY);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("connector-gate")).toHaveCount(0, { timeout: 15_000 });
  await page.screenshot({ path: `${OUT}/connectors-02-unlocked.png` });

  const card = githubCard(page);
  await card.locator(".connector-action.is-connect").click();
  const continueButton = card.locator(".connector-authorization-link");
  await expect(continueButton).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${OUT}/connectors-03-authorization-pending.png` });

  const popupPromise = page.waitForEvent("popup");
  await continueButton.click();
  const popup = await popupPromise;
  await popup.waitForEvent("close", { timeout: 20_000 }).catch(() => undefined);

  await expect(card).toHaveClass(/status-connected/, { timeout: 20_000 });
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/connectors-04-connected.png` });

  // Leave the harness clean for whatever runs next in the same process.
  await page.request.post(`${API_BASE}/github/disconnect`).catch(() => undefined);
  await page.request.put(`${API_BASE}/config`, { data: { apiKey: null } }).catch(() => undefined);
});
