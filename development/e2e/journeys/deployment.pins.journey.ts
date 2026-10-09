// Todo 11: original bug pins consolidated by area. Browser execution is pending.
import { test } from "../support/bug-pin-fixtures.js";
import { PUBLIC_URL as PIN_PUBLIC_URL } from "../support/bug-pin-fixtures.js";
import { JOURNEY_ADMIN_PASSWORD as PIN_PASSWORD } from "../support/bug-pin-fixtures.js";
import { expect } from "../support/bug-pin-fixtures.js";
/** Reuse the browser-session transport: APIRequestContext omits Secure cookies over HTTP
 * loopback. Native Response keeps status and JSON assertions on the real route's response. */
import { loginAsAdmin, pinSessionRequest as deploymentRequest } from "../support/bug-pin-auth.js";
import { randomUUID } from "node:crypto";
import { type Page } from "../support/bug-pin-fixtures.js";
import fs from "node:fs";
import path from "node:path";

// Preserve the retired configs' effective Chromium viewport (Desktop Chrome or browser default).
// Nested test.use and explicit resizes still win.
test.use({ viewport: { width: 1280, height: 720 } });

// Migrated from access-tokens.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: access-tokens", () => {
const CREDENTIALS_PATH = "/api/admin/v1/workspaces/workspace-local/system";

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
  test("renders all six installed providers and the current saved-token count", async ({ page }) => {
    await loginAsAdmin(page);
    const snapshots = ["publish", "source-control", "custom"].map((kind) =>
      page.waitForResponse((response) => response.url().endsWith(`${CREDENTIALS_PATH}/${kind}/credentials`) && response.request().method() === "GET")
        .then((response) => response.json())
    );
    await page.goto("/admin/access-tokens", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Secrets", level: 1 })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Access Tokens/ })).toBeVisible();

    // "GitHub" alone is deliberately excluded from this loop — it is a substring of BOTH "GitHub
    // Pages · Hosting" and "GitHub · Source control" (`rules.ts`'s own "two-store GitHub trap"),
    // so both are checked explicitly below instead.
    // ff7ec2166 intentionally replaced the hard-coded GitLab/Bitbucket entries with plugin
    // descriptors; the bundled deploy and github plugins own these six installed providers.
    const providerLabels = ["GitHub Pages", "Vercel", "Netlify", "Cloudflare Pages", "S3-compatible storage"];
    for (const label of providerLabels) {
      await expect(page.getByRole("heading", { name: `${label} · Hosting`, exact: true, level: 3 })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: /^GitHub Pages/, level: 3 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "GitHub · Source control", exact: true, level: 3 })).toBeVisible();
    // This server is shared: count the snapshots this page actually read, rather than assuming
    // the database was empty before this test started.
    const saved = (await Promise.all(snapshots)).reduce((count, snapshot) => count + snapshot.credentials.length, 0);
    await expect(page.getByText(`${saved} ${saved === 1 ? "token" : "tokens"} saved`, { exact: true })).toBeVisible();
  });

  test("create a named GitHub Pages token, it shows connected with the typed name, and Static Site still sees it", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/access-tokens", { waitUntil: "domcontentloaded" });

    // Scope to the GitHub Pages · Hosting group specifically — "GitHub" alone would also match
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
    await page.getByRole("tab", { name: /^GitHub Pages/ }).click();
    await expect(page.locator('[data-agent-element="deployment-static-site-credentials-row-github-pages"] > summary .deployment-step-summary-text')).toContainText("GitHub Pages connected");
  });

  test("search for 'github' surfaces both the Pages and Source Control groups, never merged into one card", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/access-tokens", { waitUntil: "domcontentloaded" });

    await page.getByLabel("Search access tokens").fill("github");

    await expect(page.getByRole("heading", { name: /^GitHub Pages/, level: 3 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "GitHub · Source control", exact: true, level: 3 })).toBeVisible();
    // Providers this query does not match are hidden, not just filtered-empty.
    await expect(page.getByRole("heading", { name: /^Vercel/, level: 3 })).toHaveCount(0);
  });

  test("source-control writes recover after rejection, and custom providers persist", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/access-tokens", { waitUntil: "domcontentloaded" });
    const name = `e2e-source-${Date.now()}`;
    const github = page.locator(".access-tokens-provider-group", { has: page.getByRole("heading", { name: "GitHub · Source control", exact: true }) });
    await github.getByRole("button", { name: "Connect GitHub", exact: true }).click();
    const form = github.locator(".access-tokens-row:not(.access-tokens-row-done)");
    await form.getByLabel("Name").fill(name);
    await form.getByLabel("Access token").fill("ghp_e2e_source_retry");
    const rejectWrite = async (route: import("@playwright/test").Route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAVAILABLE", message: "e2e rejected write" } }) });
      } else await route.continue();
    };
    await page.route(`**${CREDENTIALS_PATH}/source-control/credentials`, rejectWrite);
    await form.getByRole("button", { name: /^Save/ }).click();
    await expect(form.locator(".save-error")).toBeVisible();
    await expect(form.getByLabel("Access token")).toHaveValue("ghp_e2e_source_retry");
    await expect(form.getByRole("button", { name: /^Save/ })).toBeEnabled();
    await page.unroute(`**${CREDENTIALS_PATH}/source-control/credentials`, rejectWrite);
    await form.getByRole("button", { name: /^Save/ }).click();
    await expect(github.getByText(name, { exact: true })).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(github.getByText(name, { exact: true })).toBeVisible();

    const customName = `e2e-custom-${Date.now()}`;
    await page.getByRole("button", { name: /Add custom provider/ }).click();
    const dialog = page.locator("dialog.access-tokens-add-custom-dialog[open]");
    await dialog.getByLabel(/^Name/).fill(customName);
    await dialog.getByLabel(/^API base URL/).fill("https://e2e.example.invalid");
    await dialog.getByLabel(/^Access token/).fill("e2e_custom_token");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.reload({ waitUntil: "domcontentloaded" });
    // The saved provider's name renders three times (group heading, row name, and its closed Remove
    // dialog's label); the row name is the persisted record this step proves survives a reload.
    await expect(page.locator(".access-tokens-row-name").filter({ hasText: new RegExp(`^${customName}$`) })).toBeVisible();
    await page.getByRole("button", { name: /Add custom provider/ }).click();
    await dialog.getByLabel(/^Name/).fill(customName);
    await dialog.getByLabel(/^API base URL/).fill("https://e2e.example.invalid");
    await dialog.getByLabel(/^Access token/).fill("e2e_duplicate_token");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog.locator(".save-error")).toContainText("already exists");
    await expect(page.locator(".access-tokens-row-name").filter({ hasText: customName })).toHaveCount(1);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
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
    const renameResponse = page.waitForResponse((response) => response.url().includes(`${CREDENTIALS_PATH}/publish/credentials/`) && response.request().method() === "PUT");
    await netlifyGroup.getByRole("button", { name: "Save" }).click();
    const renamed = await renameResponse;
    expect(renamed.request().postDataJSON()).toEqual({ label: "Renamed token" });
    expect(renamed.ok()).toBe(true);
    const { credential } = await renamed.json();
    expect(credential.configured).toBe(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(netlifyGroup.getByText("Renamed token", { exact: true })).toBeVisible();
    const persisted = await deploymentRequest({ page, url: `${CREDENTIALS_PATH}/publish/credentials` });
    expect(persisted.ok).toBe(true);
    expect((await persisted.json()).credentials).toContainEqual(expect.objectContaining({ id: credential.id, label: "Renamed token", configured: true }));
    await netlifyGroup.getByText("Renamed token", { exact: true }).click();

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
    await cloudflareGroup.getByLabel("API token", { exact: true }).fill("cf_e2e_token_1");
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
    await addForm.getByLabel("API token", { exact: true }).fill("cf_e2e_token_2");
    await addForm.getByLabel("Account ID").fill("acct-e2e-2");
    await addForm.getByRole("button", { name: "Save" }).click();
    await expect(cloudflareGroup.getByText("Staging", { exact: true })).toBeVisible();

    // Now that there are two, exactly one Default pill and one Make-default link should be present.
    await expect(cloudflareGroup.getByText("Default", { exact: true })).toBeVisible();
    const production = cloudflareGroup.locator(".access-tokens-row-done", { has: page.getByText("Production", { exact: true }) });
    const staging = cloudflareGroup.locator(".access-tokens-row-done", { has: page.getByText("Staging", { exact: true }) });
    await expect(production.getByText("Default", { exact: true })).toBeVisible();
    const makeDefault = staging.getByRole("button", { name: /^Make default/ });
    await expect(makeDefault).toBeVisible();
    await makeDefault.click();
    await expect(cloudflareGroup.getByText("Default", { exact: true })).toBeVisible();
    await expect(staging.getByText("Default", { exact: true })).toBeVisible();
    await expect(production.getByText("Default", { exact: true })).toHaveCount(0);
    await expect(production.getByRole("button", { name: /^Make default/ })).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(staging.getByText("Default", { exact: true })).toBeVisible();
    await expect(production.getByRole("button", { name: /^Make default/ })).toBeVisible();
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
    await expect(page.locator('[data-agent-element="deployment-static-site-credentials-row-vercel"] > summary .deployment-step-summary-text')).toContainText("Vercel connected");

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
    await expect(page.locator('[data-agent-element="deployment-static-site-credentials-row-vercel"] > summary .deployment-step-summary-text')).toContainText("Vercel connected");
  });
});
});

