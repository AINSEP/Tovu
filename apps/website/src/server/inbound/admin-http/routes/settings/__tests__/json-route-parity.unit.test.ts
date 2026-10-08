import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

import { DefinitionNotFoundError, ForbiddenError, InMemorySettingsRepo } from "#src/features/settings/index";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminSettingsClearRoute } from "../clear.js";
import { registerAdminSettingsGetEffectiveRoute } from "../get-effective.js";
import { registerAdminSettingsGetRawRoute } from "../get-raw.js";
import { registerAdminSettingsListDefinitionsRoute } from "../list-definitions.js";
import { registerAdminSettingsRegisterDefinitionsRoute } from "../register-definitions.js";
import { registerAdminSettingsResetRoute } from "../reset.js";
import { registerAdminSettingsSetRoute } from "../set.js";
import type { SettingsRouteDeps, SettingsRouteRegistrar } from "../deps.js";

const base = "/api/admin/v1/workspaces/:workspaceId/settings";
const routes: Array<{ registrar: SettingsRouteRegistrar; method: "get" | "post" | "put" | "delete"; path: string;
  permission: string; entityType: string; validationFirst?: boolean; validation?: string }> = [
  { registrar: registerAdminSettingsGetEffectiveRoute, method: "get", path: "/effective", permission: "settings.read", entityType: "setting-value" },
  { registrar: registerAdminSettingsGetRawRoute, method: "get", path: "/raw", permission: "settings.read.raw", entityType: "setting-value" },
  { registrar: registerAdminSettingsListDefinitionsRoute, method: "get", path: "/definitions", permission: "settings.read.definitions", entityType: "setting-definition" },
  { registrar: registerAdminSettingsRegisterDefinitionsRoute, method: "post", path: "/definitions", permission: "settings.definitions.manage", entityType: "setting-definition" },
  { registrar: registerAdminSettingsSetRoute, method: "put", path: "/value", permission: "settings.workspace.write", entityType: "setting-value", validationFirst: true,
    validation: "namespace, key, scope (global|workspace|user), and valueJson are required" },
  { registrar: registerAdminSettingsClearRoute, method: "delete", path: "/value", permission: "settings.workspace.write", entityType: "setting-value", validationFirst: true,
    validation: "namespace, key, and scope (global|workspace|user) are required" },
  { registrar: registerAdminSettingsResetRoute, method: "post", path: "/reset", permission: "settings.reset.workspace", entityType: "setting-namespace", validationFirst: true,
    validation: "namespace and scope (global|workspace|user) are required" },
];

/** Direct transport fixtures use the real repository; injected authorization records its effects. */
function harness(route: typeof routes[number], options: { ready?: Promise<void>; allowed?: boolean; principal?: boolean; repo?: InMemorySettingsRepo } = {}) {
  const calls: unknown[] = [];
  let id = 0;
  const deps = {
    workspaceId: "workspace-local", settingsReady: options.ready ?? Promise.resolve(),
    settingsRepo: options.repo ?? new InMemorySettingsRepo(),
    clock: { nowIso: () => "2026-10-07T00:00:00.000Z", nowMs: () => Date.parse("2026-10-07T00:00:00.000Z") }, idGen: { newId: () => `setting-${++id}` },
    principalRepo: { findById: async () => null },
    authorize: async (input: unknown) => { calls.push(input); return { allowed: options.allowed ?? false, reason: "no_grant" }; },
  } as unknown as SettingsRouteDeps;
  const app = express();
  route.registrar(app, deps);
  const handler = extractRouteHandler(app, route.method, base + route.path);
  return {
    calls, deps,
    async request(input: { workspaceId?: string; body?: unknown; query?: Record<string, unknown> } = {}) {
      const { res, capture } = createCapturingResponse();
      if (options.principal !== false) res.locals.principal = { id: "caller" };
      await handler({ params: { workspaceId: input.workspaceId ?? "workspace-local" }, body: input.body, query: input.query ?? {} }, res);
      return capture;
    },
  };
}

