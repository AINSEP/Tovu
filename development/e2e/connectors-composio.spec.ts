import { test, expect, type Page } from "@playwright/test";

import { loginAsAdmin } from "./auth-fixtures.js";
import { REJECTED_KEY_MARKER } from "./fake-composio-server.js";

/**
 * @file Settings → Connectors, driven through the REAL admin SPA against the REAL Tovu API
 * (`../playwright.connectors.config.ts`'s hermetic two-server harness). No route stubbing anywhere
 * in this file.
 *
 * This tab used to render `@jini-ai/ui`'s `ConnectorsBrowser` against an empty in-memory fake,
 * wrapped in `inert` under a "not wired up in Tovu yet" note — a permanently blank, unusable
 * rectangle. These tests exist to keep that from silently coming back.
 *
 * What each test pins:
 * - The grid renders the real Composio catalog from `@jini-ai/integrations/composio`, not the
 *   empty fake, and does so with NO API key configured (the static catalog needs none).
 * - The gate is shown and cards are genuinely non-interactive while unconfigured.
 * - A saved API key survives a full page reload as a masked marker, and never comes back in
 *   plaintext; clearing really deletes server-side, not just locally.
 * - A key Composio REFUSES is reported inline, is never persisted, and never unlocks the grid —
 *   so `configured` means "Composio accepts this", not "something was typed".
 * - The whole OAuth authorization runs in a real browser: two clicks, a real popup, a real
 *   cross-origin redirect into Tovu's public callback, and a real `postMessage` back — after which
 *   the card reports connected without a reload, and stays connected across one.
 *
 * WHERE THE VERIFICATION BOUNDARY IS: the Composio end is
 * `../e2e/fake-composio-server.ts`, because no Composio project key exists in this environment.
 * Everything on TOVU's side is real — routes, session auth, the public callback, AES-GCM sealing,
 * the database, the popup handshake, and this UI. Composio's own consent screen, redirect behavior,
 * and wire responses are NOT proven by anything here.
 *
 * No real Composio keys anywhere in this file — every value is an obvious dummy.
 */

const CONNECTORS_PATH = "/admin/settings?tab=connectors";
const DUMMY_KEY = "comp_E2E_DUMMY_NOT_A_REAL_KEY_4242";
const API_BASE = "/api/admin/v1/workspaces/workspace-local/connectors";

/**
 * Logs in and returns the server to a known state before every test.
 *
 * Necessary because the harness runs ONE API process for the whole file with an in-memory database,
 * so a connector authorized by one test is still authorized in the next. Without this the
 * "renders with no API key configured" test would pass or fail depending purely on which tests ran
 * before it — and, worse, the authorization tests could pass vacuously against a connector that was
 * already connected.
 *
 * Driven through the API rather than the UI because it must be unconditional and order-independent:
 * clicking "Disconnect" only works when a Disconnect button happens to be on screen.
 */
test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
  // Disconnect first: clearing the key also drops connector credentials, and doing it in this
  // order proves neither path depends on the other having run.
  await page.request.post(`${API_BASE}/github/disconnect`).catch(() => undefined);
  await page.request.put(`${API_BASE}/config`, { data: { apiKey: null } }).catch(() => undefined);
});

/**
 * Waits on the CARD GRID, not just the key field.
 *
 * `SettingsUi` replaces its entire subtree with a "Loading settings…" placeholder while any of its
 * six settings slices is unsettled, so a field that has appeared can still be unmounted moments
 * later if a slice settles late — which on a cold boot silently discards anything typed into it.
 * The rendered grid is the last thing to arrive, so it is the only signal that the tab is really
 * interactive.
 */
async function gotoConnectors(page: Page): Promise<void> {
  await page.goto(CONNECTORS_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".composio-key-field", { timeout: 20_000 });
  await page.locator(".connector-card").first().waitFor({ state: "attached", timeout: 20_000 });
}

/** The saved-key marker line, which only renders once the server reports `configured: true`. */
function savedKeyHelp(page: Page) {
  return page.locator(".composio-key-help").filter({ hasText: "is saved" });
}