// Migrated from deployment-overview.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: deployment-overview", () => {
const WARNING = "Still the default — set TOVU_ADMIN_PASSWORD.";
const EPS = 1; // Allow subpixel rounding when comparing containment edges.
const snapshot = {
  mode: "local",
  productionReadinessGate: { applicable: false, passed: false },
  defaultOwnerPasswordUnsafe: true,
  daemonKnownFailed: false,
  dbPath: "/tmp/tovu-deployment-overview/content.db",
  uploadsDir: "/tmp/tovu-deployment-overview/uploads",
  envVars: [{ name: "TOVU_ADMIN_PASSWORD", set: true }],
};

// jsdom cannot observe this overflow. Mock only the diagnostic response so the real
// Overview component and stylesheet always render the long default-password warning.
test("Overview fact badges fit their cells and keep the full password warning visible", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("tovu-admin-sidebar-rail-collapsed", "false");
  });
  await page.route("**/api/admin/v1/workspaces/*/system/deployment-overview", async (route) => {
    await route.fulfill({ json: snapshot });
  });
  await loginAsAdmin(page);
  await page.goto("/admin/deployment?tab=overview", { waitUntil: "domcontentloaded" });

  const card = page.locator(".card").filter({
    has: page.getByRole("heading", { name: "How this instance is running", exact: true }),
  });
  const badges = card.locator(".deployment-fact .status");
  const warning = badges.filter({ hasText: WARNING });
  await expect(badges).toHaveCount(4);
  await expect(warning).toHaveText(WARNING);
  await page.evaluate(() => document.fonts.ready);

  // One login avoids the real login rate limiter; resizing retains the same rendered facts.
  for (const width of [390, 1024, 1440, 1600]) {
    await test.step(`${width}px`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await warning.scrollIntoViewIfNeeded();
      await expect(warning).toBeVisible();

      const boxes = await badges.evaluateAll((elements) => elements.map((badge) => {
        const cell = badge.parentElement;
        if (!cell?.matches(".deployment-fact-value")) throw new Error("Missing fact value cell");
        const rect = badge.getBoundingClientRect();
        const cellRect = cell.getBoundingClientRect();
        return {
          text: badge.textContent?.trim(),
          badge: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          cell: { left: cellRect.left, top: cellRect.top, right: cellRect.right, bottom: cellRect.bottom },
        };
      }));
      for (const { text, badge, cell } of boxes) {
        expect(badge.left, `${text}: left edge`).toBeGreaterThanOrEqual(cell.left - EPS);
        expect(badge.top, `${text}: top edge`).toBeGreaterThanOrEqual(cell.top - EPS);
        expect(badge.right, `${text}: right edge`).toBeLessThanOrEqual(cell.right + EPS);
        expect(badge.bottom, `${text}: bottom edge`).toBeLessThanOrEqual(cell.bottom + EPS);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].badge;
          const b = boxes[j].badge;
          const intersects = Math.min(a.right, b.right) > Math.max(a.left, b.left)
            && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
          expect(intersects, `${boxes[i].text} overlaps ${boxes[j].text}`).toBe(false);
        }
      }

      // DOM visibility alone permits clipped text. Check every rendered text fragment
      // against the badge, content scroller, and viewport after scrolling it into view.
      const textGeometry = await warning.evaluate((badge) => {
        const rect = badge.getBoundingClientRect();
        const content = badge.closest(".admin-content");
        if (!content) throw new Error("Missing admin content scroller");
        const contentRect = content.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(badge);
        return {
          fragments: Array.from(range.getClientRects(), (fragment) => ({
            left: fragment.left, top: fragment.top, right: fragment.right, bottom: fragment.bottom,
          })),
          visible: {
            left: Math.max(0, rect.left, contentRect.left),
            top: Math.max(0, rect.top, contentRect.top),
            right: Math.min(innerWidth, rect.right, contentRect.right),
            bottom: Math.min(innerHeight, rect.bottom, contentRect.bottom),
          },
          overflowX: badge.scrollWidth - badge.clientWidth,
          overflowY: badge.scrollHeight - badge.clientHeight,
        };
      });
      expect(textGeometry.fragments.length).toBeGreaterThan(0);
      expect(textGeometry.overflowX).toBeLessThanOrEqual(EPS);
      expect(textGeometry.overflowY).toBeLessThanOrEqual(EPS);
      for (const fragment of textGeometry.fragments) {
        expect(fragment.left).toBeGreaterThanOrEqual(textGeometry.visible.left - EPS);
        expect(fragment.top).toBeGreaterThanOrEqual(textGeometry.visible.top - EPS);
        expect(fragment.right).toBeLessThanOrEqual(textGeometry.visible.right + EPS);
        expect(fragment.bottom).toBeLessThanOrEqual(textGeometry.visible.bottom + EPS);
      }
    });
  }
});
});

