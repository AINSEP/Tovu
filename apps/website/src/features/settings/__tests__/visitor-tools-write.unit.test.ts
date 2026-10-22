import assert from "node:assert/strict";
import test from "node:test";
import { ensureSettingDefinitions, getEffective, ForbiddenError, InMemorySettingsRepo, ValueValidationFailedError, type SettingDefinitionRecord } from "@jini-ai/core/settings";
import { readVisitorToolPolicy } from "../../../assistant/site/visitor-tool-settings.js";
import { clear, resetNamespace, set } from "../site-title-write.js";
import { guardVisitorToolsRevision, readVisitorToolsRevision, readVisitorToolsSnapshot, writeVisitorTools, VisitorToolsRevisionConflictError } from "../visitor-tools-write.js";
import { VISITOR_TOOLS_PERMISSION, VISITOR_TOOLS_SETTING } from "../../../contracts/site-assistant/visitor-tools.js";

import { visitorSettingsFixture, ws, off } from "./visitor-tools.fixture.js";


test("registered empty policy preserves defaults; only the dedicated service can save a choice", async () => {
  const f = await visitorSettingsFixture();
  assert.deepEqual(await f.read(), { version: 1, tools: {} });
  const result = await f.write();
  assert.equal(result.revisionSeq, await f.repo.maxRevisionSeq());
  assert.deepEqual(await f.read(), result.value);
  assert.deepEqual(f.permissions, [VISITOR_TOOLS_PERMISSION]);
  const before = await f.repo.maxRevisionSeq();
  await assert.rejects(set({ deps: f.deps, input: f.input }), ForbiddenError);
  await assert.rejects(clear({ deps: f.deps, input: f.input }), ForbiddenError);
  await assert.rejects(resetNamespace({ deps: f.deps, input: f.input, keysInNamespace: [f.input.key] }), ForbiddenError);
  assert.equal(await f.repo.maxRevisionSeq(), before);
  f.grants.clear();
  await assert.rejects(f.write(), ForbiddenError);
  assert.equal(await f.repo.maxRevisionSeq(), before);
});

test("the host reset still clears unrelated namespaces through the existing settings owner", async () => {
  const f = await visitorSettingsFixture();
  await ensureSettingDefinitions({ settingsRepo: f.repo, clock: f.deps.clock, ids: f.deps.ids, principals: f.deps.principals }, {
    namespace: "site.notes", ownerKind: "site", workspaceId: ws, systemPrincipalId: "boot",
    definitions: [{ key: "text", schema: { type: "string" }, defaultValue: "default" }],
  });
  for (const permission of ["settings.workspace.write", "settings.reset.workspace"]) f.grants.add(permission);
  const input = { ...f.input, namespace: "site.notes", key: "text", value: "changed" };
  await set({ deps: f.deps, input });
  await resetNamespace({ deps: f.deps, input, keysInNamespace: [input.key] });
  const resolved = await getEffective({ repo: f.repo }, { namespace: input.namespace, key: input.key, scopeContext: { workspaceId: ws } });
  assert.equal(resolved?.value, "default");
});

test("invalid input and wrong scope cannot reach the ledger", async () => {
  const f = await visitorSettingsFixture();
  const before = await f.repo.maxRevisionSeq();
  await assert.rejects(f.write({ version: 1, tools: [] }), /objects/);
  await assert.rejects(set({ deps: f.deps, input: { ...f.input, requiredPermissionOverride: VISITOR_TOOLS_PERMISSION, value: "invalid" } }), ValueValidationFailedError);
  for (const scope of ["user", "global"] as const) {
    // A canonical site definition still cannot authorize non-workspace policy writes.
    const definition = await f.repo.findActiveDefinition({ ...VISITOR_TOOLS_SETTING, workspaceId: ws });
    assert.ok(definition);
    const repo = Object.create(f.repo) as InMemorySettingsRepo;
    repo.findActiveDefinition = async () => definition;
    await assert.rejects(set({ deps: { ...f.deps, repo }, input: { ...f.input, scope, requiredPermissionOverride: VISITOR_TOOLS_PERMISSION } }), ForbiddenError);
  }
  assert.equal(await f.repo.maxRevisionSeq(), before);
});

