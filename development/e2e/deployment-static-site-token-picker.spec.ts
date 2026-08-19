import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

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

    // First save for this provider auto-defaults server-side (`publish-credentials/store.ts`'s
    // `decideCreateDefault`) — no `isDefault` sent, matching how the flat credential row itself never
    // sends one on a provider's first-ever save (`use-publish-credentials.hooks.ts`'s own `save` doc).
    const primaryRes = await page.request.post(CREDENTIALS_PATH, {
      data: { label: "primary", connection: { providerId: "github-pages", token: "ghp_synthetic_primary_0000000000" } },
    });
    expect(primaryRes.ok(), `seeding the primary credential failed: ${primaryRes.status()} ${await primaryRes.text()}`).toBe(true);
    const { credential: primary } = (await primaryRes.json()) as { credential: { id: string; isDefault: boolean } };
    expect(primary.isDefault).toBe(true);

    // A second saved connection for the SAME provider, a different label (the server's own
    // `(workspace_id, provider_id, label)` UNIQUE constraint requires it) — deliberately not sent as
    // default, so it lands `isDefault: false` and the picker has something real to switch AWAY from.
    const backupRes = await page.request.post(CREDENTIALS_PATH, {
      data: { label: "backup", connection: { providerId: "github-pages", token: "ghp_synthetic_backup_1111111111" } },
    });
    expect(backupRes.ok(), `seeding the backup credential failed: ${backupRes.status()} ${await backupRes.text()}`).toBe(true);
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
    await expect(picker.locator("option")).toHaveCount(2);
    await expect(picker).toHaveValue(primary.id); // starts on the current DEFAULT, not an arbitrary row.

    await picker.selectOption(backup.id);

    // The write this selection triggers: `selectCredential` PUTs `isDefault: true` to the chosen id,
    // then refetches — proven against the SERVER's own state, not just the `<select>`'s own DOM value
    // (a stale/optimistic-only UI could pass a DOM-only assertion here without ever having written
    // anything real).
    await expect(async () => {
      const listRes = await page.request.get(CREDENTIALS_PATH);
      expect(listRes.ok()).toBe(true);
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

    const createRes = await page.request.post(CREDENTIALS_PATH, {
      data: { label: "default", connection: { providerId: "vercel", token: "vercel_synthetic_token_0000000000" } },
    });
    expect(createRes.ok()).toBe(true);

    await page.goto("/admin/deployment?tab=static-site", { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Vercel" }).click();
    await expect(page.getByText(/token stored, encrypted/i)).toBeVisible();

    await page.locator("summary.deployment-step-summary").first().click();
    await expect(page.getByLabel(/which saved token publishes/i)).toHaveCount(0);
  });
});