// Migrated from deployment-static-site-token-picker.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: deployment-static-site-token-picker", () => {
/**
 * @file Coverage for the Static Site tab's "which saved token publishes" picker
 * (`CredentialTokenPicker`, `StaticSiteTab.tsx`) — the owner's own original ask, per
 * `use-publish-credentials.hooks.ts`'s `credentialsForProvider` doc: "GitHub pages... will have a
 * dropdown where you can choose which GitHub access tokens". Landed alongside the sibling "Verify"
 * gap fix (`deployment-static-site-verify-gap.spec.ts`) in the same pass, 2026-08-16.
 *
 * The picker only renders once a provider has MORE than one saved credential — `rules.unit.test.ts`
 * and `StaticSiteTab.unit.test.tsx` already pin that gating logic against a fake controller. This
 * file proves the real thing: two credentials actually saved through the API, the picker actually
 * rendered with both as options, and choosing the non-default one actually promotes it server-side
 * (`PUT .../credentials/:id` with `isDefault: true`) — the same mechanic the Security page's own
 * "Make default" already uses, reused here rather than reinvented.
 *
 * Synthetic credentials only (`data-classification.md`'s synthetic-PII rule) — neither token is ever
 * expected to verify as valid against the real GitHub API; this file never calls the verify route.
 */