test("revision CAS accepts the unset snapshot and rolls back both value and revision on stale writes", async () => {
  const f = await visitorSettingsFixture();
  assert.equal((await readVisitorToolsSnapshot({ repo: f.repo, workspaceId: ws })).revisionSeq, 0);
  assert.equal(await readVisitorToolsRevision({ repo: f.repo, workspaceId: ws }), 0);
  const args = { deps: f.deps, value: off, workspaceId: ws, callerPrincipalId: "owner" };
  const saved = await writeVisitorTools(args, { expectedRevisionSeq: 0 });
  const before = await f.repo.maxRevisionSeq();
  await assert.rejects(writeVisitorTools({ ...args, value: { version: 1, tools: {} } }, { expectedRevisionSeq: 0 }), VisitorToolsRevisionConflictError);
  assert.equal(await f.repo.maxRevisionSeq(), before);
  assert.deepEqual((await readVisitorToolsSnapshot({ repo: f.repo, workspaceId: ws })).policy, saved.value);
  const next = await writeVisitorTools(args, { expectedRevisionSeq: saved.revisionSeq });
  assert.ok(next.revisionSeq > saved.revisionSeq);
  const definition = (await f.repo.findActiveDefinition({ ...VISITOR_TOOLS_SETTING, workspaceId: ws }))!;
  const row = (await f.repo.getWorkspaceValue({ workspaceId: ws, settingId: definition.settingId }))!;
  await f.repo.saveWorkspaceValue({ ...row, state: "cleared" });
  const cleared = await readVisitorToolsSnapshot({ repo: f.repo, workspaceId: ws });
  assert.equal(cleared.revisionSeq, next.revisionSeq);
  assert.equal(await readVisitorToolsRevision({ repo: f.repo, workspaceId: ws }), next.revisionSeq);
  assert.deepEqual(cleared.policy, { version: 1, tools: {} });
  await assert.rejects(readVisitorToolsSnapshot({ repo: new InMemorySettingsRepo(), workspaceId: ws }), /definition is unavailable/);
});

test("revision-only CAS refuses a stale corrupt row and can repair it at the real row seq", async () => {
  const f = await visitorSettingsFixture();
  const saved = await f.write();
  const definition = (await f.repo.findActiveDefinition({ ...VISITOR_TOOLS_SETTING, workspaceId: ws }))!;
  const row = (await f.repo.getWorkspaceValue({ workspaceId: ws, settingId: definition.settingId }))!;
  await f.repo.saveWorkspaceValue({ ...row, valueJson: { version: 2 } });
  assert.deepEqual(await readVisitorToolsSnapshot({ repo: f.repo, workspaceId: ws }), { policy: null, revisionSeq: saved.revisionSeq });
  assert.equal(await readVisitorToolsRevision({ repo: f.repo, workspaceId: ws }), row.seq);
  const before = await f.repo.maxRevisionSeq();
  const args = { deps: f.deps, value: off, workspaceId: ws, callerPrincipalId: "owner" };
  await assert.rejects(writeVisitorTools(args, { expectedRevisionSeq: 0 }), VisitorToolsRevisionConflictError);
  assert.equal(await f.repo.maxRevisionSeq(), before);
  assert.deepEqual((await f.repo.getWorkspaceValue({ workspaceId: ws, settingId: definition.settingId }))?.valueJson, { version: 2 });
  await writeVisitorTools(args, { expectedRevisionSeq: row.seq });
  assert.ok(await f.read());
  assert.equal(await f.repo.maxRevisionSeq(), before + 1);
});

test("unexpected transaction and snapshot failures propagate rather than becoming reloads or invalid policies", async t => {
  const f = await visitorSettingsFixture();
  const failure = new Error("disk unavailable");
  t.mock.method(f.repo, "transaction", async () => { throw failure; });
  await assert.rejects(writeVisitorTools({ deps: f.deps, value: off, workspaceId: ws, callerPrincipalId: "owner" }, { expectedRevisionSeq: 0 }), error => error === failure);
  t.mock.method(f.repo, "getWorkspaceValue", async () => { throw failure; });
  await assert.rejects(readVisitorToolsSnapshot({ repo: f.repo, workspaceId: ws }), error => error === failure);
});

