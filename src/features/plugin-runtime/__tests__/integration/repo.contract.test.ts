import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "#src/db/sqlite/content-db";
import { InMemoryPluginActivationRepo } from "../../repo.memory.js";
import { SqlitePluginActivationRepo } from "../../repo.sqlite.js";
import type { PluginActivationRecord, PluginActivationRepoPort } from "../../activation.js";

/**
 * @file C-013 shared contract-test suite for `PluginActivationRepoPort`, run against both
 * `repo.memory.ts` and `repo.sqlite.ts` — mirrors `src/widgets/__tests__/repo.contract.test.ts`'s
 * shape (that file's own header cites the same convention, itself following
 * `src/identity/__tests__/repo.contract.test.ts`). REQ-07; INV-05.
 *
 * TDD-certified against the stubs in `../../repo.memory.ts` / `../../repo.sqlite.ts`; currently
 * RED — every method throws "not implemented". These assertions describe the contract the
 * Programmer stage must satisfy for BOTH adapters identically.
 */

const WS = "workspace-1";
const WS2 = "workspace-2";

function record(overrides: Partial<PluginActivationRecord> = {}): PluginActivationRecord {
  return {
    pluginId: "word-count",
    workspaceId: WS,
    version: "1.0.0",
    enabled: true,
    updatedAt: "2026-07-28T00:00:00.000Z",
    ...overrides,
  };
}

function runSuite(adapterName: string, makeRepo: () => PluginActivationRepoPort) {
  test(`[${adapterName}] save() then getActivation() round-trips the record`, async () => {
    const repo = makeRepo();
    await repo.save(record());
    const found = await repo.getActivation({ workspaceId: WS, pluginId: "word-count" });
    assert.deepEqual(found, record());
  });

  test(`[${adapterName}] getActivation() returns null for a never-enabled plugin (behavior.spec.md §10 default)`, async () => {
    const repo = makeRepo();
    const found = await repo.getActivation({ workspaceId: WS, pluginId: "never-touched" });
    assert.equal(found, null);
  });

  test(`[${adapterName}] save() upserts — a second save for the same (workspaceId, pluginId) replaces, not duplicates, the row`, async () => {
    const repo = makeRepo();
    await repo.save(record({ enabled: true, updatedAt: "2026-07-28T00:00:00.000Z" }));
    await repo.save(record({ enabled: false, updatedAt: "2026-07-28T01:00:00.000Z" }));

    const found = await repo.getActivation({ workspaceId: WS, pluginId: "word-count" });
    assert.equal(found?.enabled, false);
    assert.equal(found?.updatedAt, "2026-07-28T01:00:00.000Z");

    const all = await repo.listAll();
    assert.equal(all.filter((r) => r.workspaceId === WS && r.pluginId === "word-count").length, 1);
  });

  test(`[${adapterName}] deleteActivation() removes only the requested activation`, async () => {
    const repo = makeRepo();
    await repo.save(record({ workspaceId: WS, pluginId: "word-count" }));
    await repo.save(record({ workspaceId: WS2, pluginId: "word-count" }));

    await repo.deleteActivation({ workspaceId: WS, pluginId: "word-count" });

    assert.equal(await repo.getActivation({ workspaceId: WS, pluginId: "word-count" }), null);
    assert.notEqual(await repo.getActivation({ workspaceId: WS2, pluginId: "word-count" }), null);
  });

  test(`[${adapterName}] activation state is scoped per workspace — the same pluginId in two workspaces are independent rows`, async () => {
    const repo = makeRepo();
    await repo.save(record({ workspaceId: WS, enabled: true }));
    await repo.save(record({ workspaceId: WS2, enabled: false }));

    assert.equal((await repo.getActivation({ workspaceId: WS, pluginId: "word-count" }))?.enabled, true);
    assert.equal((await repo.getActivation({ workspaceId: WS2, pluginId: "word-count" }))?.enabled, false);
  });

  test(`[${adapterName}] listAll() returns every row across every workspace`, async () => {
    const repo = makeRepo();
    await repo.save(record({ workspaceId: WS, pluginId: "word-count" }));
    await repo.save(record({ workspaceId: WS2, pluginId: "other-plugin" }));

    const all = await repo.listAll();
    assert.equal(all.length, 2);
    assert.deepEqual(
      all.map((r) => `${r.workspaceId}:${r.pluginId}`).sort(),
      [`${WS}:word-count`, `${WS2}:other-plugin`]
    );
  });

  test(`[${adapterName}] quarantine metadata round-trips durably and an ordinary activation save clears it`, async () => {
    const repo = makeRepo();
    await repo.save(record({
      enabled: false,
      quarantinedAt: "2026-08-12T12:00:00.000Z",
      quarantineReason: "plugin failed twice",
      quarantineFailureCount: 2,
    }));

    assert.deepEqual(
      await repo.getActivation({ workspaceId: WS, pluginId: "word-count" }),
      record({
        enabled: false,
        quarantinedAt: "2026-08-12T12:00:00.000Z",
        quarantineReason: "plugin failed twice",
        quarantineFailureCount: 2,
      })
    );

    await repo.save(record({ enabled: true, updatedAt: "2026-08-12T12:05:00.000Z" }));
    assert.deepEqual(
      await repo.getActivation({ workspaceId: WS, pluginId: "word-count" }),
      record({ enabled: true, updatedAt: "2026-08-12T12:05:00.000Z" }),
      "operator re-enable must clear the prior quarantine marker"
    );
  });
}

runSuite("InMemoryPluginActivationRepo", () => new InMemoryPluginActivationRepo());
runSuite("SqlitePluginActivationRepo", () => new SqlitePluginActivationRepo(openContentDb(":memory:")));