test("the grid renders the real Composio catalog with no API key configured", async ({ page }) => {
  await gotoConnectors(page);

  const cards = page.locator("[data-testid='connector-grid-wrap'] .connector-card");
  await expect(cards.first()).toBeVisible({ timeout: 20_000 });

  const count = await cards.count();
  // The empty fake this tab used to use rendered ZERO. The static catalog is 3 featured connectors
  // plus 183 documented toolkits, so anything in the low hundreds proves the real one is wired.
  expect(count).toBeGreaterThan(100);

  const names = await page.locator(".connector-card").allInnerTexts();
  const joined = names.join(" ");
  for (const expected of ["GitHub", "Notion", "Linear", "Slack"]) {
    expect(joined, `expected the catalog to contain ${expected}`).toContain(expected);
  }
});

test("while unconfigured the gate shows and every card is genuinely non-interactive", async ({
  page,
}) => {
  await gotoConnectors(page);

  await expect(page.getByTestId("connector-gate")).toBeVisible({ timeout: 20_000 });

  // `is-masked` + `aria-hidden` + `disabled` cards together are what make an unwired connect flow
  // honest: the buttons are not merely unimplemented, they cannot be reached.
  await expect(page.getByTestId("connector-grid-wrap")).toHaveClass(/is-masked/);
  await expect(page.locator(".connector-grid")).toHaveAttribute("aria-hidden", "true");

  // `ConnectorCard` is a div, not a button, so "disabled" is expressed as `is-locked` +
  // `aria-disabled` + `tabIndex=-1` + an early return in its own click handler — asserting the HTML
  // `disabled` attribute here would silently match nothing and pass for the wrong reason.
  const totalCount = await page.locator(".connector-card").count();
  expect(await page.locator(".connector-card.is-locked").count()).toBe(totalCount);
  expect(await page.locator('.connector-card[aria-disabled="true"]').count()).toBe(totalCount);
});

test("a saved key survives a full page reload as a masked marker, and never comes back in plaintext", async ({
  page,
}) => {
  await gotoConnectors(page);

  await page.locator("#composio-api-key").fill(DUMMY_KEY);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(savedKeyHelp(page)).toBeVisible({ timeout: 15_000 });
  await expect(savedKeyHelp(page)).toContainText("4242");

  // The whole point: a full reload, not a re-render.
  await page.reload({ waitUntil: "domcontentloaded" });
  await gotoConnectors(page);

  await expect(savedKeyHelp(page)).toContainText("4242", { timeout: 20_000 });

  // The key itself must never come back, in the DOM or in the input.
  expect(await page.content()).not.toContain(DUMMY_KEY);
  await expect(page.locator("#composio-api-key")).toHaveValue("");

  // Saving a key unlocks the grid: the gate goes away and cards stop being disabled.
  await expect(page.getByTestId("connector-gate")).toHaveCount(0);
  await expect(page.getByTestId("connector-grid-wrap")).not.toHaveClass(/is-masked/);
});

/** The GitHub card, matched on its exact title so sibling toolkits ("GitHub Bot") can't be picked. */
function githubCard(page: Page) {
  return page
    .locator(".connector-card")
    .filter({ has: page.locator(".connector-card-title-name", { hasText: /^GitHub$/ }) })
    .first();
}