test("the revision adapter preserves methods/metadata and compares only after appendRevision acquires the ledger lock", async t => {
  const f = await visitorSettingsFixture();
  const tagged = Object.assign(f.repo, { adapterTag: "memory-fixture" });
  const guarded = guardVisitorToolsRevision({ repo: tagged, workspaceId: ws, expectedRevisionSeq: 0 });
  assert.equal(Reflect.get(guarded, "adapterTag"), "memory-fixture");
  assert.equal(await guarded.maxRevisionSeq(), await f.repo.maxRevisionSeq());
  const append = f.repo.appendRevision.bind(f.repo);
  const read = f.repo.getWorkspaceValue.bind(f.repo);
  const events: string[] = [];
  t.mock.method(f.repo, "appendRevision", async (record: Parameters<typeof append>[0]) => {
    const revision = await append(record);
    events.push("lock-acquired");
    return revision;
  });
  t.mock.method(f.repo, "getWorkspaceValue", async (input: Parameters<typeof read>[0]) => {
    events.push("read-current-revision");
    return read(input);
  });
  await writeVisitorTools({ deps: f.deps, value: off, workspaceId: ws, callerPrincipalId: "owner" }, { expectedRevisionSeq: 0 });
  assert.ok(events.indexOf("lock-acquired") >= 0);
  assert.ok(events.lastIndexOf("read-current-revision") > events.indexOf("lock-acquired"));
});

test("aliases cannot bypass set, clear or namespace reset", async () => {
  const f = await visitorSettingsFixture();
  const canonical = (await f.repo.findActiveDefinition({ ...VISITOR_TOOLS_SETTING, workspaceId: ws }))!;
  const alias: SettingDefinitionRecord = { ...canonical, settingId: "visitor-alias", namespace: "site.legacy", key: "visitorPolicy", status: "alias",
    aliasOfNamespace: VISITOR_TOOLS_SETTING.namespace, aliasOfKey: VISITOR_TOOLS_SETTING.key };
  await f.repo.saveDefinition(alias);
  const input = { ...f.input, namespace: alias.namespace, key: alias.key };
  const before = await f.repo.maxRevisionSeq();
  await assert.rejects(set({ deps: f.deps, input }), ForbiddenError);
  await assert.rejects(clear({ deps: f.deps, input }), ForbiddenError);
  await assert.rejects(resetNamespace({ deps: f.deps, input, keysInNamespace: [input.key] }), ForbiddenError);
  assert.equal(await f.repo.maxRevisionSeq(), before);
});

test("stored JSON corruption, missing definitions, and repo failures all fail closed", async (t) => {
  const f = await visitorSettingsFixture();
  const definition = (await f.repo.findActiveDefinition({ ...VISITOR_TOOLS_SETTING, workspaceId: ws }))!;
  for (const value of ["not JSON policy", null, { version: 1, tools: { list_categories: { mode: "maybe" } } }]) {
    await f.repo.saveWorkspaceValue({ settingId: definition.settingId, workspaceId: ws, principalId: null, scope: "workspace", valueJson: value,
      state: "set", defVersion: definition.version, seq: 1, updatedBy: "legacy", updatedAt: "2026-10-22T00:00:00.000Z", originPluginId: null });
    assert.equal(await f.read(), null);
  }
  assert.equal(f.reports.length, 3);
  assert.equal(await readVisitorToolPolicy({ settingsRepo: new InMemorySettingsRepo(), workspaceId: ws, reportError: () => assert.fail("missing is not a storage exception") }), null);
  t.mock.method(f.repo, "getWorkspaceValue", async () => { throw new Error("store down"); });
  assert.equal(await f.read(), null);
  assert.match(String(f.reports.at(-1)), /store down/);
});
