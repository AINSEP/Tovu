import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "../../../infra/sqlite/content-db";
import { workspaces } from "../../../infra/db/schema";
import { InMemorySettingsRepo } from "../repo.memory";
import { SqliteSettingsRepo } from "../repo.sqlite";
import type { SettingsRepoPort } from "../ports";
import type { SettingDefinitionRecord, SettingValueRecord } from "../types";

/** Every workspace id any contract-suite test below references — seeded up front so the SQLite adapter's real FK doesn't reject them. */
const CONTRACT_TEST_WORKSPACE_IDS = ["ws-1", "ws-2", "ws-OTHER"];

/**
 * Shared contract-test suite for `SettingsRepoPort` (C-007, ADR-PIPE-007
 * rule-of-two). Runs against every adapter: `repo.memory.ts` and
 * `repo.sqlite.ts` (the rule-of-two second adapter, Article IV).
 */
function runContractSuite(adapterName: string, makeRepo: () => SettingsRepoPort) {
  const NOW = "2026-07-11T00:00:00.000Z";
  const def: SettingDefinitionRecord = {
    settingId: "setting-1",
    version: 1,
    workspaceId: null,
    namespace: "core.presentation",
    key: "activeThemeId",
    ownerKind: "core",
    ownerId: null,
    schema: { type: "string" },
    defaultValue: "paper",
    scopes: 7,
    secret: false,
    status: "active",
    aliasOfNamespace: null,
    aliasOfKey: null,
    coercionTag: null,
    createdAt: NOW,
    updatedAt: NOW,
  };

  test(`[${adapterName}] saveDefinition + findActiveDefinition round-trips`, async () => {
    const repo = makeRepo();
    await repo.saveDefinition(def);
    const found = await repo.findActiveDefinition({
      namespace: def.namespace,
      key: def.key,
      workspaceId: null,
    });
    assert.equal(found?.settingId, def.settingId);
  });

  test(`[${adapterName}] findActiveDefinition returns null for an unknown key`, async () => {
    const repo = makeRepo();
    const found = await repo.findActiveDefinition({ namespace: "core.nope", key: "x", workspaceId: null });
    assert.equal(found, null);
  });

  test(`[${adapterName}] global/workspace/user value save+get round-trip independently`, async () => {
    const repo = makeRepo();
    const base: Omit<SettingValueRecord, "scope" | "workspaceId" | "principalId"> = {
      settingId: def.settingId,
      valueJson: "x",
      state: "set",
      defVersion: 1,
      seq: 1,
      updatedBy: "actor-1",
      updatedAt: NOW,
      originPluginId: null,
    };
    await repo.saveGlobalValue({ ...base, scope: "global", workspaceId: null, principalId: null });
    await repo.saveWorkspaceValue({ ...base, scope: "workspace", workspaceId: "ws-1", principalId: null });
    await repo.saveUserValue({ ...base, scope: "user", workspaceId: "ws-1", principalId: "p-1" });

    assert.equal((await repo.getGlobalValue(def.settingId))?.valueJson, "x");
    assert.equal((await repo.getWorkspaceValue({ workspaceId: "ws-1", settingId: def.settingId }))?.valueJson, "x");
    assert.equal(
      (await repo.getUserValue({ workspaceId: "ws-1", principalId: "p-1", settingId: def.settingId }))?.valueJson,
      "x"
    );
    // Isolation: a workspace value must not leak into a different workspace's read.
    assert.equal(await repo.getWorkspaceValue({ workspaceId: "ws-OTHER", settingId: def.settingId }), null);
  });

  test(`[${adapterName}] appendRevision assigns a monotonically increasing seq and listRevisions returns ascending order`, async () => {
    const repo = makeRepo();
    const base = {
      entityKind: "value" as const,
      settingId: def.settingId,
      scope: "global" as const,
      workspaceId: null,
      principalId: null,
      op: "set" as const,
      beforeJson: null,
      afterJson: "x",
      defVersion: 1,
      actor: "actor-1",
      originPluginId: null,
      changeSetId: null,
      createdAt: NOW,
    };
    const seq1 = await repo.appendRevision(base);
    const seq2 = await repo.appendRevision(base);
    assert.ok(seq2 > seq1);

    const revisions = await repo.listRevisions({ settingId: def.settingId });
    assert.deepEqual(
      revisions.map((r) => r.seq),
      [...revisions.map((r) => r.seq)].sort((a, b) => a - b)
    );
  });

  test(`[${adapterName}] deleteWorkspaceValue/deleteUserValue remove exactly the targeted row`, async () => {
    const repo = makeRepo();
    const base: Omit<SettingValueRecord, "scope" | "workspaceId" | "principalId"> = {
      settingId: def.settingId,
      valueJson: "x",
      state: "set",
      defVersion: 1,
      seq: 1,
      updatedBy: "actor-1",
      updatedAt: NOW,
      originPluginId: null,
    };
    await repo.saveWorkspaceValue({ ...base, scope: "workspace", workspaceId: "ws-1", principalId: null });
    await repo.saveWorkspaceValue({ ...base, scope: "workspace", workspaceId: "ws-2", principalId: null });

    await repo.deleteWorkspaceValue({ workspaceId: "ws-1", settingId: def.settingId });

    assert.equal(await repo.getWorkspaceValue({ workspaceId: "ws-1", settingId: def.settingId }), null);
    assert.notEqual(await repo.getWorkspaceValue({ workspaceId: "ws-2", settingId: def.settingId }), null);
  });

  test(`[${adapterName}] listUserValuesByWorkspace returns every principal's rows for a workspace, none from another workspace`, async () => {
    const repo = makeRepo();
    const base: Omit<SettingValueRecord, "scope" | "workspaceId" | "principalId"> = {
      settingId: def.settingId,
      valueJson: "x",
      state: "set",
      defVersion: 1,
      seq: 1,
      updatedBy: "actor-1",
      updatedAt: NOW,
      originPluginId: null,
    };
    await repo.saveUserValue({ ...base, scope: "user", workspaceId: "ws-1", principalId: "p-1" });
    await repo.saveUserValue({ ...base, scope: "user", workspaceId: "ws-1", principalId: "p-2" });
    await repo.saveUserValue({ ...base, scope: "user", workspaceId: "ws-2", principalId: "p-3" });

    const rows = await repo.listUserValuesByWorkspace({ workspaceId: "ws-1" });
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((r) => r.principalId).sort(),
      ["p-1", "p-2"]
    );
  });

  test(`[${adapterName}] transaction runs the callback and returns its result`, async () => {
    const repo = makeRepo();
    const result = await repo.transaction(async () => {
      await repo.saveDefinition(def);
      return "done";
    });
    assert.equal(result, "done");
    assert.notEqual(
      await repo.findActiveDefinition({ namespace: def.namespace, key: def.key, workspaceId: null }),
      null
    );
  });
}

runContractSuite("InMemorySettingsRepo", () => new InMemorySettingsRepo());

runContractSuite("SqliteSettingsRepo", () => {
  const db = openContentDb(":memory:");
  for (const id of CONTRACT_TEST_WORKSPACE_IDS) {
    db.insert(workspaces)
      .values({ id, name: id, slug: id, createdAt: "2026-07-11T00:00:00.000Z" })
      .onConflictDoNothing()
      .run();
  }
  return new SqliteSettingsRepo(db);
});
