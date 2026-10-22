import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { visitorSettingsFixture, ws, off } from "#src/features/settings/__tests__/visitor-tools.fixture";
import { buildSettingsRegistrations, type SettingsToolDeps } from "#src/features/settings/tool-registrations";
import { createSettingsPrincipalLookup } from "#src/features/settings/index";
import { VISITOR_TOOLS_SETTING } from "#src/contracts/site-assistant/visitor-tools";
import { registerAdminSettingsClearRoute } from "../clear.js";
import { registerAdminSettingsResetRoute } from "../reset.js";
import { registerAdminSettingsSetRoute } from "../set.js";
import { registerAdminSettingsRegisterDefinitionsRoute } from "../register-definitions.js";
import type { SettingsRouteDeps } from "../deps.js";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";

const base = "/api/admin/v1/workspaces/:workspaceId/settings";

async function fixture() {
  const f = await visitorSettingsFixture();
  await f.write();
  f.grants.clear();
  for (const permission of ["settings.read", "settings.workspace.write", "settings.global.write", "settings.reset.workspace", "settings.reset.global", "settings.definitions.manage"]) f.grants.add(permission);
  const canonical = (await f.repo.findActiveDefinition({ ...VISITOR_TOOLS_SETTING, workspaceId: ws }))!;
  await f.repo.saveDefinition({ ...canonical, settingId: "visitor-tools-alias", namespace: "site.legacy", key: "tools", status: "alias",
    aliasOfNamespace: canonical.namespace, aliasOfKey: canonical.key });
  const principalRepo = { findById: async ({ workspaceId, id }: { workspaceId: string; id: string }) => ({ workspaceId, id, status: "active" }) };
  const deps = { workspaceId: ws, settingsReady: Promise.resolve(), settingsRepo: f.repo, clock: { nowMs: () => 0, nowIso: () => "1970-01-01T00:00:00.000Z" },
    idGen: f.deps.ids, authorize: f.deps.authorize, principalRepo } as unknown as SettingsRouteDeps;
  const app = express();
  registerAdminSettingsClearRoute(app, deps);
  registerAdminSettingsResetRoute(app, deps);
  registerAdminSettingsSetRoute(app, deps);
  registerAdminSettingsRegisterDefinitionsRoute(app, deps);
  return { ...f, deps, principalRepo,
    async request(method: "put" | "delete" | "post", path: string, body: unknown) {
      const { res, capture } = createCapturingResponse();
      res.locals.principal = { id: "settings-admin" };
      await extractRouteHandler(app, method, base + path)({ params: { workspaceId: ws }, body, query: {} }, res);
      return capture;
    },
  };
}

for (const coordinates of [VISITOR_TOOLS_SETTING, { namespace: "site.legacy", key: "tools" }]) {
  for (const op of ["register", "rename", "retype", "deprecate", "tombstone"]) {
    test(`definition ${op} cannot move or alter protected ${coordinates.namespace}.${coordinates.key}`, async () => {
      const f = await fixture();
      const before = await f.repo.maxRevisionSeq();
      const response = await f.request("post", "/definitions", { definitions: [
        { op: "register", namespace: "site.unrelated", key: "untouched", ownerKind: "site", schemaJson: { type: "string" }, defaultJson: "", scopes: 2 },
        { ...coordinates, op, ownerKind: "site", newNamespace: "site.renamed", newKey: "tools", schemaJson: { type: "string" }, defaultJson: "", scopes: 2 },
      ] });
      assert.equal(response.statusCode, 400);
      assert.match(JSON.stringify(response.jsonBody), /definitions are code-owned/);
      assert.equal(await f.repo.maxRevisionSeq(), before, "the fence checks the entire batch before any item writes");
      assert.equal(await f.repo.findActiveDefinition({ namespace: "site.unrelated", key: "untouched", workspaceId: ws }), null);
      assert.equal((await f.read())?.tools.list_categories.mode, "off");
    });
  }
}

test("a definition cannot be renamed into the visitor namespace", async () => {
  const f = await fixture();
  const before = await f.repo.maxRevisionSeq();
  const response = await f.request("post", "/definitions", { definitions: [{ op: "rename", namespace: "site.other", key: "tools", ownerKind: "site", newNamespace: VISITOR_TOOLS_SETTING.namespace, newKey: VISITOR_TOOLS_SETTING.key }] });
  assert.equal(response.statusCode, 400);
  assert.equal(await f.repo.maxRevisionSeq(), before);
});

for (const coordinates of [VISITOR_TOOLS_SETTING, { namespace: "site.legacy", key: "tools" }]) {
  for (const [method, path] of [["put", "/value"], ["delete", "/value"], ["post", "/reset"]] as const) {
    test(`generic HTTP ${method} ${coordinates.namespace}.${coordinates.key} is denied before a write`, async () => {
      const f = await fixture();
      const before = await f.repo.maxRevisionSeq();
      const response = await f.request(method, path, { ...coordinates, scope: "workspace", valueJson: { version: 1, tools: {} } });
      assert.equal(response.statusCode, 403);
      assert.match(JSON.stringify(response.jsonBody), /visitor-tools management service/);
      assert.equal(await f.repo.maxRevisionSeq(), before);
      assert.equal((await f.read())?.tools.list_categories.mode, "off");
    });
  }
}

for (const toolId of ["settings_set_value", "settings_clear_value"]) {
  test(`${toolId} denies canonical and alias writes without opening a card`, async () => {
    const f = await fixture();
    const clock = { nowMs: () => 0 };
    const surfaces = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock, idGenerator: f.deps.ids, defaultChannel: "mcp-ui" });
    const deps = { ...f.deps, settingsRepo: f.repo, workspaceId: ws, clock, idGen: f.deps.ids,
      principalRepo: f.principalRepo, principals: createSettingsPrincipalLookup({ repo: f.principalRepo as never }),
      settingsReady: Promise.resolve(), settingsUiTabsReady: Promise.resolve() } as unknown as SettingsToolDeps;
    const registration = buildSettingsRegistrations(deps, { surfaceExchanges: surfaces }).find(r => r.descriptor.id === toolId)!;
    assert.ok(registration);
    const before = await f.repo.maxRevisionSeq();
    for (const coordinates of [VISITOR_TOOLS_SETTING, { namespace: "site.legacy", key: "tools" }]) {
      // MOVE: Clear rejects a value field before policy checks, so give each tool valid input.
      await assert.rejects(registration.handler({ executionId: "e", principal: { id: "settings-admin" }, run: { id: "r" }, signal: new AbortController().signal,
        input: { ...coordinates, ...(toolId === "settings_set_value" ? { value: off } : {}) } }), /visitor-tools management service/);
    }
    assert.equal(surfaces.size(), 0);
    assert.equal(await f.repo.maxRevisionSeq(), before);
  });
}