for (const route of routes) {
  const label = `${route.method.toUpperCase()} ${route.path}`;
  test(`${label}: foreign path is 404 before readiness, authentication, authorization or validation`, { timeout: 1000 }, async () => {
    // An unresolved readiness promise would hang this request if the workspace guard moved later.
    const fixture = harness(route, { ready: new Promise<void>(() => {}), principal: false });
    assert.deepEqual(await fixture.request({ workspaceId: "workspace-other" }), {
      statusCode: 404, jsonBody: { error: "workspace was not found" },
    });
    assert.deepEqual(fixture.calls, []);
  });

  test(`${label}: preserves ${route.validationFirst ? "400 before 403" : "403 before 400"} and the exact envelope`, async () => {
    const fixture = harness(route);
    const response = await fixture.request();
    if (route.validationFirst) {
      assert.deepEqual(response, { statusCode: 400, jsonBody: { error: route.validation, code: "VALIDATION_ERROR" } });
      assert.deepEqual(fixture.calls, []);
    } else {
      assert.deepEqual(response, { statusCode: 403, jsonBody: {
        error: `principal 'caller' is not authorized for '${route.permission}' (no_grant)`, code: "FORBIDDEN",
        details: { permission: route.permission, reason: "no_grant" },
      } });
      assert.deepEqual(fixture.calls, [{ principalId: "caller", permission: route.permission, workspaceId: "workspace-local", entityType: route.entityType }]);
    }
  });

  test(`${label}: readiness rejection preserves the fixed 500 without disclosing its message`, async () => {
    const fixture = harness(route, { ready: Promise.reject(new Error("private readiness diagnostic")) });
    assert.deepEqual(await fixture.request(), { statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" } });
    assert.deepEqual(fixture.calls, []);
  });

  test(`${label}: missing session principal remains a fixed 500`, async () => {
    const fixture = harness(route, { principal: false });
    assert.deepEqual(await fixture.request(), { statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" } });
    assert.deepEqual(fixture.calls, []);
  });

  test(`${label}: readiness settles before any authorization`, async () => {
    let release!: () => void;
    const fixture = harness(route, { ready: new Promise<void>((resolve) => { release = resolve; }) });
    const response = fixture.request({ body: { namespace: "site.parity", key: "theme", scope: "workspace", valueJson: null } });
    // Drain the adapter's asynchronous ports before observing the still-pending readiness gate.
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(fixture.calls, []);
    release();
    assert.equal((await response).statusCode, 403);
    assert.deepEqual(fixture.calls, [{ principalId: "caller", permission: route.permission, workspaceId: "workspace-local", entityType: route.entityType }]);
  });
}

for (const route of routes.filter((r) => r.validationFirst)) {
  test(`${route.method.toUpperCase()} ${route.path}: foreign body is 400 before denied authorization for every scope`, async () => {
    for (const scope of ["global", "workspace", "user"]) {
      const fixture = harness(route);
      assert.deepEqual(await fixture.request({ body: { namespace: "site.parity", key: "theme", scope, valueJson: null, workspaceId: "workspace-other" } }), {
        statusCode: 400, jsonBody: { error: "workspaceId 'workspace-other' does not match this route's workspace; a settings write cannot target another workspace", code: "VALIDATION_ERROR" },
      });
      assert.deepEqual(fixture.calls, []);
      assert.equal(await fixture.deps.settingsRepo.maxRevisionSeq(), 0);
    }
  });
}

for (const method of ["put", "delete"] as const) {
  test(`${method.toUpperCase()} /value: mapped domain errors keep their status, code and message`, async () => {
    const route = routes.find((r) => r.method === method)!;
    const fixture = harness(route, { ready: Promise.reject(new DefinitionNotFoundError("definition 'site.parity.theme' was not found")) });
    assert.deepEqual(await fixture.request(), { statusCode: 404, jsonBody: { error: "definition 'site.parity.theme' was not found", code: "DEFINITION_NOT_FOUND" } });
  });
}

test("POST /reset: thrown authorization errors keep the mapped 403 envelope", async () => {
  const fixture = harness(routes.find((r) => r.path === "/reset")!, { ready: Promise.reject(new ForbiddenError("reset was denied")) });
  assert.deepEqual(await fixture.request(), { statusCode: 403, jsonBody: { error: "reset was denied", code: "FORBIDDEN" } });
});

test("GET /raw: authorization precedes a missing definition's 404", async () => {
  const fixture = harness(routes.find((r) => r.path === "/raw")!, { allowed: true });
  assert.deepEqual(await fixture.request({ query: { namespace: "site.parity", key: "missing", workspaceId: "workspace-other" } }), {
    statusCode: 404, jsonBody: { error: "definition 'site.parity.missing' was not found", code: "DEFINITION_NOT_FOUND" },
  });
  assert.equal(fixture.calls.length, 1);
});

test("GET /definitions: success retains the flat data envelope", async () => {
  const fixture = harness(routes.find((r) => r.path === "/definitions" && r.method === "get")!, { allowed: true });
  assert.deepEqual(await fixture.request(), { statusCode: 200, jsonBody: { data: [] } });
});

test("PUT /value: present falsy values still pass field validation", async () => {
  const route = routes.find((r) => r.method === "put")!;
  for (const valueJson of [null, false, 0, "", undefined]) {
    const fixture = harness(route);
    assert.deepEqual(await fixture.request({ body: { namespace: "site.parity", key: "theme", scope: "workspace", valueJson } }), {
      statusCode: 403, jsonBody: { error: "principal 'caller' is not authorized for 'settings.workspace.write' (no_grant)", code: "FORBIDDEN",
        details: { permission: "settings.workspace.write", reason: "no_grant" } },
    });
    assert.deepEqual(fixture.calls, [{ principalId: "caller", permission: "settings.workspace.write", workspaceId: "workspace-local", entityType: "setting-value" }]);
  }
});

test("GET /effective and /raw: another principal needs a second grant and keeps the exact denial", async () => {
  for (const path of ["/effective", "/raw"]) {
    const fixture = harness(routes.find((r) => r.path === path)!, { allowed: true });
    const authorize = fixture.deps.authorize;
    fixture.deps.authorize = async (input) => {
      const result = await authorize(input);
      if (input.permission === "settings.user.read") return { allowed: false, reason: "cross_principal_denied" };
      return result;
    };
    assert.deepEqual(await fixture.request({ query: { namespace: "site.parity", key: "theme", principalId: "other", workspaceId: "workspace-other" } }), {
      statusCode: 403, jsonBody: { error: "principal 'caller' is not authorized to read another principal's user-layer value (cross_principal_denied)",
        code: "FORBIDDEN", details: { permission: "settings.user.read", reason: "cross_principal_denied" } },
    });
    assert.equal(fixture.calls.length, 2);
    assert.deepEqual(fixture.calls[1], { principalId: "caller", permission: "settings.user.read", workspaceId: "workspace-local", entityType: "setting-value" });
    assert.equal(await fixture.deps.settingsRepo.maxRevisionSeq(), 0);
  }
});

test("all JSON successes retain their payloads and mutations retain the inner authorization check", async () => {
  const repo = new InMemorySettingsRepo();
  const namespace = "site.json-success-parity";
  const invoke = (method: typeof routes[number]["method"], path: string) => harness(routes.find((r) => r.method === method && r.path === path)!, { allowed: true, repo });
  const definitions = invoke("post", "/definitions");
  assert.deepEqual(await definitions.request({ body: { definitions: [{ namespace, key: "theme", ownerKind: "site", schemaJson: { type: "string" }, defaultJson: "default", scopes: 2 }] } }), {
    statusCode: 200, jsonBody: { applied: [{ key: `${namespace}.theme`, op: "register", status: "applied" }] },
  });
  assert.equal(definitions.calls.length, 2);
  const value = invoke("put", "/value");
  assert.deepEqual(await value.request({ body: { namespace, key: "theme", scope: "workspace", valueJson: "override" } }), {
    statusCode: 200, jsonBody: { key: `${namespace}.theme`, scope: "workspace", value: "override", revisionSeq: 2 },
  });
  assert.equal(value.calls.length, 2);
  assert.deepEqual(await invoke("get", "/raw").request({ query: { namespace, key: "theme", workspaceId: "workspace-other" } }), {
    statusCode: 200, jsonBody: { key: `${namespace}.theme`, global: null, workspace: "override", user: null, default: "default" },
  });
  assert.deepEqual(await invoke("get", "/effective").request({ query: { namespace, workspaceId: "workspace-other" } }), {
    statusCode: 200, jsonBody: { data: [{ key: "theme", value: "override", sourceLayer: "workspace", defVersion: 1 }] },
  });
  assert.deepEqual(await invoke("get", "/definitions").request(), {
    statusCode: 200, jsonBody: { data: [{ namespace, key: "theme", ownerKind: "site", scopes: 2, status: "active", version: 1 }] },
  });
  const clear = invoke("delete", "/value");
  assert.deepEqual(await clear.request({ body: { namespace, key: "theme", scope: "workspace" } }), {
    statusCode: 200, jsonBody: { key: `${namespace}.theme`, scope: "workspace", value: null, revisionSeq: 3 },
  });
  assert.equal(clear.calls.length, 2);
  const reset = invoke("post", "/reset");
  assert.deepEqual(await reset.request({ body: { namespace, scope: "workspace" } }), {
    statusCode: 200, jsonBody: { namespace, clearedCount: 1, revisionSeqs: [4] },
  });
  assert.equal(reset.calls.length, 2);
  assert.equal(await repo.maxRevisionSeq(), 4);
});
