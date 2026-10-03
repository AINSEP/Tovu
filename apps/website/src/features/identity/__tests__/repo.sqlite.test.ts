import assert from "node:assert/strict";
import test from "node:test";

import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteApiKeyRepo } from "../repo.sqlite.js";

for (const mode of ["handle", "kernel"] as const) {
  test(`SQLite API keys use the supplied ${mode} for reads, updates and workspace isolation`, async (t) => {
    const db = openContentDb(":memory:");
    t.after(() => db.$client.close());
    const kernel = contentKernel(db);
    await kernel.run(async (q) => {
      await q.insertInto("workspaces").values({ id: "ws-a", name: "Site", slug: "site", created_at: "2026-10-01T12:00:00Z" }).execute();
      await q.insertInto("principals").values({ id: "machine-a", workspace_id: "ws-a", kind: "api_key", display_name: "Build machine", status: "active", created_at: "2026-10-01T12:00:00Z" }).execute();
      await q.insertInto("policies").values({ id: "snapshot-a", workspace_id: "ws-a", name: "Snapshot", is_builtin: 0, is_frozen: 1 }).execute();
    });
    const repo = new SqliteApiKeyRepo(mode === "handle" ? db : kernel);
    const key = { id: "key-a", workspaceId: "ws-a", principalId: "machine-a", label: "Build", keyHash: "hash-secret", prefix: "tovu_ak_0123456789ab", issuedPolicyId: "snapshot-a", expiresAt: "2026-10-02T12:00:00Z", createdAt: "2026-10-01T12:00:00Z" };
    await repo.save(key);
    // F2.6/F6.3: independent SQL read proves this wrapper writes into the caller's database.
    assert.deepEqual(await kernel.run((q) => q.selectFrom("api_keys").selectAll().execute()), [{
      id: "key-a", workspace_id: "ws-a", principal_id: "machine-a", label: "Build", key_hash: "hash-secret", prefix: "tovu_ak_0123456789ab", issued_policy_id: "snapshot-a", revoked_at: null, expires_at: "2026-10-02T12:00:00Z", created_at: "2026-10-01T12:00:00Z", last_used_at: null,
    }]);
    assert.deepEqual(await repo.findByPrefix({ workspaceId: "ws-a", prefix: key.prefix }), { ...key, revokedAt: undefined, lastUsedAt: undefined });
    assert.equal(await repo.findByPrefix({ workspaceId: "ws-other", prefix: key.prefix }), null);
    const updated = { ...key, revokedAt: "2026-10-01T13:00:00Z", lastUsedAt: "2026-10-01T12:30:00Z" };
    await repo.save(updated);
    assert.deepEqual(await repo.findById({ workspaceId: "ws-a", id: "key-a" }), updated);
    assert.deepEqual(await repo.listByPrincipalId({ workspaceId: "ws-a", principalId: "machine-a" }), [updated]);
    assert.equal(await repo.findById({ workspaceId: "ws-other", id: "key-a" }), null);
  });
}
