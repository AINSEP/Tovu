import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures";

/**
 * @file Deployment panel → Static Site tab → credential-management section, driven through the REAL
 * admin SPA against the REAL Tovu API (`../playwright.static-site-tab-credentials.config.ts`'s
 * hermetic two-server harness, `TOVU_DB=memory`, `TOVU_EXECUTION_MODE=hosted-api-only`). No route
 * stubbing.
 *
 * Before this pass, the Static Site tab literally told a reader to "set GITHUB_TOKEN or
 * VERCEL_TOKEN in this server's environment" — with nowhere in the UI to actually do that. This
 * suite pins the real fix at the browser level: a real `POST`/`GET`/`PUT`/`DELETE
 * .../system/publish/credentials` round trip, driven by real clicks, persisting to the real
 * (in-memory) database — never a fake port.
 *
 * `TOVU_EXECUTION_MODE=hosted-api-only` (this suite's own config) is what this file adds beyond
 * `static-site-tab.spec.ts`: proving the plain-language "you need a credential here" notice shows
 * OPEN (not the collapsed self-hosted "Advanced" disclosure) against a real server reading the real
 * env var — `StaticSiteTab.unit.test.tsx` already proves the disclosure SWITCH itself from an
 * injected controller, which is not the same claim as "the real server actually reports this mode".
 *
 * ## This suite never reaches the real internet
 *
 * A saved credential here is a Vercel connection with a placeholder token — the CRUD routes under
 * test (create/list/edit/delete) only persist an ENCRYPTED row; none of them ever construct a
 * provider API client or make an outbound call. `GITHUB_TOKEN`/`VERCEL_TOKEN` are never set for this
 * harness's API server either (this config's own `env` block does not mention them), so even a
 * publish attempt would settle without leaving the process — this suite does not trigger one.
 */

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });
});

/** Scopes an assertion to ONE credential row by its label — "Vercel" alone would also match the
 *  provider tab picker and the CLI recommendation section elsewhere on this same tab, so every
 *  assertion below reads from inside this row rather than the page as a whole. */
function credentialRow(page: import("@playwright/test").Page, label: string) {
  return page.locator(".deployment-credentials-list-item").filter({ hasText: label });
}

test.describe("Static Site tab — credentials, hosted-api-only disclosure", () => {
  test("shows the plain-language hosted notice OPEN, never the collapsed self-hosted Advanced disclosure", async ({ page }) => {
    await expect(
      page.getByText(
        "This workspace cannot use your computer's terminal or CLI sign-in. To publish here, connect a provider and save its credentials below."
      )
    ).toBeVisible();
    await expect(page.getByText("Advanced: publish with server-side provider credentials")).toHaveCount(0);
    // The controls themselves are visible without expanding anything — this mode never nags a
    // reader with a hidden disclosure of its own.
    await expect(page.getByRole("button", { name: "Add credential" })).toBeVisible();
  });
});

test.describe("Static Site tab — credentials, real CRUD round trip", () => {
  test("create, reload, edit, then delete a real saved credential — every step through a real route", async ({ page }) => {
    const label = `E2E Vercel ${Date.now()}`;

    await page.getByRole("button", { name: "Add credential" }).click();
    await page.getByLabel("Provider").selectOption("vercel");
    await page.getByLabel("Label").fill(label);
    await page.getByLabel("Access token").fill("fake-vercel-token-for-e2e");
    await page.getByRole("button", { name: "Save credential" }).click();

    const row = credentialRow(page, label);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText("Vercel", { exact: true })).toBeVisible();
    await expect(row.getByText(/Updated/)).toBeVisible();

    // A real page reload re-reads the real `GET .../system/publish/credentials` route — proves the
    // row is a real database write, not local-only optimistic state that would vanish on reload.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(credentialRow(page, label)).toBeVisible({ timeout: 10_000 });

    // Edit: change only the label, leave the token blank — proves "blank token = keep the stored
    // secret" reaches the real PUT route (a server that instead required a token here would 400).
    const renamedLabel = `${label} renamed`;
    await credentialRow(page, label).getByRole("button", { name: "Edit" }).click();
    await expect(page.getByLabel("Access token")).toHaveValue("");
    await page.getByLabel("Label").fill(renamedLabel);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(credentialRow(page, renamedLabel)).toBeVisible({ timeout: 10_000 });
    await expect(credentialRow(page, label)).toHaveCount(0);

    // Delete: the row is really gone after a real DELETE + local removal, not just visually hidden.
    await credentialRow(page, renamedLabel).getByRole("button", { name: "Delete" }).click();
    await expect(credentialRow(page, renamedLabel)).toHaveCount(0, { timeout: 10_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(credentialRow(page, renamedLabel)).toHaveCount(0);
  });

  test("a real 409 from a duplicate label surfaces in the form, and never creates a second row", async ({ page }) => {
    const label = `E2E Duplicate ${Date.now()}`;

    await page.getByRole("button", { name: "Add credential" }).click();
    await page.getByLabel("Provider").selectOption("vercel");
    await page.getByLabel("Label").fill(label);
    await page.getByLabel("Access token").fill("fake-vercel-token-for-e2e");
    await page.getByRole("button", { name: "Save credential" }).click();
    await expect(credentialRow(page, label)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Add credential" }).click();
    await page.getByLabel("Provider").selectOption("vercel");
    await page.getByLabel("Label").fill(label);
    await page.getByLabel("Access token").fill("a-different-fake-token");
    await page.getByRole("button", { name: "Save credential" }).click();

    await expect(page.getByText("A credential with this label already exists.")).toBeVisible({ timeout: 10_000 });
    // Still exactly one row with this label — the rejected second attempt never got appended.
    await expect(page.locator(".deployment-credentials-list-item").filter({ hasText: label })).toHaveCount(1);
  });

  test("github-pages requires owner/repo before Save enables — never lets an incomplete credential through", async ({ page }) => {
    await page.getByRole("button", { name: "Add credential" }).click();
    // github-pages is the default provider selection.
    await page.getByLabel("Label").fill(`E2E GitHub ${Date.now()}`);
    await page.getByLabel("Access token").fill("fake-gh-token-for-e2e");
    await expect(page.getByRole("button", { name: "Save credential" })).toBeDisabled();

    await page.getByLabel("Owner or org for this token").fill("octocat");
    await page.getByLabel("Repository for this token").fill("demo-repo");
    await expect(page.getByRole("button", { name: "Save credential" })).toBeEnabled();
  });
});
