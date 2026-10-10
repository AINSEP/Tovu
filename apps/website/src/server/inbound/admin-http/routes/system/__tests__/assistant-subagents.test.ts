import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemorySettingsRepo, ensureSettingDefinitions, getEffective } from "@jini-ai/core/settings";
import { ensureExecutionSettingDefinitions } from "#src/assistant/execution-mode-settings";
import { readAssistantSubagentsEnabled } from "#src/assistant/subagent-settings";
import { ASSISTANT_SUBAGENTS_NAMESPACE as namespace, ASSISTANT_SUBAGENTS_WRITE_REASON } from "#src/contracts/headless/assistant-subagents-policy";
import { registerAdminAssistantSubagentsRoutes } from "../assistant-subagents.js";
import { registerAdminSettingsSetRoute } from "../../settings/set.js";
import { registerAdminSettingsClearRoute } from "../../settings/clear.js";
import { registerAdminSettingsResetRoute } from "../../settings/reset.js";
import { registerAdminSettingsRegisterDefinitionsRoute } from "../../settings/register-definitions.js";
import { touchesAssistantSubagents } from "../../settings/assistant-subagents-access.js";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";

const base = "/api/admin/v1/workspaces/:workspaceId";
const settingPath = base + "/system/assistant-subagents";
type Deps = Parameters<typeof registerAdminAssistantSubagentsRoutes>[0]["deps"];

async function fixture() {
  let id = 0;
  let allowed = true;
  const repo = new InMemorySettingsRepo();
  const clock = { nowMs: () => 1_791_504_000_000, nowIso: () => "2026-10-09T00:00:00.000Z" };
  const ids = { newId: () => `subag-${++id}` };
  await ensureExecutionSettingDefinitions({ settingsRepo: repo, clock, ids,
    principals: { findActiveById: async () => null }, ensureSettingDefinitions }, { systemPrincipalId: "system" });
  const deps = { workspaceId: "ws", settingsReady: Promise.resolve(), settingsUiTabsReady: Promise.resolve(),
    settingsRepo: repo, clock, idGen: ids, getEffective, ownerPrincipalId: Promise.resolve("owner"),
    principalRepo: { findById: async () => null }, authorize: async () => ({ allowed, reason: "test_permission" }),
  } as unknown as Deps;
  const app = express();
  registerAdminAssistantSubagentsRoutes({ app, deps });
  registerAdminSettingsSetRoute(app, deps);
  registerAdminSettingsClearRoute(app, deps);
  registerAdminSettingsResetRoute(app, deps);
  registerAdminSettingsRegisterDefinitionsRoute(app, deps);
  const definition = (await repo.listActiveDefinitions({ workspaceId: null })).find((def) => def.namespace === namespace)!;
  assert.ok(definition, "boot must register the subagent setting");
  return { repo, deps, definition, deny: () => { allowed = false; },
    async request(method: "get" | "put" | "post" | "delete", path = settingPath,
      input: { body?: unknown; principal?: string | null; workspaceId?: string } = {}) {
      const { res, capture } = createCapturingResponse();
      if (input.principal !== null) res.locals.principal = { id: input.principal ?? "owner" };
      await extractRouteHandler(app, method, path)({ params: { workspaceId: input.workspaceId ?? "ws" }, body: input.body, query: {} }, res);
      return capture;
    },
    values: async () => (await repo.listRevisions({ settingId: definition.settingId })).filter((revision) => revision.entityKind === "value"),
  };
}

test("boot defaults off, registration is idempotent, and reads expose owner editability", async () => {
  const f = await fixture();
  assert.equal(f.definition.defaultValue, false);
  assert.equal(f.definition.scopes, 2);
  assert.deepEqual((await f.request("get")).jsonBody, { enabled: false, canEdit: true });
  assert.deepEqual((await f.request("get", settingPath, { principal: "admin" })).jsonBody, { enabled: false, canEdit: false });
  const before = await f.repo.maxRevisionSeq();
  await ensureExecutionSettingDefinitions({ settingsRepo: f.repo, clock: f.deps.clock, ids: f.deps.idGen,
    principals: { findActiveById: async () => null }, ensureSettingDefinitions }, { systemPrincipalId: "system" });
  assert.equal(await f.repo.maxRevisionSeq(), before);
});

test("owner enable and disable are audited and a separate daemon read sees the current grant", async () => {
  const f = await fixture();
  const read = () => readAssistantSubagentsEnabled({ ...f.deps, settingsReady: f.deps.settingsUiTabsReady });
  assert.equal(await read(), false);
  assert.equal((await f.request("put", settingPath, { body: { enabled: true, riskAcknowledged: true } })).statusCode, 200);
  assert.equal(await read(), true);
  assert.equal((await f.request("put", settingPath, { body: { enabled: false } })).statusCode, 200);
  assert.equal(await read(), false);
  const values = await f.values();
  assert.deepEqual(values.map((revision) => [revision.actor, revision.workspaceId, revision.scope, revision.afterJson]),
    [["owner", "ws", "workspace", true], ["owner", "ws", "workspace", false]]);
});

test("a non-owner with all settings permissions cannot enable OR disable", async () => {
  const f = await fixture();
  for (const enabled of [true, false]) {
    const response = await f.request("put", settingPath, { principal: "admin", body: { enabled, riskAcknowledged: true } });
    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.jsonBody, { code: "FORBIDDEN", error: ASSISTANT_SUBAGENTS_WRITE_REASON });
  }
  assert.deepEqual(await f.values(), []);
});

