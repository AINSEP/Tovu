import assert from "node:assert/strict";
import { test } from "node:test";

import type { SettingDefinitionRecord, SettingRevisionRecord, SettingValueRecord } from "@jini-ai/core/settings";

import { recordingKernel } from "#src/__tests__/lane-su-pins/support/recording-kernel";
import { seedWorkspaces } from "#src/platform/db/kernel/__tests__/content-seeds";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { SqliteSettingsRepo } from "../repo.sqlite.js";

/**
 * @file S5a T0: the settings repo's behaviour on the unmoved code, before its query body moves to Jini
 * `@jini-ai/db/settings`. Each test names the one-line mutation of `repo.ts` that turns it red. Real SQLite
 * kernel (the recorder from the lane-su pins). Value writes are pinned as unconditional last-write-wins
 * upserts: this is today's behaviour, not a lost-update guard.
 */

const NOW = "2026-11-18T00:00:00.000Z";

const value = (over: Partial<SettingValueRecord> = {}): SettingValueRecord => ({
  settingId: "s-1", scope: "global", workspaceId: null, principalId: null, valueJson: "x", state: "set",
  defVersion: 1, seq: 1, updatedBy: "actor-1", updatedAt: NOW, originPluginId: null, ...over,
});

const definition = (over: Partial<SettingDefinitionRecord> = {}): SettingDefinitionRecord => ({
  settingId: "def-1", version: 1, workspaceId: null, namespace: "core.t0", key: "k", ownerKind: "core", ownerId: null,
  schema: { type: "string" }, defaultValue: "d", scopes: 7, secret: false, status: "active", aliasOfNamespace: null,
  aliasOfKey: null, coercionTag: null, createdAt: NOW, updatedAt: NOW, ...over,
});

const revision = (over: Partial<Omit<SettingRevisionRecord, "seq">> = {}): Omit<SettingRevisionRecord, "seq"> => ({
  entityKind: "value", settingId: "s-1", scope: "global", workspaceId: null, principalId: null, op: "set",
  beforeJson: null, afterJson: "x", defVersion: 1, actor: "actor-1", originPluginId: null, changeSetId: null,
  createdAt: NOW, ...over,
});

async function seeded() {
  const recorded = recordingKernel();
  await seedWorkspaces(recorded.kernel, ["ws-a", "ws-b"]);
  return { ...recorded, repo: new SqliteSettingsRepo({ store: recorded.kernel }) };
}

/** The recorder plus the begin/commit/statement events, so the lock's place in the transaction is visible. */
function eventKernel(base: ContentKernel): { kernel: ContentKernel; events: string[] } {
  const events: string[] = [];
  const kernel: ContentKernel = {
    ...base,
    transaction: async (fn) => { events.push("begin"); const result = await base.transaction(fn); events.push("commit"); return result; },
    lockKey: async (key) => { events.push(`lock:${key}`); await base.lockKey(key); },
    run: (fn) => { events.push("run"); return base.run(fn); },
  };
  return { kernel, events };
}

test("concurrent appendRevision calls get consecutive distinct seq values", async () => {
  const { repo } = await seeded();
  const seqs = await Promise.all([1, 2, 3, 4].map((n) => repo.appendRevision(revision({ afterJson: `v${n}` }))));
  assert.deepEqual([...seqs].sort((a, b) => a - b), [1, 2, 3, 4]);
});

test("appendRevision takes the revision-stream lock inside the transaction, before the insert statement", async () => {
  const wrapped = eventKernel(recordingKernel().kernel);
  await new SqliteSettingsRepo({ store: wrapped.kernel }).appendRevision(revision());
  assert.deepEqual(wrapped.events, ["begin", "lock:setting_revisions", "run", "commit"]);
});

test("two writes of one setting at one scope: the second wins and one row remains (global, workspace, user)", async () => {
  const { repo, kernel } = await seeded();
  await repo.saveGlobalValue(value({ valueJson: "first" }));
  await repo.saveGlobalValue(value({ valueJson: "second", seq: 2 }));
  const ws = { scope: "workspace" as const, workspaceId: "ws-a" };
  await repo.saveWorkspaceValue(value({ ...ws, valueJson: "first" }));
  await repo.saveWorkspaceValue(value({ ...ws, valueJson: "second", seq: 2 }));
  const user = { scope: "user" as const, workspaceId: "ws-a", principalId: "p-1" };
  await repo.saveUserValue(value({ ...user, valueJson: "first" }));
  await repo.saveUserValue(value({ ...user, valueJson: "second", seq: 2 }));
  assert.equal((await repo.getGlobalValue("s-1"))?.valueJson, "second");
  assert.equal((await repo.getWorkspaceValue({ workspaceId: "ws-a", settingId: "s-1" }))?.valueJson, "second");
  assert.equal((await repo.getUserValue({ workspaceId: "ws-a", principalId: "p-1", settingId: "s-1" }))?.valueJson, "second");
  for (const table of ["setting_values_global", "setting_values_workspace", "setting_values_user"] as const) {
    const rows = await kernel.run((db) => db.selectFrom(table).select("setting_id").execute());
    assert.equal(rows.length, 1, table);
  }
});

