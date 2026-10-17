import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import { createSettingsPrincipalLookup } from "../index.js";
import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";
import { workspaces } from "#src/platform/db/schema.sqlite";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { SqliteSettingsRepo } from "../repo.sqlite.js";
import { set, type SettingDefinitionRecord, type SettingValueRecord } from "@jini-ai/core/settings";

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

/** `setting_values_workspace`/`_user` carry a real FK to `workspaces` (schema.sqlite.ts) — seed one row per id a test references. */
function seedWorkspace(db: ContentDb, id: string): void {
  db.insert(workspaces)
    .values({ id, name: id, slug: id, createdAt: "2026-07-11T00:00:00.000Z" })
    .onConflictDoNothing()
    .run();
}

const clock = { nowIso: () => "2026-07-11T00:00:00.000Z", nowMs: () => Date.parse("2026-07-11T00:00:00.000Z") };
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
  assert.deepEqual(found, def);
});

test("SqliteSettingsRepo: set() writes exactly one value row + one revision row in the real DB (AC-07)", async () => {
  const db = openTestDb();
  const repo = new SqliteSettingsRepo(db);
  const principals = new InMemoryPrincipalRepo({});
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
    deps: { repo, clock, ids, authorize: alwaysAllow, principals: createSettingsPrincipalLookup({ repo: principals }) },
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

test("SqliteSettingsRepo: a legacy row holding a bare coercer tag still reads back as that tag", async () => {
  // Before `coercion_json` was JSON-encoded the repo wrote the bare tag; migration 0003 quotes those
  // rows, but a row written after it by an older build must still read correctly.
  const db = openTestDb();
  db.$client
    .prepare(
      `INSERT INTO setting_definitions (setting_id, version, namespace, key, owner_kind, schema_json, scopes, status, coercion_json, created_at, updated_at)
       VALUES ('legacy-tag', 2, 'core.test', 'legacyTag', 'core', '{"type":"string"}', 1, 'active', 'identity', 'now', 'now')`
    )
    .run();
  const repo = new SqliteSettingsRepo(db);
  assert.equal((await repo.findDefinitionBySettingId({ settingId: "legacy-tag" }))?.coercionTag, "identity");
});

function definition(overrides: Partial<SettingDefinitionRecord> = {}): SettingDefinitionRecord {
  return {
    settingId: "coverage-setting", version: 1, workspaceId: null, namespace: "core.coverage", key: "colour",
    ownerKind: "core", ownerId: null, schema: { type: "string" }, defaultValue: null, scopes: 7,
    secret: false, status: "active", aliasOfNamespace: null, aliasOfKey: null, coercionTag: null,
    createdAt: clock.nowIso(), updatedAt: clock.nowIso(), ...overrides,
  };
}

function settingValue(overrides: Partial<SettingValueRecord> = {}): SettingValueRecord {
  return {
    settingId: "coverage-setting", scope: "user", workspaceId: "ws-values", principalId: "reader",
    valueJson: "violet", state: "set", defVersion: 1, seq: 7, updatedBy: "actor",
    updatedAt: clock.nowIso(), originPluginId: "palette", ...overrides,
  };
}

test("definition lookup prefers the active version, otherwise the newest retired version, and exact versions never fall back", async (t) => {
  const db = openTestDb();
  t.after(() => db.$client.close());
  const repo = new SqliteSettingsRepo(db);
  const first = definition({ status: "tombstone" });
  const latest = definition({ version: 3, status: "tombstone", defaultValue: "blue", secret: true });
  await repo.saveDefinition(first);
  await repo.saveDefinition(latest);
  assert.deepEqual(await repo.findDefinitionBySettingId({ settingId: first.settingId }), latest);
  assert.deepEqual(await repo.findDefinitionBySettingId({ settingId: first.settingId, version: 1 }), first);
  assert.equal(await repo.findDefinitionBySettingId({ settingId: first.settingId, version: 2 }), null);
  assert.equal(await repo.findDefinitionBySettingId({ settingId: "absent" }), null);
  const active = definition({ version: 2, coercionTag: "identity" });
  await repo.saveDefinition(active);
  assert.deepEqual(await repo.findDefinitionBySettingId({ settingId: first.settingId }), active);
});

test("active definitions partition platform and workspace aliases, excluding tombstones from lists", async (t) => {
  const db = openTestDb();
  t.after(() => db.$client.close());
  const repo = new SqliteSettingsRepo(db);
  const platform = definition();
  const alias = definition({ settingId: "alias", ownerKind: "site", workspaceId: "ws-definitions", status: "alias", aliasOfNamespace: "core.target", aliasOfKey: "colour" });
  const tombstone = definition({ settingId: "retired", ownerKind: "site", workspaceId: "ws-definitions", key: "old", status: "tombstone" });
  for (const record of [platform, alias, tombstone]) await repo.saveDefinition(record);
  assert.deepEqual(await repo.findActiveDefinition({ namespace: alias.namespace, key: alias.key, workspaceId: alias.workspaceId }), alias);
  assert.deepEqual(await repo.findActiveDefinition({ namespace: tombstone.namespace, key: tombstone.key, workspaceId: tombstone.workspaceId }), tombstone);
  assert.deepEqual(await repo.listActiveDefinitions({ workspaceId: null }), [platform]);
  assert.deepEqual(await repo.listActiveDefinitions({ workspaceId: "ws-definitions" }), [alias]);
  assert.deepEqual(await repo.listActiveDefinitions({ workspaceId: "elsewhere" }), []);
});

test("legacy valid JSON coercion values that are not strings are retained verbatim", async (t) => {
  const db = openTestDb();
  t.after(() => db.$client.close());
  const repo = new SqliteSettingsRepo(db);
  await repo.saveDefinition(definition());
  for (const stored of ["null", "17", '{"kind":"identity"}']) {
    db.$client.prepare("UPDATE setting_definitions SET coercion_json = ? WHERE setting_id = ?").run(stored, "coverage-setting");
    assert.equal((await repo.findDefinitionBySettingId({ settingId: "coverage-setting" }))?.coercionTag, stored);
  }
});

test("user and workspace lists retain their full value records and exclude other tenants and principals", async (t) => {
  const db = openTestDb();
  t.after(() => db.$client.close());
  for (const id of ["ws-values", "ws-neighbour"]) seedWorkspace(db, id);
  const repo = new SqliteSettingsRepo(db);
  const own = settingValue();
  const otherUser = settingValue({ principalId: "editor", valueJson: "orange" });
  const otherTenant = settingValue({ workspaceId: "ws-neighbour", valueJson: "green" });
  for (const record of [own, otherUser, otherTenant]) await repo.saveUserValue(record);
  assert.deepEqual(await repo.getUserValue({ workspaceId: "ws-values", principalId: "reader", settingId: own.settingId }), own);
  assert.equal(await repo.getUserValue({ workspaceId: "ws-values", principalId: "unknown", settingId: own.settingId }), null);
  assert.deepEqual(await repo.listUserValues({ workspaceId: "ws-values", principalId: "reader" }), [own]);
  const workspace = settingValue({ scope: "workspace", principalId: null });
  await repo.saveWorkspaceValue(workspace);
  await repo.saveWorkspaceValue({ ...workspace, workspaceId: "ws-neighbour", valueJson: "green" });
  assert.deepEqual(await repo.listWorkspaceValues({ workspaceId: "ws-values" }), [workspace]);
  assert.deepEqual(await repo.listWorkspaceValues({ workspaceId: "unknown" }), []);
});

test("cleared values store SQL NULL while a set JSON null stays serialized, including on upsert", async (t) => {
  const db = openTestDb();
  t.after(() => db.$client.close());
  const repo = new SqliteSettingsRepo(db);
  const global = settingValue({ scope: "global", workspaceId: null, principalId: null, valueJson: null });
  assert.equal(await repo.getGlobalValue(global.settingId), null);
  await repo.saveGlobalValue(global);
  assert.deepEqual(db.$client.prepare("SELECT value_json, state FROM setting_values_global").get(), { value_json: "null", state: "set" });
  assert.deepEqual(await repo.getGlobalValue(global.settingId), global);
  const cleared = { ...global, state: "cleared" as const, seq: 8 };
  await repo.saveGlobalValue(cleared);
  assert.deepEqual(db.$client.prepare("SELECT value_json, state FROM setting_values_global").get(), { value_json: null, state: "cleared" });
  assert.deepEqual(await repo.getGlobalValue(global.settingId), cleared);
});

for (const [name, record, message] of [
  ["workspace without a workspace", settingValue({ workspaceId: null }), "saveWorkspaceValue requires workspaceId"],
  ["user without a workspace", settingValue({ workspaceId: null }), "saveUserValue requires workspaceId and principalId"],
  ["user without a principal", settingValue({ principalId: null }), "saveUserValue requires workspaceId and principalId"],
] as const) {
  test(`invalid ${name} is rejected before any value is written`, async (t) => {
    const db = openTestDb();
    t.after(() => db.$client.close());
    const repo = new SqliteSettingsRepo(db);
    await assert.rejects(name.startsWith("workspace") ? repo.saveWorkspaceValue(record) : repo.saveUserValue(record), { message });
    assert.deepEqual(db.$client.prepare("SELECT * FROM setting_values_workspace").all(), []);
    assert.deepEqual(db.$client.prepare("SELECT * FROM setting_values_user").all(), []);
  });
}

test("revision heads start at zero and round-trip both before and after JSON on a clear", async (t) => {
  const db = openTestDb();
  t.after(() => db.$client.close());
  const repo = new SqliteSettingsRepo(db);
  assert.equal(await repo.maxRevisionSeq(), 0);
  const revision = {
    entityKind: "value" as const, settingId: "coverage-setting", scope: "global" as const,
    workspaceId: null, principalId: null, op: "clear" as const, beforeJson: { colour: "blue" },
    afterJson: null, defVersion: 1, actor: "actor", originPluginId: "palette", changeSetId: "change-7", createdAt: clock.nowIso(),
  };
  const seq = await repo.appendRevision(revision);
  assert.deepEqual(await repo.listRevisions({ settingId: revision.settingId }), [{ ...revision, seq }]);
  assert.equal(await repo.maxRevisionSeq(), seq);
});
