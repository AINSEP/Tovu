import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures";

/**
 * @file Regression/verification suite for the Security page's Access Tokens tab
 * (`apps/admin/src/features/security/`, `/admin/access-tokens`) — the centralized place to Create,
 * Replace, and Remove named tokens across `publish_credential_sets`/`source_control_credential_sets`,
 * per `development/todos.md:1208` and its 2026-08-16 supersessions.
 *
 * No `waitForLoadState("networkidle")` anywhere here — confirmed live (project memory) that it never
 * resolves against this admin app. Every wait is an explicit element/state wait instead.
 */

test.describe("Access Tokens tab", () => {
  test("renders all seven providers as Not connected before anything is saved", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/access-tokens", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Security", level: 1 })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Access Tokens/ })).toBeVisible();

    // "GitHub" alone is deliberately excluded from this loop — it is a substring of BOTH "GitHub
    // Pages · Publishing" and "GitHub · Source Control" (`rules.ts`'s own "two-store GitHub trap"),
    // so both are checked explicitly below instead.
    const providerLabels = ["GitHub Pages", "Vercel", "Netlify", "Cloudflare Pages", "GitLab", "Bitbucket"];
    for (const label of providerLabels) {
      await expect(page.getByRole("heading", { name: new RegExp(`^${label}\\b`), level: 3 })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: /^GitHub Pages/, level: 3 })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^GitHub\s*·\s*Source Control/, level: 3 })).toBeVisible();
    // Every provider starts unconnected — the "0 tokens saved" count is the honest starting state.
    await expect(page.getByText(/^0 tokens saved$/)).toBeVisible();
  });

  test("create a named GitHub Pages token, it shows connected with the typed name, and Static Site still sees it", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/access-tokens", { waitUntil: "domcontentloaded" });

    // Scope to the GitHub Pages · Publishing group specifically — "GitHub" alone would also match
    // the GitHub · Source Control group further down (this page's own "two-store GitHub trap"
    // guard, `rules.ts`'s header).
    const githubPagesGroup = page.locator(".access-tokens-provider-group", { has: page.getByRole("heading", { name: /^GitHub Pages/ }) });
    await githubPagesGroup.getByRole("button", { name: "Connect" }).click();

    await githubPagesGroup.getByLabel("Name").fill("Production");
    await githubPagesGroup.getByLabel("Access token").fill("ghp_e2e_test_token_123");
    await githubPagesGroup.getByRole("button", { name: "Save" }).click();

    // The row now reads as connected under the typed name, not the raw "default" sentinel label.
    // `{ exact: true }` (not just a scoped locator) is required: the row's own hidden Remove
    // dialog — always present in the DOM, never removed, just unopened — carries an <h2> reading
    // 'Remove "Production" from Tovu?', which a non-exact substring match would also resolve to.
    await expect(githubPagesGroup.getByText("Production", { exact: true })).toBeVisible();
    await expect(githubPagesGroup.getByText(/Connect$/)).toHaveCount(0);

    // Cross-page compatibility: this write went through the SAME `publish_credential_sets` row
    // Static Site's own `defaultCredentialForProvider` reads — the Static Site tab must still show
    // it as connected, unmodified by this page's existence (`Security.tsx`'s own header, "Static
    // Site and Source Control are UNCHANGED").
    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/connected/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("search for 'github' surfaces both the Pages and Source Control groups, never merged into one card", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/access-tokens", { waitUntil: "domcontentloaded" });

    await page.getByLabel("Search access tokens").fill("github");

    await expect(page.getByRole("heading", { name: /^GitHub Pages/, level: 3 })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^GitHub\s*·\s*Source Control/, level: 3 })).toBeVisible();
    // Providers this query does not match are hidden, not just filtered-empty.
    await expect(page.getByRole("heading", { name: /^Vercel/, level: 3 })).toHaveCount(0);
  });

  test("rename an existing token without retyping it, and Remove reads 'Remove from Tovu' with the non-revocation disclosure", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/access-tokens", { waitUntil: "domcontentloaded" });

    const netlifyGroup = page.locator(".access-tokens-provider-group", { has: page.getByRole("heading", { name: /^Netlify/ }) });
    await netlifyGroup.getByRole("button", { name: "Connect" }).click();
    await netlifyGroup.getByLabel("Name").fill("30-day test token");
    await netlifyGroup.getByLabel("Access token").fill("nfp_e2e_test_token_456");
    await netlifyGroup.getByRole("button", { name: "Save" }).click();
    // `{ exact: true }` throughout this test for the same reason `access-tokens.spec.ts`'s first
    // create test documents: the row's own (present-but-closed) Remove dialog carries the name as a
    // substring of its own <h2>, which a non-exact match would also resolve to.
    await expect(netlifyGroup.getByText("30-day test token", { exact: true })).toBeVisible();

    // Rename-only: open the row, change ONLY the Name field (leave Access token blank), Save.
    await netlifyGroup.getByText("30-day test token", { exact: true }).click();
    const nameField = netlifyGroup.getByLabel("Name");
    await nameField.fill("Renamed token");
    await netlifyGroup.getByRole("button", { name: "Save" }).click();
    await expect(netlifyGroup.getByText("Renamed token", { exact: true })).toBeVisible();

    // Remove — the dialog must say "Remove from Tovu" and explicitly disclose that removing here
    // does not revoke the credential at the provider (`rules.ts`'s own load-bearing copy constraint).
    await netlifyGroup.getByRole("button", { name: "Remove from Tovu" }).click();
    const dialog = page.locator("dialog.confirm-dialog[open]");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/does NOT revoke the token/i)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Remove from Tovu" })).toBeVisible();
    await dialog.getByRole("button", { name: "Remove from Tovu" }).click();

    await expect(netlifyGroup.getByText("Renamed token", { exact: true })).toHaveCount(0);
    await expect(netlifyGroup.getByText("Not connected")).toBeVisible();
  });

  test("a second named token for the same provider shows a Default pill and a Make default link", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/access-tokens", { waitUntil: "domcontentloaded" });

    const cloudflareGroup = page.locator(".access-tokens-provider-group", { has: page.getByRole("heading", { name: /^Cloudflare Pages/ }) });
    await cloudflareGroup.getByRole("button", { name: "Connect" }).click();
    await cloudflareGroup.getByLabel("Name").fill("Production");
    await cloudflareGroup.getByLabel("Access token").fill("cf_e2e_token_1");
    await cloudflareGroup.getByLabel("Account ID").fill("acct-e2e-1");
    await cloudflareGroup.getByRole("button", { name: "Save" }).click();
    // `{ exact: true }` — see the first create test's own comment on why (the row's own closed
    // Remove dialog carries the name as a substring of its <h2>).
    await expect(cloudflareGroup.getByText("Production", { exact: true })).toBeVisible();

    // No Default UI yet — a lone row has nothing to choose between (`rules.ts`'s own doc).
    await expect(cloudflareGroup.getByText("Default", { exact: true })).toHaveCount(0);

    await cloudflareGroup.getByRole("button", { name: /Add another/ }).click();
    // Scoped to the ADD form specifically (`.access-tokens-row` with no `-done` modifier,
    // `AddTokenForm`'s own markup) — a plain `.getByLabel("Name")` on the whole group is now
    // ambiguous: the first row's own Name input is still present in the DOM (a closed native
    // `<details>` keeps its children mounted, just unpainted), so it and the add form's blank Name
    // field both match.
    const addForm = cloudflareGroup.locator(".access-tokens-row:not(.access-tokens-row-done)");
    await addForm.getByLabel("Name").fill("Staging");
    await addForm.getByLabel("Access token").fill("cf_e2e_token_2");
    await addForm.getByLabel("Account ID").fill("acct-e2e-2");
    await addForm.getByRole("button", { name: "Save" }).click();
    await expect(cloudflareGroup.getByText("Staging", { exact: true })).toBeVisible();

    // Now that there are two, exactly one Default pill and one Make-default link should be present.
    await expect(cloudflareGroup.getByText("Default", { exact: true })).toBeVisible();
    const makeDefault = cloudflareGroup.getByRole("button", { name: "Make default" });
    await expect(makeDefault).toBeVisible();
    await makeDefault.click();
    await expect(cloudflareGroup.getByText("Default", { exact: true })).toBeVisible();
    await expect(cloudflareGroup.getByRole("button", { name: "Make default" })).toBeVisible();
  });

  test("a token saved through Static Site BEFORE this page existed shows up with a real name, not the raw 'default' label", async ({ page }) => {
    await loginAsAdmin(page);
    // Seed a credential the OLD way — Static Site's own flat per-provider row, which always writes
    // `label: "default"` (`PUBLISH_CREDENTIAL_ROW_LABEL`, `deployment/rules.ts`). This is exactly
    // what every workspace's already-saved token looks like before this page's one-time legacy-label
    // migration (`use-access-tokens.hooks.ts`'s header) ever runs.
    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });
    // Static Site picks ONE provider at a time via its own inner `TabBar` (2026-08-15 redesign —
    // `StaticSiteTab.tsx`'s own header), not four simultaneous rows — select Vercel there first.
    await page.getByRole("tab", { name: /^Vercel/ }).click();
    await page.getByLabel("Access token").fill("fake-vercel-token-for-migration-e2e");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/connected/i).first()).toBeVisible({ timeout: 10_000 });

    // Now open the Access Tokens tab — the brief's own "v1 must migrate what's already stored"
    // requirement: this row must appear with a sensible auto-generated name, never literally
    // "default", and nobody had to re-paste the token to get it.
    await page.goto("/admin/access-tokens", { waitUntil: "domcontentloaded" });
    const vercelGroup = page.locator(".access-tokens-provider-group", { has: page.getByRole("heading", { name: /^Vercel/ }) });
    await expect(vercelGroup.getByText("Vercel token", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(vercelGroup.getByText("default", { exact: true })).toHaveCount(0);

    // And Static Site itself is unaffected by the rename — still reads this same row as connected,
    // through the same `isDefault` lookup it always used (never by label text).
    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: /^Vercel/ }).click();
    await expect(page.getByText(/connected/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
