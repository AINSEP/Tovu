import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

/**
 * @file Deployment panel → Static Site tab → credential section, driven through the REAL admin SPA
 * against the REAL Tovu API (`../playwright.static-site-tab-credentials.config.ts`'s hermetic
 * two-server harness, `TOVU_DB=memory`, `TOVU_EXECUTION_MODE=hosted-api-only`). No route stubbing.
 *
 * 2026-08-15 redesign: this section used to be an add/edit/delete list of user-named connections
 * (an "Add credential" button, a provider `<select>`, a `Label` field). The owner's own read: "'Add
 * credential' should be gone. Just list the providers, labels, and access token space, and that's
 * it." This suite was rewritten to pin the NEW shape — one always-visible row per provider, each
 * with its own token input and Save action — against the same real CRUD routes the old suite proved
 * (create/list/update), driven by real clicks, persisting to the real (in-memory) database.
 *
 * ## This suite never reaches the real internet
 *
 * A saved credential here is a Vercel connection with a placeholder token — the CRUD routes under
 * test (create/list/update) only persist an ENCRYPTED row; none of them ever construct a provider
 * API client or make an outbound call. `GITHUB_TOKEN`/`VERCEL_TOKEN` are never set for this harness's
 * API server either (this config's own `env` block does not mention them), so even a publish attempt
 * would settle without leaving the process — this suite does not trigger one.
 */

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });
});

/** Scopes every assertion/action to ONE provider's row by its exact name — "Vercel" alone would also
 *  match the provider tab picker and the CLI recommendation section elsewhere on this same tab, so
 *  every locator below reads from inside this row rather than the page as a whole. Filters on
 *  `.deployment-credential-row-name` (`StaticSiteTab.tsx`'s dedicated row-name span) with exact text,
 *  not a substring match against the whole row, for the same "a prefix match hits the wrong row"
 *  reason the OLD version of this suite's `credentialRow` helper documented for labels. */
function credentialRow(page: import("@playwright/test").Page, providerLabel: string) {
  return page
    .locator(".deployment-credential-row")
    .filter({ has: page.locator(".deployment-credential-row-name", { hasText: new RegExp(`^${providerLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }) });
}

test.describe("Static Site tab — credentials, hosted-api-only disclosure", () => {
  test("shows the plain-language hosted notice OPEN, never the collapsed self-hosted Advanced disclosure", async ({ page }) => {
    await expect(
      page.getByText(
        "This workspace cannot use your computer's terminal or CLI sign-in. To publish here, connect a provider and save its credentials below."
      )
    ).toBeVisible();
    await expect(page.getByText("Advanced: publish with server-side provider credentials")).toHaveCount(0);
    // All four provider rows are visible without expanding anything — this mode never nags a
    // reader with a hidden disclosure of its own, and there is no "Add credential" step in the way.
    await expect(page.getByRole("button", { name: "Add credential" })).toHaveCount(0);
    for (const provider of ["GitHub Pages", "Vercel", "Netlify", "Cloudflare Pages"]) {
      await expect(credentialRow(page, provider)).toBeVisible();
      await expect(credentialRow(page, provider).getByText("Not connected")).toBeVisible();
    }
  });
});

test.describe("Static Site tab — credentials, real CRUD round trip", () => {
  test("save, reload, then replace the token — every step through a real route, no label ever typed", async ({ page }) => {
    const row = credentialRow(page, "Vercel");

    // The token box starts visibly empty — no placeholder standing in for a value.
    await expect(row.getByLabel("Access token")).toHaveValue("");
    await expect(row.getByLabel("Access token")).not.toHaveAttribute("placeholder");
    await expect(row.getByRole("button", { name: "Save" })).toBeDisabled();

    await row.getByLabel("Access token").fill("fake-vercel-token-for-e2e");
    await expect(row.getByRole("button", { name: "Save" })).toBeEnabled();
    await row.getByRole("button", { name: "Save" }).click();

    await expect(row.getByText(/^Connected/)).toBeVisible({ timeout: 10_000 });
    // The token box clears back to empty once saved — it is never re-shown, even right after saving.
    await expect(row.getByLabel("Access token")).toHaveValue("");

    // A real page reload re-reads the real `GET .../system/publish/credentials` route — proves the
    // row is a real database write, not local-only optimistic state that would vanish on reload.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(credentialRow(page, "Vercel").getByText(/^Connected/)).toBeVisible({ timeout: 10_000 });

    // Replace: type a brand-new token into the already-connected row. This exercises the real PUT
    // route (an update, not a second create) — the row stays exactly one row, never a duplicate.
    const reconnectedRow = credentialRow(page, "Vercel");
    await expect(reconnectedRow.getByText(/Leave blank to keep the current token/)).toBeVisible();
    await reconnectedRow.getByLabel("Access token").fill("a-replaced-fake-token-for-e2e");
    await reconnectedRow.getByRole("button", { name: "Save" }).click();
    await expect(reconnectedRow.getByText(/^Connected/)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".deployment-credential-row")).toHaveCount(4); // still one row per provider, never a duplicate
  });

  test("github-pages needs only a token — no label, no owner/repo on this row", async ({ page }) => {
    // Owner/repo live on the publish TARGET config (chosen per run in the section below this one),
    // never on the saved credential — see `rules.ts`'s `PUBLISH_CREDENTIAL_PROVIDERS` doc
    // (`requiredFields: []` for every provider except cloudflare-pages). A github-pages credential
    // is a bare token.
    const row = credentialRow(page, "GitHub Pages");
    await expect(row.getByRole("button", { name: "Save" })).toBeDisabled();
    await expect(page.getByLabel("Label")).toHaveCount(0);
    await expect(page.getByLabel("Provider")).toHaveCount(0);

    await row.getByLabel("Access token").fill("fake-gh-token-for-e2e");
    await expect(row.getByRole("button", { name: "Save" })).toBeEnabled();
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.getByText(/^Connected/)).toBeVisible({ timeout: 10_000 });
  });

  test("cloudflare-pages requires BOTH a token and an Account ID before Save enables", async ({ page }) => {
    const row = credentialRow(page, "Cloudflare Pages");
    await expect(row.getByRole("button", { name: "Save" })).toBeDisabled();

    await row.getByLabel("Access token").fill("fake-cf-token-for-e2e");
    await expect(row.getByRole("button", { name: "Save" })).toBeDisabled(); // account id still blank

    await row.getByLabel("Account ID").fill("acct-e2e-123");
    await expect(row.getByRole("button", { name: "Save" })).toBeEnabled();
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.getByText(/^Connected/)).toBeVisible({ timeout: 10_000 });
  });
});