const WORKSPACE_ID = "workspace-local";
const CREDENTIALS_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/system/publish/credentials`;

test.describe("Deployment > Static Site > GitHub Pages: choosing which saved token publishes", () => {
  test("two saved credentials for one provider render a picker; choosing the other one promotes it to default", async ({ page }) => {
    await loginAsAdmin(page);

    const suffix = randomUUID();
    const primaryLabel = `primary-${suffix}`;
    const backupLabel = `backup-${suffix}`;

    // First save for this provider auto-defaults server-side (`publish-credentials/store.ts`'s
    // `decideCreateDefault`) — no `isDefault` sent, matching how the flat credential row itself never
    // sends one on a provider's first-ever save (`use-publish-credentials.hooks.ts`'s own `save` doc).
    const primaryRes = await deploymentRequest({ page, url: CREDENTIALS_PATH, method: "POST",
      data: { label: primaryLabel, connection: { providerId: "github-pages", token: "ghp_synthetic_primary_0000000000" } },
    });
    expect(primaryRes.ok, `seeding the primary credential failed: ${primaryRes.status} ${await primaryRes.clone().text()}`).toBe(true);
    const { credential: primary } = (await primaryRes.json()) as { credential: { id: string; isDefault: boolean } };
    // Another spec may already have saved this provider: establish our chosen default explicitly.
    const defaultRes = await deploymentRequest({ page, url: `${CREDENTIALS_PATH}/${primary.id}`, method: "PUT", data: { isDefault: true } });
    expect(defaultRes.ok).toBe(true);

    // A second saved connection for the SAME provider, a different label (the server's own
    // `(workspace_id, provider_id, label)` UNIQUE constraint requires it) — deliberately not sent as
    // default, so it lands `isDefault: false` and the picker has something real to switch AWAY from.
    const backupRes = await deploymentRequest({ page, url: CREDENTIALS_PATH, method: "POST",
      data: { label: backupLabel, connection: { providerId: "github-pages", token: "ghp_synthetic_backup_1111111111" } },
    });
    expect(backupRes.ok, `seeding the backup credential failed: ${backupRes.status} ${await backupRes.clone().text()}`).toBe(true);
    const { credential: backup } = (await backupRes.json()) as { credential: { id: string; isDefault: boolean } };
    expect(backup.isDefault).toBe(false);

    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "GitHub Pages" }).click();
    await expect(page.getByText(/token stored, encrypted/i)).toBeVisible();

    // The picker sits inside the connected row's `<details>` content, revealed on expand — the same
    // "Advanced"-style disclosure `CredentialStepDone`'s own doc explains for "Replace token".
    await page.locator("summary.deployment-step-summary").first().click();

    const picker = page.getByLabel(/which saved token publishes/i);
    await expect(picker).toBeVisible();
    const primaryOption = picker.locator("option").filter({ hasText: primaryLabel });
    const backupOption = picker.locator("option").filter({ hasText: backupLabel });
    await expect(primaryOption).toHaveCount(1);
    await expect(backupOption).toHaveCount(1);
    await expect(primaryOption).toHaveAttribute("value", primary.id);
    await expect(backupOption).toHaveAttribute("value", backup.id);
    await expect(picker).toHaveValue(primary.id); // starts on the current DEFAULT, not an arbitrary row.

    await picker.selectOption({ label: (await backupOption.textContent())! });

    // The write this selection triggers: `selectCredential` PUTs `isDefault: true` to the chosen id,
    // then refetches — proven against the SERVER's own state, not just the `<select>`'s own DOM value
    // (a stale/optimistic-only UI could pass a DOM-only assertion here without ever having written
    // anything real).
    await expect(async () => {
      const listRes = await deploymentRequest({ page, url: CREDENTIALS_PATH });
      expect(listRes.ok).toBe(true);
      const { credentials } = (await listRes.json()) as { credentials: Array<{ id: string; isDefault: boolean }> };
      const nowPrimary = credentials.find((c) => c.id === primary.id);
      const nowBackup = credentials.find((c) => c.id === backup.id);
      expect(nowPrimary?.isDefault).toBe(false);
      expect(nowBackup?.isDefault).toBe(true);
    }).toPass({ timeout: 5000 });

    // The picker itself reflects the new default once the hook's own refetch resolves.
    await expect(picker).toHaveValue(backup.id);
  });

  test("a provider with only one saved credential renders no picker — nothing to choose between", async ({ page }) => {
    await loginAsAdmin(page);

    const createRes = await deploymentRequest({ page, url: CREDENTIALS_PATH, method: "POST",
      data: { label: "default", connection: { providerId: "vercel", token: "vercel_synthetic_token_0000000000" } },
    });
    expect(createRes.ok).toBe(true);

    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Vercel" }).click();
    await expect(page.getByText(/token stored, encrypted/i)).toBeVisible();

    await page.locator("summary.deployment-step-summary").first().click();
    await expect(page.getByLabel(/which saved token publishes/i)).toHaveCount(0);
  });
});
});

// Migrated from deployment-static-site-verify-gap.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: deployment-static-site-verify-gap", () => {
/**
 * @file Regression test for a gap found live during the A1 re-verification pass (2026-08-16, see
 * `ADS-memory/reports/verification/2026-08-16-live-publish-through-assistant.md`).
 *
 * The assistant's own capability tool (`deployment_get_static_publish_capabilities`,
 * `src/features/deployments/static-publish/verify.ts`) tells the model to default a GitHub Pages
 * publish's `owner` from the credential's verified `accountLabel` rather than guessing it — but
 * `accountLabel` only exists once a human (re-)verifies the saved token, and verification is a
 * CACHED, in-memory result (`InMemoryPublishCredentialVerificationCache`, `src/server/app.ts`,
 * `src/server/deps.ts`) that a server restart silently wipes even though the credential itself is
 * unchanged. When that happens live, the assistant tells the human: "Go to Deployment panel ->
 * Static Site -> Publish and hit verify on the GitHub token" — but grepping
 * `apps/admin/src/features/deployment/StaticSiteTab.tsx` for "verify" (any case) returns zero
 * matches. The backend route that would do this (`POST .../publish/credentials/:id/verify`,
 * `src/server/inbound/admin-http/routes/system/publish-credentials.ts:171`) exists and works — confirmed live via
 * a direct authenticated fetch, which returned a real `accountLabel` — but nothing in the admin
 * frontend ever calls it. A human following the assistant's own instructions has no button to find.
 *
 * The Verify control now exists. The first test drives that control and checks the exact row's
 * request and displayed verdict; the second checks the backend route's failed-verification shape.
 *
 * Synthetic credential only (`data-classification.md`'s synthetic-PII rule) — this test never talks
 * to the real GitHub API, so the token value itself is never expected to verify as valid; only its
 * REACHABILITY from the UI, and the raw route's existence, are under test here.
 */

const WORKSPACE_ID = "workspace-local";
const CREDENTIALS_PATH = `/api/admin/v1/workspaces/${WORKSPACE_ID}/system/publish/credentials`;

test.describe("Deployment > Static Site > GitHub Pages: re-verifying an already-saved credential", () => {
  test("a connected-but-unverified credential can be re-verified without re-entering the token", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    // Seed a synthetic, already-saved GitHub Pages credential — simulates the real-world state this
    // bug was found in: a token that IS saved, but whose cached verification is cold (e.g. right
    // after a restart), which is exactly the state `deployment_get_static_publish_capabilities`
    // reports as "not ready" and the assistant then sends the human here to fix.
    const createRes = await deploymentRequest({ page, url: CREDENTIALS_PATH, method: "POST",
      data: {
        label: "e2e-synthetic-github-pages",
        connection: { providerId: "github-pages", token: "ghp_synthetic_test_token_0000000000" },
        isDefault: true,
      },
    });
    expect(createRes.ok, `seeding the synthetic credential failed: ${createRes.status} ${await createRes.clone().text()}`).toBe(true);
    const { credential } = await createRes.json();

    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "GitHub Pages" }).click();

    // The connected-credential card is visible ("token stored, encrypted" per StaticSiteTab.tsx) —
    // confirms the seed worked and we're looking at the right state before asserting on its
    // controls.
    await expect(page.getByText(/token stored, encrypted/i)).toBeVisible();

    const row = page.locator('[data-agent-element="deployment-static-site-credentials-row-github-pages"]');
    const verifyControl = row.getByRole("button", { name: "Verify", exact: true });
    await expect(
      verifyControl,
      'expected a "Verify" control on the connected GitHub Pages credential row'
    ).toBeVisible();
    // Control only the provider verdict at the HTTP boundary; the visible action must still
    // request verification of the exact saved credential and render the returned result.
    const verification = { status: "invalid", message: "e2e provider rejected the saved credential", checkedAt: "2026-09-30T00:00:00.000Z" };
    await page.route(`**${CREDENTIALS_PATH}/${credential.id}/verify`, (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ verification }),
    }));
    const verifyRequest = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === `${CREDENTIALS_PATH}/${credential.id}/verify`);
    await verifyControl.click();
    await verifyRequest;
    await expect(row.getByText(verification.message, { exact: true })).toBeVisible();
    await expect(verifyControl).toBeEnabled();
    await expect(row).not.toHaveAttribute("open", "");
  });

  test("the backend verify route reports a failed check for a synthetic token", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    const createRes = await deploymentRequest({ page, url: CREDENTIALS_PATH, method: "POST",
      data: {
        label: "e2e-synthetic-github-pages-2",
        connection: { providerId: "github-pages", token: "ghp_synthetic_test_token_1111111111" },
        isDefault: true,
      },
    });
    expect(createRes.ok).toBe(true);
    const { credential } = (await createRes.json()) as { credential: { id: string } };

    // Same route the UI calls. A synthetic token will not come back `valid`
    // against the real GitHub API — that's fine, this only asserts the route responds and reports a
    // real verification shape, proving the capability is there for a UI control to call.
    const verifyRes = await deploymentRequest({ page, url: `${CREDENTIALS_PATH}/${credential.id}/verify`, method: "POST" });
    expect(verifyRes.ok, `verify route failed: ${verifyRes.status} ${await verifyRes.clone().text()}`).toBe(true);
    const body = (await verifyRes.json()) as { verification?: { status: string; message: string; checkedAt: string; accountLabel?: string } };
    expect(body.verification?.status).toBeDefined();
    expect(["invalid", "unreachable"]).toContain(body.verification?.status);
    expect(body.verification?.message.trim()).toBeTruthy();
    expect(Number.isNaN(Date.parse(body.verification?.checkedAt ?? ""))).toBe(false);
    expect(body.verification?.accountLabel).toBeUndefined();
  });
});
});

// Migrated from deployment-tabbar-scroll.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: deployment-tabbar-scroll", () => {
/**
 * @file Regression test for `.tab-bar`'s narrow-viewport overflow bug, found live (owner UI/UX
 * pass on the Deployment panel, 2026-08-15): `.tab-bar` (`components/TabBar.tsx`,
 * `styles.css` ~L1881) is `display: flex` with no wrap and no overflow handling. At 390px — this
 * project's own documented canary width (`.table-scroll`'s comment, `styles.css`) — Deployment's
 * five tabs (Overview/Static Site/Full Site/Dockerfile/History) are wider than the viewport, and
 * with the default `overflow-x: visible` an ancestor still clips the excess (confirmed live:
 * `document.body.scrollWidth` stays exactly 390px, so this is not page-level horizontal scroll
 * escaping anywhere reachable) — "History" is simply unreachable, not just hard to see.
 *
 * `TabBar.tsx` is also used by `Themes.tsx` (Declarative/Static/Templated/Code/Marketplace) and
 * `Pages.tsx` (My Pages/Theme Pages) — confirmed live that Themes' own tab row independently hits
 * the same overflow at 390px (Pages' two short tabs never fill the row, so it never surfaces
 * there). The fix is in the shared `.tab-bar` rule, not a Deployment-only workaround, so this spec
 * pins the fix on BOTH real screens that were confirmed to actually overflow, not just the one
 * that prompted the fix.
 *
 * No `waitForLoadState("networkidle")` anywhere here — confirmed live (project memory) that it
 * never resolves against this admin app. Every wait is an explicit element/state wait instead.
 *
 * 2026-08-16: a SECOND overflow trigger on the same element, found live (owner screenshot) — the
 * `overflow-x: auto` fix above stopped the clip but only traded it for an invisible scrollbar
 * (macOS overlay scrollbars are hidden until actively scrolled), so at a normal DESKTOP viewport
 * with the admin chat pane docked open (`.admin-chat-dock`, `App.tsx`), the narrowed content
 * column reproduces the same "History is unreachable" symptom without ever touching a narrow
 * phone viewport. `.tab-bar` is now `flex-wrap: wrap` instead of `overflow-x: auto` (`styles.css`
 * ~L1921) — no scrollbar to hide, extra tabs just drop to a second line. The "Deployment: tab row
 * stays fully visible with the chat pane open" test below pins this second trigger; the three
 * tests above still pin the original 390px case under the new fix.
 */

const NARROW_VIEWPORT = { width: 390, height: 844 } as const;

/** Scrolls a `.tab-bar` element to its own max scroll position — the same action a user makes by
 *  dragging/swiping the row, done programmatically since Playwright has no native "swipe" input
 *  for a plain scroll container. A no-op on an element that isn't actually scrollable (pre-fix:
 *  `overflow-x: visible` never updates `scrollLeft`), which is exactly the behavior this test
 *  needs to be able to observe as a failure. */
async function scrollTabBarToEnd(page: Page): Promise<void> {
  await page.locator(".tab-bar").first().evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
}

/** True once `tab`'s bounding box sits fully inside the current viewport's horizontal extent —
 *  the real, user-facing definition of "reachable": present in the DOM is not enough if an
 *  ancestor clips it off-screen with no way to scroll it into view. */
async function isFullyOnscreenHorizontally(page: Page, tab: ReturnType<Page["getByRole"]>): Promise<boolean> {
  const box = await tab.boundingBox();
  if (!box) return false;
  const viewport = page.viewportSize();
  if (!viewport) return false;
  return box.x >= 0 && box.x + box.width <= viewport.width;
}

/** Container-relative version of `isFullyOnscreenHorizontally`, needed once `.tab-bar` no longer
 *  spans nearly the full page viewport — which is the case once the chat dock is open at a normal
 *  desktop width (the dock eats ~380px on the right, so the content column, and `.tab-bar` inside
 *  it, is far narrower than `page.viewportSize()`). Checking a tab's bounding box against the full
 *  page viewport in that layout is a false positive: `boundingBox()` reports `getBoundingClientRect()`,
 *  which is unaffected by an ancestor's `overflow: hidden`/`auto` clipping — a tab sitting well past
 *  `.tab-bar`'s own right edge (clipped, unreachable without scrolling) can still measure as "inside
 *  the 1280px page" and pass a page-viewport check that was never meant for this layout. This helper
 *  checks against `.tab-bar`'s OWN rendered box instead, which is what the CSS `overflow`/`clip`
 *  actually clips against. */
async function isFullyWithinTabBarContainer(page: Page, tab: ReturnType<Page["getByRole"]>): Promise<boolean> {
  const containerBox = await page.locator(".tab-bar").first().boundingBox();
  const box = await tab.boundingBox();
  if (!containerBox || !box) return false;
  const EPS = 1; // sub-pixel layout rounding tolerance
  return (
    box.x >= containerBox.x - EPS &&
    box.x + box.width <= containerBox.x + containerBox.width + EPS &&
    box.y >= containerBox.y - EPS &&
    box.y + box.height <= containerBox.y + containerBox.height + EPS
  );
}

test.describe(".tab-bar stays reachable at a 390px viewport (narrow-width regression)", () => {
  test("Deployment: the last tab (History) is reachable and clicking it navigates there", async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize(NARROW_VIEWPORT);
    await page.goto("/admin/deployment", { waitUntil: "domcontentloaded" });
    await page.locator(".tab-bar").first().waitFor({ state: "visible", timeout: 10_000 });

    const tabs = await page.getByRole("tab").allTextContents();
    // e47adfe0b deliberately retired Full Site; keep testing reachability of every live tab.
    expect(tabs).toEqual(["Overview", "Static Site", "Dockerfile", "History"]);

    await scrollTabBarToEnd(page);
    const historyTab = page.getByRole("tab", { name: "History" });
    await expect(historyTab).toBeVisible();
    expect(await isFullyOnscreenHorizontally(page, historyTab)).toBe(true);

    await historyTab.click();
    await expect(page).toHaveURL(/\?tab=history/);
    await expect(historyTab).toHaveAttribute("aria-selected", "true");
  });

  test("Themes: the last tab (Code) is reachable and clicking it activates it — confirms the shared fix doesn't regress this other TabBar consumer", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.setViewportSize(NARROW_VIEWPORT);
    await page.goto("/admin/themes", { waitUntil: "domcontentloaded" });
    await page.locator(".tab-bar").first().waitFor({ state: "visible", timeout: 10_000 });

    await scrollTabBarToEnd(page);
    const codeTab = page.getByRole("tab", { name: /^Code/ });
    await expect(codeTab).toBeVisible();
    expect(await isFullyOnscreenHorizontally(page, codeTab)).toBe(true);

    await codeTab.click();
    await expect(codeTab).toHaveAttribute("aria-selected", "true");
  });

  test("Pages: unaffected at 390px — its two tabs never overflowed, so the fix must not change their layout", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.setViewportSize(NARROW_VIEWPORT);
    await page.goto("/admin/pages", { waitUntil: "domcontentloaded" });
    await page.locator(".tab-bar").first().waitFor({ state: "visible", timeout: 10_000 });

    const bar = page.locator(".tab-bar").first();
    const metrics = await bar.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    // Confirms the premise of this test's own name — if Pages' tabs ever grow to overflow, this
    // assertion (not a silent pass) is what should catch it.
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  });
});

test.describe("Deployment: tab row stays fully visible with the admin chat pane open (2026-08-16 regression)", () => {
  test("all four tabs, including History, are reachable without scrolling once the dock narrows the content column", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    // Real desktop width, not the 390px canary above — same viewport `admin-fab-position.spec.ts`
    // uses for its own docked-chat assertions, since this bug only exists once the dock is open at
    // a normal desktop width, not at any viewport width on its own.
    await page.setViewportSize({ width: 800, height: 768 });
    await page.goto("/admin/deployment", { waitUntil: "domcontentloaded" });
    await page.locator(".tab-bar").first().waitFor({ state: "visible", timeout: 10_000 });

    const bar = page.locator(".tab-bar").first();
    const initialWidth = await bar.evaluate((el) => el.getBoundingClientRect().width);
    await page.locator("button.chat-fab").click();
    const dock = page.locator(".admin-chat-dock");
    await expect(dock).not.toHaveAttribute("hidden", "");
    await expect.poll(() => bar.evaluate((el) => el.getBoundingClientRect().width))
      .toBeLessThan(initialWidth - 1);

    const tabs = await page.getByRole("tab").allTextContents();
    // e47adfe0b deliberately retired Full Site; keep testing reachability of every live tab.
    expect(tabs).toEqual(["Overview", "Static Site", "Dockerfile", "History"]);

    // Deliberately no `scrollTabBarToEnd` call here — the whole point of the reported bug is that
    // a user does not know (and, on macOS, cannot easily tell) there is anything to scroll. If
    // reaching History still requires a manual scroll, the bug is not actually fixed for the person
    // who reported it. `isFullyWithinTabBarContainer`, not `isFullyOnscreenHorizontally`: the page
    // viewport (800px) is much wider than `.tab-bar`'s own content column once the dock is open, so
    // a page-viewport check would pass even while `.tab-bar` itself clips the tab — see that
    // helper's own comment.
    const tabCases = [
      ["Overview", "overview"], ["Static Site", "static-site"],
      ["Dockerfile", "dockerfile"], ["History", "history"],
    ] as const;
    // Measure every tab before any click can auto-scroll a clipped control into view.
    for (const [name] of tabCases) {
      const tab = page.getByRole("tab", { name, exact: true });
      await expect(tab).toBeVisible();
      await expect.poll(() => isFullyWithinTabBarContainer(page, tab), { message: name }).toBe(true);
    }
    for (const [name, id] of tabCases) {
      const tab = page.getByRole("tab", { name, exact: true });
      await tab.click();
      await expect(page).toHaveURL(new RegExp(`\\?tab=${id}(?:&|$)`));
      await expect(tab).toHaveAttribute("aria-selected", "true");
    }
  });
});
});

// Migrated from dockerfile-tab-editable.spec.ts; original pin intent and why comments follow.
// These routes resolve cwd; boot them in a disposable checkout rather than the shared runtime.
test.describe("Bug pin: dockerfile-tab-editable", { tag: "@isolated-site" }, () => {
/**
 * @file Deployment panel → Dockerfile tab, driven through the REAL admin SPA against the REAL Tovu
 * API (`../playwright.dockerfile-tab.config.ts`'s hermetic two-server harness). No route stubbing.
 *
 * This tab used to be a read-only `<pre>` with Copy/Download only — the AI assistant could edit the
 * repo-root Dockerfile via the `deployment_set_dockerfile` agent tool, but a human looking at this
 * exact screen could not. This spec pins the fix at the browser level, which is where it has to be
 * pinned: the admin's editable textarea and the eventual public/build-side consumers of this same
 * file are different code paths, so a passing unit test against a fake port does not by itself prove
 * a real edit typed into a real `<textarea>`, saved through the real `PUT` route, actually lands on
 * disk and survives a reload — this does.
 *
 * ## This test touches the REAL repo-root `Dockerfile` — read this before changing it
 *
 * `dockerfilePath()` (`src/features/deployments/dockerfile.ts`) has no path parameter anywhere in
 * its call chain: it always resolves to `join(process.cwd(), "Dockerfile")`, and this harness's own
 * API server boots with `cwd: REPO_ROOT` (`../playwright.dockerfile-tab.config.ts`), i.e. the actual
 * project root. There is no way to point this suite's write at a scratch copy instead — the route
 * itself doesn't support one. That means every `PUT` this spec issues mutates the SAME `Dockerfile`
 * `docker build` would use for a real image, so `beforeEach` captures its exact current contents via
 * the API before touching anything, and `afterEach` restores that exact snapshot — unconditionally,
 * whether the test passed or failed — then re-reads it back to CONFIRM the restore actually landed
 * rather than trusting a 200 status alone. If `afterEach` ever fails loudly, treat that as "the repo's
 * real Dockerfile may be left in a test state" and check it by hand before doing anything else with
 * it.
 *
 * The edit itself only APPENDS a uniquely-timestamped comment line to the real captured contents
 * (never replaces them wholesale) — even if this suite were interrupted between the edit and the
 * restore (a killed worker, a crashed browser), the on-disk Dockerfile would still be the real,
 * buildable one with one harmless extra comment line, not a fabricated placeholder.
 */

const API_BASE = "/api/admin/v1/workspaces/workspace-local/system/dockerfile";

let originalContents: string | null = null;

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
  const res = await deploymentRequest({ page, url: API_BASE });
  expect(res.ok).toBe(true);
  const body = (await res.json()) as { exists: boolean; contents: string | null };
  // The live repo has a real Dockerfile as of 2026-08-15 (confirmed before writing this suite), so
  // this is the expected shape — asserted rather than assumed, so a future repo state that somehow
  // has none fails loudly here instead of silently skipping the restore check below.
  expect(body.exists).toBe(true);
  originalContents = body.contents;
});

test.afterEach(async ({ page }) => {
  if (originalContents === null) return;
  const current = await deploymentRequest({ page, url: API_BASE });
  expect(current.ok).toBe(true);
  // The real write route requires optimistic concurrency, including cleanup writes. Its ETag and
  // If-Match travel ONLY as headers (dockerfile-source.ts); a body `ifMatch` is ignored and the
  // PUT is refused with 400 for the missing header.
  const etag = current.headers.get("etag");
  expect(etag, "GET system/dockerfile carries an ETag header").toBeTruthy();
  const restore = await deploymentRequest({ page, url: API_BASE, method: "PUT", data: { contents: originalContents } }, { headers: { "If-Match": etag! } });
  expect(restore.ok, `Dockerfile restore: ${restore.status}`).toBe(true);
  // Don't just trust the 200 — read it back and confirm the bytes on disk actually match again.
  const check = await deploymentRequest({ page, url: API_BASE });
  const body = (await check.json()) as { contents: string | null };
  expect(body.contents).toBe(originalContents);
});

test.describe("Dockerfile tab is editable", () => {
  test("editing and saving a real change persists across reload, and the Unsaved-changes pill tracks it correctly", async ({
    page,
  }) => {
    await page.goto("/admin/deployment?tab=dockerfile", { waitUntil: "domcontentloaded" });

    const textarea = page.getByRole("textbox", { name: "Dockerfile contents" });
    await textarea.waitFor({ state: "visible", timeout: 10_000 });
    await expect(textarea).toHaveValue(originalContents ?? "");
    await expect(page.getByText("Unsaved changes")).not.toBeVisible();

    const marker = `\n# e2e-marker ${Date.now()} — dockerfile-tab-editable.spec.ts\n`;
    const editedContents = `${originalContents ?? ""}${marker}`;
    await textarea.fill(editedContents);

    // Editing marks it dirty — the pill is the operator's only on-screen warning that closing the
    // tab right now would lose this edit (the `beforeunload` guard fires on the SAME condition).
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    await page.getByRole("button", { name: "Save" }).click();

    // Success is visible two ways: the transient "Saved" confirmation, and the pill going away.
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(page.getByText("Unsaved changes")).not.toBeVisible();
    await expect(textarea).toHaveValue(editedContents);

    // The real proof of persistence: reload triggers a fresh GET from the server (not a cache), and
    // the marker line must still be there — this is what would fail if `save()` only updated local
    // React state without the `PUT` actually landing.
    await page.reload({ waitUntil: "domcontentloaded" });
    const reloadedTextarea = page.getByRole("textbox", { name: "Dockerfile contents" });
    await reloadedTextarea.waitFor({ state: "visible", timeout: 10_000 });
    await expect(reloadedTextarea).toHaveValue(editedContents);
    await expect(page.getByText("Unsaved changes")).not.toBeVisible();
  });
});
});

