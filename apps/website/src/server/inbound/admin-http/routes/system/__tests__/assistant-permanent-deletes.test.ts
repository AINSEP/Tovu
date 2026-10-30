import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { InMemorySettingsRepo, ensureSettingDefinitions, getEffective } from "@jini-ai/core/settings";
import { ensureExecutionSettingDefinitions } from "#src/assistant/execution-mode-settings";
import { readAssistantPermanentDeletesPolicy } from "#src/assistant/permanent-delete-settings";
import { ASSISTANT_PERMANENT_DELETES_NAMESPACE as namespace, PERMANENT_DELETE_TOOLS } from "#src/contracts/headless/index";
import { registerAdminAssistantPermanentDeletesRoutes } from "../assistant-permanent-deletes.js";
import { registerAdminSettingsSetRoute } from "../../settings/set.js";
import { registerAdminSettingsClearRoute } from "../../settings/clear.js";
import { registerAdminSettingsResetRoute } from "../../settings/reset.js";
import { registerAdminSettingsRegisterDefinitionsRoute } from "../../settings/register-definitions.js";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
const base = "/api/admin/v1/workspaces/:workspaceId";
const path = base + "/system/assistant-permanent-deletes";
async function fixture() {
  let id = 0;
  const repo = new InMemorySettingsRepo();
  const clock = { nowMs: () => 1_791_504_000_000, nowIso: () => "2026-10-09T00:00:00.000Z" };
  const ids = { newId: () => `pdel-${++id}` };
  await ensureExecutionSettingDefinitions({ settingsRepo: repo, clock, ids,
    principals: { findActiveById: async () => null }, ensureSettingDefinitions }, { systemPrincipalId: "system" });
  const deps = { workspaceId: "ws", settingsReady: Promise.resolve(), settingsUiTabsReady: Promise.resolve(),
    settingsRepo: repo, clock, idGen: ids, getEffective, ownerPrincipalId: Promise.resolve("owner"),
    principalRepo: { findById: async () => null }, authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as Parameters<typeof registerAdminAssistantPermanentDeletesRoutes>[0]["deps"];
  const app = express();
  registerAdminAssistantPermanentDeletesRoutes({ app, deps });
  registerAdminSettingsSetRoute(app, deps); registerAdminSettingsClearRoute(app, deps);
  registerAdminSettingsResetRoute(app, deps); registerAdminSettingsRegisterDefinitionsRoute(app, deps);
  const definitions = (await repo.listActiveDefinitions({ workspaceId: null })).filter(def => def.namespace === namespace);
  const policyDefinition = definitions.find(def => def.key === "policy")!;
  const receiptDefinition = definitions.find(def => def.key === "riskAcknowledgment")!;
  return { repo, deps, definitions, policyDefinition,
    revisions: () => repo.listRevisions({ settingId: policyDefinition.settingId }),
    receipts: () => repo.listRevisions({ settingId: receiptDefinition.settingId }),
    read: () => readAssistantPermanentDeletesPolicy(deps),
    async request(method: "get" | "put" | "post" | "delete", body?: unknown, principal = "owner", routePath = path, workspaceId = "ws") {
      const { res, capture } = createCapturingResponse(); res.locals.principal = { id: principal };
      await extractRouteHandler(app, method, routePath)({ params: { workspaceId }, body, query: {} }, res);
      return capture;
    },
  };
}
test("per-site default OFF and non-owner read visibility", async () => {
  const f = await fixture();
  assert.deepEqual(await f.read(), { enabled: false, allowedToolIds: [] });
  assert.deepEqual((await f.request("get", undefined, "admin")).jsonBody, { enabled: false, allowedToolIds: [], canEdit: false });
  assert.equal(f.policyDefinition.scopes, 2);
  assert.equal((await f.request("get", undefined, "owner", path, "other")).statusCode, 404);
});
test("owner enable records acknowledgment; checkbox writes and disable are audited and preserve the list", async () => {
  const f = await fixture();
  assert.equal((await f.request("put", { enabled: true, allowedToolIds: ["trash_empty"] })).statusCode, 400);
  assert.equal((await f.request("put", { enabled: true, allowedToolIds: ["trash_empty"], riskAcknowledged: true })).statusCode, 200);
  assert.equal((await f.request("put", { enabled: true, allowedToolIds: ["trash_empty", "external_mcp_delete"] })).statusCode, 200);
  assert.equal((await f.request("put", { enabled: false, allowedToolIds: ["trash_empty", "external_mcp_delete"] })).statusCode, 200);
  assert.deepEqual(await f.read(), { enabled: false, allowedToolIds: ["trash_empty", "external_mcp_delete"] });
  const revisions = (await f.revisions()).filter(row => row.entityKind === "value");
  assert.deepEqual(revisions.map(row => [row.actor, row.workspaceId, row.afterJson]), [
    ["owner", "ws", { enabled: true, allowedToolIds: ["trash_empty"] }],
    ["owner", "ws", { enabled: true, allowedToolIds: ["trash_empty", "external_mcp_delete"] }],
    ["owner", "ws", { enabled: false, allowedToolIds: ["trash_empty", "external_mcp_delete"] }],
  ]);
  const receipts = (await f.receipts()).filter(row => row.entityKind === "value");
  assert.deepEqual(receipts.map(row => row.afterJson), [{ riskAcknowledged: true, acknowledgedAt: f.deps.clock.nowIso(), grant: { enabled: true, allowedToolIds: ["trash_empty"] } }]);
  assert.equal(receipts[0]!.actor, "owner");
});
test("non-owner writes and invalid/mixed/forbidden selections create no value or acknowledgment revision", async () => {
  const f = await fixture();
  for (const enabled of [true, false]) assert.equal((await f.request("put", { enabled, allowedToolIds: [], riskAcknowledged: true }, "admin")).statusCode, 403);
  for (const allowedToolIds of [["unknown"], ["workspace_delete"], ["collections_execute_cleanup"], ["trash_empty", "workspace_delete"], ["trash_empty", "trash_empty"], "trash_empty", [3]]) {
    assert.equal((await f.request("put", { enabled: true, allowedToolIds, riskAcknowledged: true })).statusCode, 400);
  }
  assert.equal((await f.request("put", { enabled: true, allowedToolIds: PERMANENT_DELETE_TOOLS.map(tool => tool.id), riskAcknowledged: "true" })).statusCode, 400);
  assert.equal((await f.revisions()).filter(row => row.entityKind === "value").length, 0);
  assert.equal((await f.receipts()).filter(row => row.entityKind === "value").length, 0);
});
test("generic mutations cannot edit the policy or acknowledgment, including alias/reset and mixed definition batches", async () => {
  const f = await fixture();
  for (const [method, suffix, body] of [
    ["put", "/settings/value", { namespace, key: "policy", scope: "workspace", valueJson: { enabled: true, allowedToolIds: ["trash_empty"] } }],
    ["delete", "/settings/value", { namespace, key: "riskAcknowledgment", scope: "workspace" }],
    ["post", "/settings/reset", { namespace, scope: "workspace" }],
    ["post", "/settings/definitions", { definitions: [{ namespace: "core.custom", key: "ordinary", op: "add", defaultJson: true }, { namespace: "core.execution", key: "mode", op: "rename", newNamespace: namespace }] }],
  ] as const) assert.equal((await f.request(method, body, "owner", base + suffix)).statusCode, 403);
  await f.repo.saveDefinition({ ...f.policyDefinition, settingId: "alias", namespace: "core.alias", key: "allow",
    status: "alias", aliasOfNamespace: namespace, aliasOfKey: "policy" });
  assert.equal((await f.request("put", { namespace: "core.alias", key: "allow", scope: "workspace", valueJson: {} }, "owner", base + "/settings/value")).statusCode, 403);
  assert.equal((await f.request("post", { namespace: "core.alias", scope: "workspace" }, "owner", base + "/settings/reset")).statusCode, 403);
  assert.equal((await f.revisions()).filter(row => row.entityKind === "value").length, 0);
  assert.equal((await f.repo.listActiveDefinitions({ workspaceId: "ws" })).some(def => def.namespace === "core.custom"), false);
});
test("malformed or unavailable ledger cannot grant delete access", async () => {
  const f = await fixture();
  for (const value of [null, true, { enabled: true, allowedToolIds: ["workspace_delete"] }]) {
    assert.deepEqual(await readAssistantPermanentDeletesPolicy({ ...f.deps, getEffective: async () => ({ value, sourceLayer: "workspace", defVersion: 1 }) }), { enabled: false, allowedToolIds: [] });
  }
  await assert.rejects(readAssistantPermanentDeletesPolicy({ ...f.deps, getEffective: async () => { throw new Error("store unavailable"); } }), { message: "store unavailable" });
});