test("a workspace value and a user value are not returned for another workspace or principal", async () => {
  const { repo } = await seeded();
  await repo.saveWorkspaceValue(value({ scope: "workspace", workspaceId: "ws-a" }));
  await repo.saveUserValue(value({ scope: "user", workspaceId: "ws-a", principalId: "p-1" }));
  assert.equal(await repo.getWorkspaceValue({ workspaceId: "ws-b", settingId: "s-1" }), null);
  assert.equal(await repo.getUserValue({ workspaceId: "ws-b", principalId: "p-1", settingId: "s-1" }), null);
  assert.equal(await repo.getUserValue({ workspaceId: "ws-a", principalId: "p-2", settingId: "s-1" }), null);
  assert.deepEqual(await repo.listWorkspaceValues({ workspaceId: "ws-b" }), []);
  assert.deepEqual(await repo.listUserValues({ workspaceId: "ws-a", principalId: "p-2" }), []);
  assert.deepEqual(await repo.listUserValuesByWorkspace({ workspaceId: "ws-b" }), []);
  assert.equal((await repo.listUserValues({ workspaceId: "ws-a", principalId: "p-1" })).length, 1);
});

test("deleteUserValue removes exactly (workspace, principal, setting); workspace and global rows and the ledger stay", async () => {
  const { repo } = await seeded();
  await repo.saveGlobalValue(value());
  await repo.saveWorkspaceValue(value({ scope: "workspace", workspaceId: "ws-a" }));
  await repo.saveUserValue(value({ scope: "user", workspaceId: "ws-a", principalId: "p-1" }));
  await repo.saveUserValue(value({ scope: "user", workspaceId: "ws-a", principalId: "p-2" }));
  await repo.appendRevision(revision());
  await repo.deleteUserValue({ workspaceId: "ws-a", principalId: "p-1", settingId: "s-1" });
  assert.equal(await repo.getUserValue({ workspaceId: "ws-a", principalId: "p-1", settingId: "s-1" }), null);
  assert.notEqual(await repo.getUserValue({ workspaceId: "ws-a", principalId: "p-2", settingId: "s-1" }), null);
  assert.notEqual(await repo.getWorkspaceValue({ workspaceId: "ws-a", settingId: "s-1" }), null);
  assert.notEqual(await repo.getGlobalValue("s-1"), null);
  assert.equal((await repo.listRevisions({ settingId: "s-1" })).length, 1);
});

test("listRevisionsSince returns the exact seq list for a cursor in the middle, bounded by the limit", async () => {
  const { repo } = await seeded();
  for (let n = 1; n <= 5; n += 1) await repo.appendRevision(revision({ workspaceId: "ws-a", scope: "workspace", afterJson: n }));
  const page = async (sinceSeq: number, limit: number) => (await repo.listRevisionsSince({ sinceSeq, limit, workspaceId: "ws-a" })).map((r) => r.seq);
  assert.deepEqual(await page(2, 10), [3, 4, 5]);
  assert.deepEqual(await page(2, 2), [3, 4]);
  assert.deepEqual(await page(5, 10), []);
  assert.equal(await repo.maxRevisionSeq(), 5);
});

test("definition lookup resolves a platform (workspaceId null) definition and a workspace one separately", async () => {
  const { repo } = await seeded();
  await repo.saveDefinition(definition({ settingId: "platform", workspaceId: null }));
  await repo.saveDefinition(definition({ settingId: "scoped", workspaceId: "ws-a", key: "k2" }));
  assert.equal((await repo.findActiveDefinition({ namespace: "core.t0", key: "k", workspaceId: null }))?.settingId, "platform");
  assert.equal(await repo.findActiveDefinition({ namespace: "core.t0", key: "k", workspaceId: "ws-a" }), null);
  assert.equal((await repo.findActiveDefinition({ namespace: "core.t0", key: "k2", workspaceId: "ws-a" }))?.settingId, "scoped");
  assert.equal(await repo.findActiveDefinition({ namespace: "core.t0", key: "k2", workspaceId: null }), null);
  assert.deepEqual((await repo.listActiveDefinitions({ workspaceId: null })).map((d) => d.settingId), ["platform"]);
});