// Migrated from static-site-tab-credentials.spec.ts; original pin intent and why comments follow.
// hosted-api-only is read during composition/import, so this pin requires its own boot env.
test.describe("Bug pin: static-site-tab-credentials", { tag: "@isolated-site" }, () => {
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

/** Scope to the selected host's credential step, excluding the provider picker and target fields. */
// 571852cf4 / 57bb8d261 intentionally replaced four simultaneous credential rows with
// one selected-provider step. 174eacfcc / 10b506279 use the host descriptor's own field labels.
function credentialRow(page: Page, providerLabel: string) {
  const ids: Record<string, string> = { "GitHub Pages": "github-pages", Vercel: "vercel", Netlify: "netlify", "Cloudflare Pages": "cloudflare-pages" };
  return page.locator(`[data-agent-element="deployment-static-site-credentials-row-${ids[providerLabel]}"]`);
}

test.describe("Static Site tab — credentials, hosted-api-only disclosure", () => {
  test("shows the plain-language hosted notice OPEN, never the collapsed self-hosted Advanced disclosure", async ({ page }) => {
    await expect(
      page.getByText(
        "This workspace can't use your computer's terminal — connecting here is the only way to publish."
      )
    ).toBeVisible();
    await expect(page.getByText("Advanced: publish with server-side provider credentials")).toHaveCount(0);
    // Each host exposes its credential step when selected; hosted mode needs no Advanced disclosure.
    await expect(page.getByRole("button", { name: "Add credential" })).toHaveCount(0);
    for (const provider of ["GitHub Pages", "Vercel", "Netlify", "Cloudflare Pages"]) {
      await page.getByRole("tab", { name: new RegExp(`^${provider}`) }).click();
      const row = credentialRow(page, provider);
      await expect(row).toBeVisible();
      await expect(row.getByRole("heading", { name: `Connect ${provider}` })).toBeVisible();
      await expect(page.locator('[data-agent-element^="deployment-static-site-credentials-row-"]')).toHaveCount(1);
    }
  });
});

test.describe("Static Site tab — credentials, real CRUD round trip", () => {
  test("save, reload, then replace the token — every step through a real route, no label ever typed", async ({ page }) => {
    await page.getByRole("tab", { name: /^Vercel/ }).click();
    const row = credentialRow(page, "Vercel");

    // The token box starts visibly empty — no placeholder standing in for a value.
    await expect(row.getByLabel("Access token")).toHaveValue("");
    await expect(row.getByLabel("Access token")).not.toHaveAttribute("placeholder");
    await expect(row.getByRole("button", { name: "Save" })).toBeDisabled();

    await row.getByLabel("Access token").fill("fake-vercel-token-for-e2e");
    await expect(row.getByRole("button", { name: "Save" })).toBeEnabled();
    await row.getByRole("button", { name: "Save" }).click();

    await expect(row.locator("summary .deployment-step-summary-text")).toBeVisible({ timeout: 10_000 });
    await expect(row.locator("summary .deployment-step-summary-text")).toContainText("Vercel connected");
    await row.locator("summary").click();
    // The token box clears back to empty once saved — it is never re-shown, even right after saving.
    await expect(row.getByLabel("Access token")).toHaveValue("");

    // A real page reload re-reads the real `GET .../system/publish/credentials` route — proves the
    // row is a real database write, not local-only optimistic state that would vanish on reload.
    await page.reload({ waitUntil: "domcontentloaded" });
    // Provider selection is local UI state: a reload returns to the default GitHub tab.
    await page.getByRole("tab", { name: /^Vercel/ }).click();
    await expect(credentialRow(page, "Vercel").locator("summary .deployment-step-summary-text")).toBeVisible({ timeout: 10_000 });

    // Replace: type a brand-new token into the already-connected row. This exercises the real PUT
    // route (an update, not a second create) — the row stays exactly one row, never a duplicate.
    const reconnectedRow = credentialRow(page, "Vercel");
    await reconnectedRow.locator("summary").click();
    await expect(reconnectedRow.getByText(/Leave blank to keep the current token/)).toBeVisible();
    await reconnectedRow.getByLabel("Access token").fill("a-replaced-fake-token-for-e2e");
    const replaced = page.waitForResponse((response) =>
      response.request().method() === "PUT" && /\/system\/publish\/credentials\/[^/?]+$/.test(new URL(response.url()).pathname));
    await reconnectedRow.getByRole("button", { name: "Save" }).click();
    expect((await replaced).ok(), "replacement must persist through the real PUT route").toBe(true);
    await expect(reconnectedRow.getByLabel("Access token")).toHaveValue("");
    await expect(reconnectedRow.locator("summary .deployment-step-summary-text")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-agent-element^="deployment-static-site-credentials-row-"]')).toHaveCount(1); // one selected row, never a duplicate
  });

  test("github-pages needs only a token — no label, no owner/repo on this row", async ({ page }) => {
    // Owner/repo live on the publish TARGET config (chosen per run in the section below this one),
    // never on the saved credential — see `rules.ts`'s `PUBLISH_CREDENTIAL_PROVIDERS` doc
    // (`requiredFields: []` for every provider except cloudflare-pages). A github-pages credential
    // is a bare token.
    await page.getByRole("tab", { name: /^GitHub Pages/ }).click();
    const row = credentialRow(page, "GitHub Pages");
    await expect(row.getByRole("button", { name: "Save" })).toBeDisabled();
    await expect(page.getByLabel("Label")).toHaveCount(0);
    await expect(page.getByLabel("Provider")).toHaveCount(0);

    await row.getByLabel("Personal access token").fill("fake-gh-token-for-e2e");
    await expect(row.getByRole("button", { name: "Save" })).toBeEnabled();
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.locator("summary .deployment-step-summary-text")).toBeVisible({ timeout: 10_000 });
  });

  test("cloudflare-pages requires BOTH a token and an Account ID before Save enables", async ({ page }) => {
    await page.getByRole("tab", { name: /^Cloudflare Pages/ }).click();
    const row = credentialRow(page, "Cloudflare Pages");
    await expect(row.getByRole("button", { name: "Save" })).toBeDisabled();

    await row.getByLabel("API token", { exact: true }).fill("fake-cf-token-for-e2e");
    await expect(row.getByRole("button", { name: "Save" })).toBeDisabled(); // account id still blank

    await row.getByLabel("Account ID").fill("acct-e2e-123");
    await expect(row.getByRole("button", { name: "Save" })).toBeEnabled();
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.locator("summary .deployment-step-summary-text")).toBeVisible({ timeout: 10_000 });
  });
});
});