/** Saves a key so the grid unlocks and the cards become interactive. */
async function unlock(page: Page): Promise<void> {
  await page.locator("#composio-api-key").fill(DUMMY_KEY);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(savedKeyHelp(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("connector-gate")).toHaveCount(0);
}

/**
 * Runs the full authorization, which is deliberately TWO clicks.
 *
 * "Connect" only starts the handshake — it POSTs, stores the returned redirect URL as pending
 * state, and renders a "Continue in browser" button. That second button is what opens the popup,
 * and the split is not incidental: `window.open` called after the connect request had already been
 * awaited would no longer be inside a user gesture, and every browser's popup blocker would eat it.
 * A test that clicked only "Connect" and waited for a popup would hang forever — which is exactly
 * what happened the first time this suite was written.
 */
async function authorizeGithub(page: Page): Promise<void> {
  const card = githubCard(page);
  await expect(card).toBeVisible();
  await card.locator(".connector-action.is-connect").click();

  // The popup is Composio's consent page (the fake stands in), which 302s to Tovu's own public
  // callback; that page posts back to this window and closes itself.
  const continueButton = card.locator(".connector-authorization-link");
  await expect(continueButton).toBeVisible({ timeout: 20_000 });

  const popupPromise = page.waitForEvent("popup");
  await continueButton.click();
  const popup = await popupPromise;
  await popup.waitForEvent("close", { timeout: 20_000 }).catch(() => {
    /* the callback closes itself; a race with the close event is not a failure */
  });
}

test("authorizing a connector runs the real OAuth popup handshake and reports connected", async ({
  page,
}) => {
  await gotoConnectors(page);
  await unlock(page);
  await authorizeGithub(page);

  // The card flips to connected off the postMessage the callback page sent — no manual reload.
  await expect(githubCard(page)).toHaveClass(/status-connected/, { timeout: 20_000 });
});

test("an authorized connector is still connected after a full reload", async ({ page }) => {
  await gotoConnectors(page);
  await unlock(page);
  await authorizeGithub(page);
  await expect(githubCard(page)).toHaveClass(/status-connected/, { timeout: 20_000 });

  await page.reload({ waitUntil: "domcontentloaded" });
  await gotoConnectors(page);

  // Proves the sealed credential row was really written and rehydrated, not just held in memory.
  await expect(githubCard(page)).toHaveClass(/status-connected/, { timeout: 20_000 });
});

test("disconnecting returns the card to available and survives a reload", async ({ page }) => {
  await gotoConnectors(page);
  await unlock(page);
  await authorizeGithub(page);
  await expect(githubCard(page)).toHaveClass(/status-connected/, { timeout: 20_000 });

  await githubCard(page).locator(".connector-action.is-disconnect").click();
  await expect(githubCard(page)).toHaveClass(/status-available/, { timeout: 20_000 });

  await page.reload({ waitUntil: "domcontentloaded" });
  await gotoConnectors(page);
  await expect(githubCard(page)).toHaveClass(/status-available/, { timeout: 20_000 });
});

test("a key Composio refuses is reported inline and never unlocks the grid", async ({ page }) => {
  await gotoConnectors(page);

  // The fake refuses any key carrying `REJECTED_KEY_MARKER`, so this drives the real UI path: type
  // a bad key, hit Save, and the route's verification refuses it before anything is persisted.
  await page.locator("#composio-api-key").fill(`comp_${REJECTED_KEY_MARKER}_9999`);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.locator(".composio-key-field [role='alert']")).toContainText(/rejected that API key/i, {
    timeout: 15_000,
  });

  // Still locked, still unconfigured — and still so after a reload, proving nothing was written.
  await expect(page.getByTestId("connector-gate")).toBeVisible();
  await expect(savedKeyHelp(page)).toHaveCount(0);

  await page.reload({ waitUntil: "domcontentloaded" });
  await gotoConnectors(page);
  await expect(page.getByTestId("connector-gate")).toBeVisible({ timeout: 20_000 });
  await expect(savedKeyHelp(page)).toHaveCount(0);
});

test("clearing the key deletes it server-side, not just locally", async ({ page }) => {
  await gotoConnectors(page);

  await page.locator("#composio-api-key").fill(DUMMY_KEY);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(savedKeyHelp(page)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Clear" }).click();
  await expect(savedKeyHelp(page)).toHaveCount(0, { timeout: 15_000 });

  await page.reload({ waitUntil: "domcontentloaded" });
  await gotoConnectors(page);

  // Still gone after a reload — proves the delete reached the server, not just component state.
  await expect(savedKeyHelp(page)).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId("connector-gate")).toBeVisible();
});
