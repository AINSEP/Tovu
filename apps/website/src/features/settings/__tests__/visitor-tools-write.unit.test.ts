import assert from "node:assert/strict";
import test from "node:test";
import { ensureSettingDefinitions, getEffective, ForbiddenError, InMemorySettingsRepo, ValueValidationFailedError, type SettingDefinitionRecord } from "@jini-ai/core/settings";
import { readVisitorToolPolicy } from "../../../assistant/site/visitor-tool-settings.js";
import { clear, resetNamespace, set } from "../site-title-write.js";
import { writeVisitorTools, VisitorToolsRevisionUnavailableError } from "../visitor-tools-write.js";
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

test("invalid input, wrong scope and unavailable revision CAS cannot reach the ledger", async () => {
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
  await assert.rejects(writeVisitorTools({ deps: f.deps, value: off, workspaceId: ws, callerPrincipalId: "owner" }, { expectedRevisionSeq: 0 }), VisitorToolsRevisionUnavailableError);
  assert.equal(await f.repo.maxRevisionSeq(), before);
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