// Migrated from static-site-tab.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: static-site-tab", () => {
/**
 * @file Deployment panel → Static Site tab, driven through the REAL admin SPA against the REAL Tovu
 * API (`../playwright.static-site-tab.config.ts`'s hermetic two-server harness, `TOVU_DB=memory`).
 * No route stubbing.
 *
 * This tab's "Build static export" button used to be permanently `aria-disabled`, with no
 * `onClick` at all — the exporter existed (`tovu export <dir>` from a terminal) but no admin route
 * could start one. This spec pins the fix at the browser level: a real click, through the real
 * `POST`/`GET .../system/export` routes, producing a real folder of files on disk (into
 * `TOVU_EXPORT_DIR`, a scratch temp dir this suite's own config points at — never this repo's own
 * `infra/export`). A passing unit test against a fake port does not by itself prove a real click
 * reaches a real route and a real export actually runs; this does.
 *
 * It also pins the "Getting it online" card's provider split: switching the picker between GitHub
 * Pages and Vercel must show ONE provider's CLI row and form at a time, never both, and the CLI
 * row's detected/not-detected pill must reflect the REAL `deployClis` the server computed (this
 * suite's config prepends a fake `gh` onto the API server's own `PATH`, so `gh` reports installed
 * for real over the HTTP route — see that config's own header for the exact mechanism and its one
 * documented caveat).
 *
 * `vercel`'s own pill is asserted ADAPTIVELY, not hardcoded to "not detected" — {@link
 * fetchDeployClis} reads the SAME live `deployClis` the UI itself is fetching, over the same
 * authenticated route, and the assertion below matches whatever that says. Confirmed necessary, not
 * theoretical: an earlier draft of this spec hardcoded "not detected" and failed on the machine this
 * suite was written on, because that machine has a REAL `vercel` CLI on its own PATH — the exact
 * "real system PATH may already have vercel" caveat `../playwright.static-site-tab.config.ts`'s own
 * header warns about. Asserting against the live route instead of a guess is what makes this
 * portable across whatever the runner's own PATH actually contains.
 *
 * ## This suite never reaches the real internet
 *
 * `GITHUB_TOKEN`/`VERCEL_TOKEN` are explicitly blanked for this harness's API server, including
 * credentials inherited from the runner. `publishStaticSite` (`static-publish/
 * adapter.ts`) resolves credentials BEFORE ever constructing a real GitHub/Vercel API client, so a
 * triggered publish with no token configured returns `NO_CREDENTIALS_CONFIGURED` and settles WITHOUT
 * any outbound call — the exact same guarantee `publish-site-route.test.ts` already proves
 * server-side. This spec exercises a real Publish click for the Vercel target (no owner/repo
 * needed) specifically BECAUSE that failure mode is structurally incapable of leaving this process,
 * and asserts the honest error the UI shows once it settles.
 */

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
});