test("malformed or unacknowledged enabling writes never create a revision", async () => {
  const f = await fixture();
  for (const body of [null, {}, { enabled: "true", riskAcknowledged: true }, { enabled: true },
    { enabled: true, riskAcknowledged: "true" }, { enabled: true, riskAcknowledged: false }]) {
    const response = await f.request("put", settingPath, { body });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.jsonBody, { code: "VALIDATION_ERROR", error: "enabled must be a boolean; enabling subagents requires riskAcknowledged: true." });
  }
  assert.deepEqual(await f.values(), []);
});

test("workspace, authentication, and permission boundaries fail closed", async () => {
  const f = await fixture();
  assert.equal((await f.request("put", settingPath, { workspaceId: "foreign", body: { enabled: true, riskAcknowledged: true } })).statusCode, 404);
  assert.equal((await f.request("get", settingPath, { principal: null })).statusCode, 500);
  f.deny();
  assert.deepEqual((await f.request("get", settingPath, { principal: "admin" })).jsonBody, { enabled: false, canEdit: false });
  assert.equal((await f.request("put", settingPath, { body: { enabled: true, riskAcknowledged: true } })).statusCode, 403);
  assert.deepEqual(await f.values(), []);
});

test("generic set, clear, reset and definition edits cannot bypass owner danger confirmation", async () => {
  const f = await fixture();
  for (const [method, path, body] of [
    ["put", "/settings/value", { namespace, key: "enabled", scope: "workspace", valueJson: true }],
    ["delete", "/settings/value", { namespace, key: "enabled", scope: "workspace" }],
    ["post", "/settings/reset", { namespace, scope: "workspace" }],
    ["post", "/settings/definitions", { definitions: [{ namespace, key: "enabled", op: "retype", defaultJson: true }] }],
    ["post", "/settings/definitions", { definitions: [{ namespace: "core.execution", key: "mode", op: "rename", newNamespace: namespace }] }],
  ] as const) {
    assert.equal((await f.request(method, base + path, { body })).statusCode, 403);
  }
  assert.deepEqual(await f.values(), []);
});

test("generic mutations also refuse an alias to the protected grant, including reset", async () => {
  const f = await fixture();
  await f.repo.saveDefinition({ ...f.definition, settingId: "alias", namespace: "core.alias", key: "allow",
    status: "alias", aliasOfNamespace: namespace, aliasOfKey: "enabled" });
  for (const body of [{ namespace: "core.alias", key: "allow", scope: "workspace", valueJson: true },
    { namespace: "core.alias", scope: "workspace" }]) {
    assert.equal(await touchesAssistantSubagents({ body, repo: f.repo, workspaceId: "ws" }), true);
  }
  assert.equal((await f.request("put", base + "/settings/value", { body: { namespace: "core.alias", key: "allow", scope: "workspace", valueJson: true } })).statusCode, 403);
  assert.deepEqual(await f.values(), []);
});

test("unavailable/malformed reads never enable subagents", async () => {
  const f = await fixture();
  assert.equal(await readAssistantSubagentsEnabled({ ...f.deps, getEffective: async () => null }), false);
  const warnings: string[] = [];
  const failedRead = { ...f.deps, getEffective: async () => { throw new Error("settings store unavailable"); } };
  assert.equal(await readAssistantSubagentsEnabled(failedRead, { warn: message => warnings.push(message) }), false);
  assert.equal(await readAssistantSubagentsEnabled({ ...f.deps, settingsReady: Promise.reject(new Error("settings boot unavailable")) },
    { warn: message => warnings.push(message) }), false);
  assert.deepEqual(warnings, Array(2).fill("[agent-daemon] subagent settings unavailable; delegation remains OFF."));
  await assert.rejects(readAssistantSubagentsEnabled(failedRead, { readFailure: "throw" }), { message: "settings store unavailable" });
});


test("subagent acknowledgment receipt records owner, workspace, timestamp and grant before enable", async () => {
  const f = await fixture();
  assert.equal((await f.request("put", settingPath, { body: { enabled: true, riskAcknowledged: true } })).statusCode, 200);
  const receipt = (await f.repo.listActiveDefinitions({ workspaceId: null }))
    .find(def => def.namespace === namespace && def.key === "riskAcknowledgment")!;
  assert.ok(receipt);
  const revisions = (await f.repo.listRevisions({ settingId: receipt.settingId })).filter(row => row.entityKind === "value");
  assert.equal(revisions.length, 1);
  assert.deepEqual(revisions.map(row => [row.actor, row.workspaceId, row.scope, row.afterJson]),
    [["owner", "ws", "workspace", { riskAcknowledged: true, acknowledgedAt: f.deps.clock.nowIso(), grant: true }]]);
  assert.ok(revisions[0]!.seq < (await f.values())[0]!.seq, "receipt must precede the grant revision");
  await f.request("put", settingPath, { body: { enabled: false } });
  assert.equal((await f.repo.listRevisions({ settingId: receipt.settingId })).filter(row => row.entityKind === "value").length, 1);
});

test("HTTP read failure stays unknown instead of presenting a false OFF setting", async () => {
  const f = await fixture();
  f.deps.getEffective = async () => { throw new Error("settings store unavailable"); };
  const response = await f.request("get");
  assert.equal(response.statusCode, 500);
});
