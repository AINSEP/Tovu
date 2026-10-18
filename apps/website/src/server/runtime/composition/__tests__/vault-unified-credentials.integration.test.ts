import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import { SecretsVaultService, buildVaultAad } from "@jini-ai/platform/secrets/credential-sets";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { vaultFixture, vaultStep, stamp } from "#src/platform/db/migrations/__tests__/secrets-vault.fixture";
import { unifyVaultCredentials } from "#src/platform/db/migrations/0013_unify_vault_credentials";
import { createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";
import { CustomCredentialVaultRepo } from "#src/features/custom-credentials/vault-repo";
import { VendorCredentialSetVaultRepo } from "#src/features/vendor-credentials/vault-adapter";
import { resolveCustomCredentialByLabel, updateCustomCredential } from "#src/features/custom-credentials/store";
import { normalizeVaultAtBoot } from "../vault-boot.js";
import { recoveryAad } from "../site-key-recovery.js";

// Rollout regression: 0013 is deliberately not registered. Both the 0012 legacy lineage and
// already-normalized vault envelopes must boot/read before any site activates unification.
for (const dialect of ["sqlite", "pglite"] as const) for (const normalized of [false, true]) {
  test(`${dialect}: unmigrated ${normalized ? "normalized" : "0012-only"} custom/vendor rows boot with read defaults`, { timeout: 30_000 }, async () => {
    const f = await vaultFixture(dialect);
    try {
      await f.kernel.transaction(() => vaultStep.up(f.kernel, { note: () => {} }));
      // Remove referencing fixture servers before trimming the vault; keep the real RESTRICT FKs.
      await f.kernel.execute(sql`DELETE FROM external_mcp_servers`);
      await f.kernel.execute(sql`DELETE FROM secrets_vault WHERE workspace_id<>'ws' OR id NOT IN ('custom','collision')`);
      const repo = new SqlSecretsVaultRepo({ kernel: f.kernel as StorageKernel<SecretsVaultDatabase> });
      if (normalized) {
        for (const id of ["custom", "collision"]) {
          const row = (await repo.find({ workspaceId: "ws", id }))!;
          const meta = id === "custom" ? { category: "general", baseUrl: "https://api.example.test", additionalHosts: [], username: null } : { accountLabel: "vendor-account" };
          const sealed = await f.sealer.seal({ key: await f.keyring.activeKey({}), aad: buildVaultAad(row), plaintext: JSON.stringify({ token: "synthetic-unmigrated-token" }) });
          await f.kernel.execute(sql`UPDATE secrets_vault SET meta=${JSON.stringify(meta)},sealed_key_id=${sealed.keyId},sealed_ciphertext=${sealed.ciphertext},sealed_nonce=${sealed.nonce},sealed_alg=${sealed.alg}
            WHERE workspace_id='ws' AND id=${id}`);
        }
      }
      const before = await repo.list({ workspaceId: "ws", kind: "custom", ownerKey: "tovu", principalId: null });
      assert.equal(before.length, 1);
      assert.equal(before[0]!.meta.credentialType, undefined);
      assert.equal((await repo.find({ workspaceId: "ws", id: "collision" }))!.meta.worksFor, undefined);
      const snapshot = await f.kernel.query(sql`SELECT * FROM secrets_vault ORDER BY id`);
      const registry = createTovuVaultKinds({ policy: {
        validateMeta: ({ meta }) => meta, tokenField: () => "token", legacyPublishCredential: () => undefined,
      } });
      let reseals = 0;
      const report = await normalizeVaultAtBoot({ ...f, sealer: {
        open: (input, options) => f.sealer.open(input, options),
        seal: input => { reseals += 1; return f.sealer.seal(input); },
      }, siteId: `unmigrated-${dialect}-${normalized}`, workspaceId: "ws", clock: { nowMs: () => Date.parse(stamp) }, registry });
      assert.equal(report.green, true);
      assert.deepEqual(report.flagged, []);
      assert.equal(report.kinds.custom.rows, 1);
      assert.equal(report.kinds.vendor.rows, 1);
      assert.equal(reseals, normalized ? 0 : 2);
      if (normalized) assert.deepEqual(await f.kernel.query(sql`SELECT * FROM secrets_vault ORDER BY id`), snapshot);
      const service = new SecretsVaultService({ repo, keyring: f.keyring, sealer: f.sealer, metaParsers: registry.metaParsers,
        authorize: async () => {}, now: () => stamp, newId: () => "unused" });
      for (const [id, kind, worksFor] of [["custom", "custom", []], ["collision", "vendor", ["vendor-test"]]] as const) {
        const row = (await repo.find({ workspaceId: "ws", id }))!;
        assert.equal(row.kind, kind);
        assert.equal(row.meta.legacyAad, undefined);
        const read = (await service.get(row))!;
        assert.equal(read.summary.meta.credentialType, kind);
        assert.deepEqual(read.summary.meta.worksFor, worksFor);
        assert.equal(read.payload!.token, normalized ? "synthetic-unmigrated-token" : "long-token-1234567890");
      }
      const customRepo = new CustomCredentialVaultRepo({ vault: repo });
      const vendors = new VendorCredentialSetVaultRepo({ vault: repo, kind: "vendor", vendor: true });
      assert.deepEqual((await vendors.findById({ workspaceId: "ws", id: "collision" }))!.worksFor, ["vendor-test"]);
      assert.deepEqual((await customRepo.listByWorkspace({ workspaceId: "ws" }))[0]!.worksFor, []);
      const customBefore = (await repo.find({ workspaceId: "ws", id: "custom" }))!;
      await updateCustomCredential({ repo: customRepo, keyring: f.keyring, sealer: f.sealer, clock: { nowMs: () => Date.parse(stamp) }, idGen: { newId: () => "unused" } },
        { workspaceId: "ws", id: "custom", label: "Still custom" });
      const customAfter = (await repo.find({ workspaceId: "ws", id: "custom" }))!;
      assert.equal(customAfter.kind, "custom");
      assert.deepEqual(customAfter.sealed, customBefore.sealed);
      assert.equal((await resolveCustomCredentialByLabel({ repo: customRepo, sealer: f.sealer }, { workspaceId: "ws", label: "Still custom" }))!.connection.token,
        normalized ? "synthetic-unmigrated-token" : "long-token-1234567890");
    } finally { await f.kernel.close(); }
  });
}

for (const dialect of ["sqlite", "pglite"] as const) for (const normalized of [false, true]) {
  test(`${dialect}: ${normalized ? "former custom-kind vault" : "pre-vault custom"} AAD reseals and opens through ordinary service and recovery`, async () => {
    const f = await vaultFixture(dialect);
    try {
      await f.kernel.transaction(() => vaultStep.up(f.kernel, { note: () => {} }));
      const repo = new SqlSecretsVaultRepo({ kernel: f.kernel as StorageKernel<SecretsVaultDatabase> });
      if (normalized) {
        const old = (await repo.find({ workspaceId: "ws", id: "custom" }))!;
        const sealed = await f.sealer.seal({ key: await f.keyring.activeKey({}), aad: buildVaultAad(old), plaintext: JSON.stringify({ token: "synthetic-normalized-key" }) });
        await f.kernel.execute(sql`UPDATE secrets_vault SET meta=${JSON.stringify({ category: "general", baseUrl: "https://api.example.test", additionalHosts: [], username: null })},sealed_key_id=${sealed.keyId},sealed_ciphertext=${sealed.ciphertext},sealed_nonce=${sealed.nonce},sealed_alg=${sealed.alg} WHERE id='custom' AND workspace_id='ws'`);
      }
      await f.kernel.transaction(() => unifyVaultCredentials({ checksum: "b".repeat(64) }).up(f.kernel, { note: () => {} }));
      const before = (await repo.find({ workspaceId: "ws", id: "custom" }))!;
      assert.equal(before.kind, "vendor");
      assert.equal(before.meta.credentialType, "custom");
      assert.ok(await f.sealer.open({ sealed: before.sealed! }, { aad: recoveryAad({ record: before }) }));
      const registry = createTovuVaultKinds({ policy: {
        validateMeta: ({ meta }) => meta, tokenField: () => "token",
        legacyPublishCredential: () => ({ vendorId: "vendor-test", tokenField: "token" }),
      } });
      const report = await normalizeVaultAtBoot({ ...f, siteId: `unified-${dialect}-${normalized}`, workspaceId: "ws", clock: { nowMs: () => Date.parse(stamp) }, registry });
      assert.equal(report.green, true);
      const after = (await repo.find({ workspaceId: "ws", id: "custom" }))!;
      assert.equal(after.meta.legacyAad, undefined);
      assert.deepEqual(after.meta.worksFor, []);
      assert.equal(after.revision, before.revision + 1);
      assert.notDeepEqual(after.sealed, before.sealed);
      const service = new SecretsVaultService({ repo, keyring: f.keyring, sealer: f.sealer, metaParsers: registry.metaParsers, authorize: async () => {}, now: () => stamp, newId: () => "unused" });
      assert.deepEqual((await service.get(after))!.payload, { token: normalized ? "synthetic-normalized-key" : "long-token-1234567890" });
      await assert.rejects(f.sealer.open({ sealed: after.sealed! }, { aad: recoveryAad({ record: before }) }));
    } finally { await f.kernel.close(); }
  });
}