/** Reads the SAME `deployClis` the admin UI itself fetches from `GET .../system/deployment-
 *  overview`, through the browser-session transport (carries the Secure cookie from login) — see this
 *  file's own header for why the Vercel assertions below read this instead of assuming an install
 *  state. */

test.describe("Static Site tab — build export", () => {
  test("the Build button starts a real export and the run settles to a real, non-fabricated result", async ({ page }) => {
    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });

    const buildButton = page.getByRole("button", { name: "Build static export" });
    await buildButton.waitFor({ state: "visible", timeout: 10_000 });
    await expect(buildButton).toBeEnabled();

    await buildButton.click();

    // The button reflects the real in-flight state — never a silent no-op.
    await expect(page.getByRole("button", { name: "Exporting…" })).toBeVisible();

    // This fixture must export successfully; a terminal failure is not a working build.
    await expect(page.getByText("Export finished", { exact: true })).toBeVisible({ timeout: 30_000 });
    const status = await deploymentRequest({ page, url: "/api/admin/v1/workspaces/workspace-local/system/export" });
    expect(status.ok).toBe(true);
    const snapshot = await status.json();
    expect(snapshot.status).toBe("completed");
    expect(snapshot.ok).toBe(true);
    expect(snapshot.counts.routesSucceeded).toBeGreaterThan(0);
    expect(snapshot.failedRoutes).toEqual([]);
    expect(fs.readFileSync(path.join(snapshot.outputDir, "index.html"), "utf8")).toMatch(/<html[\s>]/i);
    await expect(page.getByRole("button", { name: "Build static export" })).toBeEnabled();
  });

  test("the overwrite checkbox starts unchecked, matching the exporter's own clean:false default", async ({ page }) => {
    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });
    const checkbox = page.getByRole("checkbox", { name: /overwrite existing files/i });
    await checkbox.waitFor({ state: "visible", timeout: 10_000 });
    await expect(checkbox).not.toBeChecked();
  });

  test("the overwrite checkbox sends clean and controls preservation of existing files", async ({ page }) => {
    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });
    const checkbox = page.getByRole("checkbox", { name: /overwrite existing files/i });
    await expect(checkbox).not.toBeChecked();
    const exportPath = "/api/admin/v1/workspaces/workspace-local/system/export";
    const build = async (clean: boolean) => {
      const trigger = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === exportPath);
      const accepted = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === exportPath);
      await page.getByRole("button", { name: "Build static export" }).click();
      expect((await trigger).postDataJSON().clean).toBe(clean);
      expect((await accepted).status()).toBe(202);
      await expect.poll(async () => {
        const response = await deploymentRequest({ page, url: exportPath });
        expect(response.ok).toBe(true);
        return (await response.json()).status;
      }, { timeout: 30_000 }).toBe("completed");
      const snapshot = await (await deploymentRequest({ page, url: exportPath })).json();
      expect(snapshot.ok).toBe(true);
      await expect(page.getByRole("button", { name: "Build static export" })).toBeEnabled();
      return snapshot.outputDir as string;
    };
    const outputDir = await build(false);
    const sentinel = path.join(outputDir, "e2e-clean-sentinel.txt");
    try {
      fs.writeFileSync(sentinel, "preserve unless overwrite is selected");
      await build(false);
      expect(fs.readFileSync(sentinel, "utf8")).toBe("preserve unless overwrite is selected");
      await checkbox.check();
      await expect(checkbox).toBeChecked();
      await build(true);
      expect(fs.existsSync(sentinel)).toBe(false);
    } finally {
      fs.rmSync(sentinel, { force: true });
    }
  });
});

