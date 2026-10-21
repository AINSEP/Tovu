/** Regression: saving plugin state on a fresh workspace, then booting and rebuilding consumers,
 * leaves the Connections surface disconnected and the sealed setting intact. Real vault SQL/GCM.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { sql } from "kysely";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { vaultFixture, vaultStep, insertFixture, stamp } from "#src/platform/db/migrations/__tests__/secrets-vault.fixture";
import { vaultApiConnectionKind } from "#src/platform/db/migrations/0020_vault_api_connection_kind";
import { createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";
// why: `#src/*` maps to a file, not a directory index; app.ts imports the same barrel this way.
import { InMemoryCustomCredentialSetRepo } from "#src/features/custom-credentials/index";
import { createApiConnectionHost } from "#src/features/api-connections/host";
import { createSurfaceConnections } from "#src/features/api-connections/surface-connections";
import { loadPluginContributionsFromSource } from "#src/features/agent-plugins/lifecycle";
import { ACME_FIXTURE_ROOT, ACME_PLUGIN, startAcmeHarness, type AcmeHarness } from "#src/features/api-connections/__tests__/support/acme-harness";
import { normalizeVaultAtBoot } from "../vault-boot.js";

let harness: AcmeHarness;
before(async () => { harness = await startAcmeHarness(); });
after(async () => { await harness.close(); });

for (const dialect of ["sqlite", "pglite"] as const) {
  test(`${dialect}: plugin settings survive restart and the connection surface stays disconnected`, async () => {
    const fixture = await vaultFixture(dialect);
    const { kernel, keyring, sealer } = fixture;
    try {
      await kernel.transaction(() => vaultStep.up(kernel, { note: () => {} }));
      await kernel.transaction(() => vaultApiConnectionKind({ checksum: "c".repeat(64) }).up(kernel, { note: () => {} }));
      const workspaceId = "ws-fresh-plugin-state";
      await insertFixture(kernel, "workspaces", { id: workspaceId, name: "Fresh", slug: workspaceId, created_at: stamp });
      const repo = new SqlSecretsVaultRepo({ kernel: kernel as StorageKernel<SecretsVaultDatabase> });
      const clock = { nowMs: () => Date.parse(stamp) };
      const makeHost = () => createApiConnectionHost({
        workspaceId, vaultRepo: repo, keyring, sealer, clock, runtime: "hosted", env: harness.env,
        publicOrigin: () => "https://site.test", oauthHttp: harness.oauthHttp, pluginHttp: harness.pluginHttp,
        customCredentialRepo: new InMemoryCustomCredentialSetRepo(),
        loadContributions: input => loadPluginContributionsFromSource({
          plugin: { pluginId: ACME_PLUGIN, packageRoot: ACME_FIXTURE_ROOT }, definition: input.definition,
        }),
      });
      const scope = { workspaceId, pluginId: ACME_PLUGIN };
      await makeHost().pluginState.forPlugin(scope).set({ key: "products", value: ["files"] });
      const before = await kernel.query(sql`SELECT * FROM secrets_vault WHERE workspace_id=${workspaceId} ORDER BY id`);
      assert.equal(before.length, 1, "the fresh workspace has only a plugin-state row and no OAuth credential");
      const registry = createTovuVaultKinds({ policy: {
        validateMeta: ({ meta }) => meta, legacyPublishCredential: () => undefined, tokenField: () => undefined,
      } });
      for (let restart = 0; restart < 2; restart += 1) {
        const report = await normalizeVaultAtBoot({ kernel, workspaceId, siteId: workspaceId, clock, keyring, sealer, registry });
        assert.equal(report.green, true);
        assert.deepEqual(report.flagged, []);
        const host = makeHost();
        assert.deepEqual(await host.pluginState.readerFor(scope).get({ key: "products" }), ["files"]);
        const surface = createSurfaceConnections({ host, ...scope, principalId: "admin-1" });
        const status = await surface.status({ connectionId: "account" });
        assert.equal(status.status, "disconnected");
        assert.equal(status.accountLabel, null);
        assert.deepEqual(await kernel.query(sql`SELECT * FROM secrets_vault WHERE workspace_id=${workspaceId} ORDER BY id`), before);
      }
      const original = (await repo.find({ workspaceId, id: `plugin-state:${ACME_PLUGIN}:products` }))!;
      await repo.put({ expectedRevision: original.revision, record: { ...original, revision: original.revision + 1,
        meta: { ...original.meta, normalization: ["conflict"] } } });
      const report = await normalizeVaultAtBoot({ kernel, workspaceId, siteId: workspaceId, clock, keyring, sealer, registry });
      assert.equal(report.green, false, "a malformed annotation must be validated before it can be cleared");
      assert.deepEqual(report.flagged, [{ id: original.id, kind: "api-connection", reason: "invalid-meta" }]);
      const flagged = (await repo.find(original))!;
      assert.deepEqual(flagged.sealed, original.sealed);
      assert.deepEqual(await makeHost().pluginState.readerFor(scope).get({ key: "products" }), ["files"]);
      assert.equal((await normalizeVaultAtBoot({ kernel, workspaceId, siteId: workspaceId, clock, keyring, sealer, registry })).green, true);
    } finally { await kernel.close(); }
  });
}
