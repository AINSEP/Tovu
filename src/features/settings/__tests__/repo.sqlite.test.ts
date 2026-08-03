import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb, type ContentDb } from "../../../db/sqlite/content-db";
import { workspaces } from "../../../db/schema";
import { InMemoryPrincipalRepo } from "../../../identity";
import { SqliteSettingsRepo } from "../repo.sqlite";
import { set, type SettingDefinitionRecord } from "@jini-ai/cms/settings";

/**
 * Integration tests against a real SQLite `content.db` (Article V —
 * P1 ACs get integration coverage at the real adapter, not just in-memory).
 * Proves the chokepoint's same-tx guarantee (INV-01) against an actual
 * transactional engine, which an in-memory adapter's no-op `transaction()`
 * cannot prove.
 */
function openTestDb() {
  return openContentDb(":memory:");
}

/** `setting_values_workspace`/`_user` carry a real FK to `workspaces` (schema.ts) — seed one row per id a test references. */
function seedWorkspace(db: ContentDb, id: string): void {
  db.insert(workspaces)
    .values({ id, name: id, slug: id, createdAt: "2026-07-11T00:00:00.000Z" })
    .onConflictDoNothing()
    .run();
}

const clock = { nowIso: () => "2026-07-11T00:00:00.000Z" };
let idCounter = 0;
const ids = { newId: () => `sqlite-id-${++idCounter}` };
const alwaysAllow = async () => ({ allowed: true, reason: "matched" });

test("SqliteSettingsRepo: saveDefinition + findActiveDefinition round-trip through real SQLite", async () => {
  const db = openTestDb();
  const repo = new SqliteSettingsRepo(db);
  const def: SettingDefinitionRecord = {
    settingId: "setting-sqlite-1",
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
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z",
  };

  await repo.saveDefinition(def);
  const found = await repo.findActiveDefinition({ namespace: def.namespace, key: def.key, workspaceId: null });
  assert.equal(found?.settingId, def.settingId);
  assert.deepEqual(found?.schema, { type: "string" });
});

test("SqliteSettingsRepo: set() writes exactly one value row + one revision row in the real DB (AC-07)", async () => {
  const db = openTestDb();
  const repo = new SqliteSettingsRepo(db);
  const principals = new InMemoryPrincipalRepo([]);
  const def: SettingDefinitionRecord = {
    settingId: "setting-sqlite-2",
    version: 1,
    workspaceId: null,
    namespace: "core.test",
    key: "flag",
    ownerKind: "core",
    ownerId: null,
    schema: { type: "boolean" },
    defaultValue: false,
    scopes: 2,
    secret: false,
    status: "active",
    aliasOfNamespace: null,
    aliasOfKey: null,
    coercionTag: null,
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z",
  };
  await repo.saveDefinition(def);
  seedWorkspace(db, "ws-sqlite-1");

  const result = await set({
    deps: { repo, clock, ids, authorize: alwaysAllow, principals },
    input: {
      namespace: def.namespace,
      key: def.key,
      scope: "workspace",
      value: true,
      workspaceId: "ws-sqlite-1",
      callerPrincipalId: "actor-1",
    },
  });

  const stored = await repo.getWorkspaceValue({ workspaceId: "ws-sqlite-1", settingId: def.settingId });
  assert.equal(stored?.valueJson, true);
  const revisions = await repo.listRevisions({ settingId: def.settingId });
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].op, "set");
  assert.equal(revisions[0].seq, result.revisionSeq);
});

test("SqliteSettingsRepo: transaction rolls back the value write when a later step in the same transaction throws (INV-01 atomicity proof)", async () => {
  const db = openTestDb();
  const repo = new SqliteSettingsRepo(db);
  const def: SettingDefinitionRecord = {
    settingId: "setting-sqlite-3",
    version: 1,
    workspaceId: null,
    namespace: "core.test",
    key: "atomic",
    ownerKind: "core",
    ownerId: null,
    schema: { type: "string" },
    defaultValue: "x",
    scopes: 1,
    secret: false,
    status: "active",
    aliasOfNamespace: null,
    aliasOfKey: null,
    coercionTag: null,
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z",
  };
  await repo.saveDefinition(def);

  await assert.rejects(() =>
    repo.transaction(async () => {
      await repo.saveGlobalValue({
        settingId: def.settingId,
        scope: "global",
        workspaceId: null,
        principalId: null,
        valueJson: "should-not-persist",
        state: "set",
        defVersion: 1,
        seq: 1,
        updatedBy: "actor-1",
        updatedAt: "2026-07-11T00:00:00.000Z",
        originPluginId: null,
      });
      throw new Error("simulated failure after the value write, before commit");
    })
  );

  const stored = await repo.getGlobalValue(def.settingId);
  assert.equal(stored, null, "the value row must not survive a transaction that failed after it was written");
});

test("SqliteSettingsRepo: workspace-scoped value from one workspace never leaks into another's read", async () => {
  const db = openTestDb();
  const repo = new SqliteSettingsRepo(db);
  const def: SettingDefinitionRecord = {
    settingId: "setting-sqlite-4",
    version: 1,
    workspaceId: null,
    namespace: "core.test",
    key: "isolated",
    ownerKind: "core",
    ownerId: null,
    schema: { type: "string" },
    defaultValue: "x",
    scopes: 2,
    secret: false,
    status: "active",
    aliasOfNamespace: null,
    aliasOfKey: null,
    coercionTag: null,
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z",
  };
  await repo.saveDefinition(def);
  seedWorkspace(db, "ws-A");
  seedWorkspace(db, "ws-B");
  await repo.saveWorkspaceValue({
    settingId: def.settingId,
    scope: "workspace",
    workspaceId: "ws-A",
    principalId: null,
    valueJson: "a-value",
    state: "set",
    defVersion: 1,
    seq: 1,
    updatedBy: "actor-1",
    updatedAt: "2026-07-11T00:00:00.000Z",
    originPluginId: null,
  });

  assert.equal(await repo.getWorkspaceValue({ workspaceId: "ws-B", settingId: def.settingId }), null);
  assert.equal(
    (await repo.getWorkspaceValue({ workspaceId: "ws-A", settingId: def.settingId }))?.valueJson,
    "a-value"
  );
});