test.describe("Static Site tab — provider split (GitHub Pages vs Vercel)", () => {
  test("GitHub Pages is the default: shows its descriptor fields, no CLI detection, and no Vercel fields", async ({
    page,
  }) => {
    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("tab", { name: "GitHub Pages" })).toHaveAttribute("aria-selected", "true");
    // fe035388c removed CLI detection from Static Site; publishing uses saved credentials.
    await expect(page.getByText(/^(?:Not )?Detected on this server$/i)).toHaveCount(0);
    await expect(page.getByLabel("Owner")).toBeVisible();
    await expect(page.getByLabel("Repository")).toBeVisible();
    await expect(page.getByLabel("Branch (optional)")).toBeVisible();
    await expect(page.getByLabel(/Team ID/)).toHaveCount(0);
  });

  test("switching to Vercel shows its descriptor fields, no CLI detection, and preserves the GitHub draft", async ({
    page,
  }) => {
    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Owner").fill("octo");
    // fe035388c removed the CLI-first branch and its deployment-overview deployClis field.
    await expect(page.getByText(/^(?:Not )?Detected on this server$/i)).toHaveCount(0);

    await page.getByRole("tab", { name: "Vercel" }).click();

    await expect(page.getByRole("tab", { name: "Vercel" })).toHaveAttribute("aria-selected", "true");
    // Switching providers must not bring the retired CLI-detection row back.
    await expect(page.getByText(/^(?:Not )?Detected on this server$/i)).toHaveCount(0);
    await expect(page.getByLabel(/Team ID/)).toBeVisible();
    await expect(page.getByLabel("Owner")).toHaveCount(0);
    await expect(page.getByLabel("Repository")).toHaveCount(0);

    // Switching back proves the earlier typed value survived — the hook keeps both targets' fields
    // in state at once (see `use-static-publish.hooks.ts`'s own header) rather than discarding one
    // side's work whenever the operator is still deciding between the two.
    await page.getByRole("tab", { name: "GitHub Pages" }).click();
    await expect(page.getByLabel("Owner")).toHaveValue("octo");
  });
});

// Credential absence is a boot contract: the shared file boots under Access Tokens, so it never
// applies this pin's provider-env clearing. Cold sites also keep earlier saved tokens out.
test.describe("Static Site tab — preview and publish, never touching the real internet", { tag: "@isolated-site" }, () => {
  test("Preview reports a real derived base path with no credential configured — a pure read, never starts a run", async ({
    page,
  }) => {
    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Owner").fill("octocat");
    await page.getByLabel("Repository").fill("demo-repo");

    const publishPath = "/api/admin/v1/workspaces/workspace-local/system/publish";
    const before = await deploymentRequest({ page, url: publishPath });
    expect(before.ok).toBe(true);
    const beforeRun = await before.json();
    const triggers: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === publishPath) triggers.push(request.url());
    });
    await page.getByRole("button", { name: "Preview" }).click();

    await expect(page.getByText("/demo-repo", { exact: true })).toBeVisible();
    await expect(page.getByText("Not configured", { exact: true })).toBeVisible();
    // A preview must never start a real run — the Publish button stays enabled-and-idle (never
    // flips to the busy "Publishing…" label a real trigger would show) the whole time.
    await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Publishing…" })).toHaveCount(0);
    const after = await deploymentRequest({ page, url: publishPath });
    expect(after.ok).toBe(true);
    expect(await after.json()).toEqual(beforeRun);
    expect(triggers).toEqual([]);
  });

  test("a real Publish click for Vercel (no token configured) settles honestly to a credential failure — this can never leave the process, see this file's own header", async ({
    page,
  }) => {
    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Vercel" }).click();
    await page.getByLabel("Vercel project name").fill("e2e-demo");

    const publishButton = page.getByRole("button", { name: "Publish" });
    await expect(publishButton).toBeEnabled();
    await publishButton.click();

    await expect(page.getByRole("button", { name: "Publishing…" })).toBeVisible();
    await expect(page.getByText(
      "none of VERCEL_TOKEN, VERCEL_ACCESS_TOKEN is set — publishing to vercel requires a token with write access configured in the server environment (any one of these env vars)",
      { exact: true },
    )).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Publish" })).toBeEnabled();
    // Never a live link on a failed publish.
    await expect(page.getByRole("link", { name: /vercel\.app/ })).toHaveCount(0);
  });
});
});
