import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import {
  InMemoryPolicyPermissionRepo, InMemoryPolicyRepo, InMemoryPrincipalPolicyRepo, InMemoryPrincipalRepo,
  InMemoryPrincipalRoleRepo, InMemoryRolePolicyRepo, InMemoryRoleRepo, InMemorySessionRepo, InMemoryUserRepo,
} from "@jini-ai/cms/identity";
import { InMemoryApiKeyRepo } from "#src/features/identity/repo.memory";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import type { ApiKeysRouteDeps, ApiKeysRouteRegistrar } from "../deps.js";
import { registerAdminApiKeyPrincipalCreateRoute } from "../create-principal.js";
import { registerAdminApiKeyIssueRoute } from "../issue.js";
import { registerAdminApiKeyRevokeRoute } from "../revoke.js";

const NOW = "2026-09-15T01:02:03Z";

async function depsForHandler(): Promise<ApiKeysRouteDeps> {
  let id = 0;
  const deps = {
    workspaceId: "ws-7", clock: { nowIso: () => NOW }, idGen: { newId: () => `new-${++id}` },
    principalRepo: new InMemoryPrincipalRepo(), userRepo: new InMemoryUserRepo(), sessionRepo: new InMemorySessionRepo(),
    roleRepo: new InMemoryRoleRepo(), policyRepo: new InMemoryPolicyRepo(), policyPermissionRepo: new InMemoryPolicyPermissionRepo(),
    rolePolicyRepo: new InMemoryRolePolicyRepo(), principalRoleRepo: new InMemoryPrincipalRoleRepo(), principalPolicyRepo: new InMemoryPrincipalPolicyRepo(),
    apiKeyRepo: new InMemoryApiKeyRepo(),
  } as ApiKeysRouteDeps;
  await deps.principalRepo.save({ id: "operator-9", workspaceId: "ws-7", kind: "user", displayName: "Operator", status: "active", createdAt: NOW });
  await deps.principalRepo.save({ id: "machine-3", workspaceId: "ws-7", kind: "api_key", displayName: "Exporter", status: "active", createdAt: NOW });
  await deps.policyRepo.save({ id: "manage-keys", workspaceId: "ws-7", name: "Manage keys", isBuiltin: false, isFrozen: false });
  await deps.policyPermissionRepo.save({ id: "manage-permission", workspaceId: "ws-7", policyId: "manage-keys", permission: "apikey.manage", resourceType: null, constraintJson: null });
  await deps.principalPolicyRepo.save({ id: "operator-grant", workspaceId: "ws-7", principalId: "operator-9", policyId: "manage-keys" });
  return deps;
}

async function invoke(register: ApiKeysRouteRegistrar, deps: ApiKeysRouteDeps, path: string, body: unknown, params: unknown = {}) {
  const app = express();
  register(app, deps);
  const handler = extractRouteHandler(app, "post", path);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "operator-9" };
  res.locals.authCredentialKind = "session";
  res.end = (() => res) as typeof res.end;
  await handler({ body, params }, res);
  return capture;
}

const fail = async () => { throw new Error("db fault /private/keys.db with raw secret"); };

// F3.4/F4.4: real route + service + permission repositories; only the failed I/O is replaced.
// The observed calls prove each request reached its intended failure, rather than another guard.
test("API-key principal create redacts a persistence failure after a valid request", async (t) => {
  const deps = await depsForHandler();
  const fault = t.mock.method(deps.principalRepo, "save", fail);
  const capture = await invoke(registerAdminApiKeyPrincipalCreateRoute, deps, "/api/admin/v1/api-keys/principals", { displayName: "Nightly Export" });
  assert.deepEqual(capture, { statusCode: 500, jsonBody: { error: "internal error" } });
  assert.deepEqual(fault.mock.calls.map(({ arguments: args }) => args), [[{
    id: "new-1", workspaceId: "ws-7", kind: "api_key", displayName: "Nightly Export", status: "active", createdAt: NOW,
  }]]);
  assert.equal(await deps.principalRepo.findById({ workspaceId: "ws-7", id: "new-1" }), null);
});

test("API-key issuance redacts an unexpected target lookup failure", async (t) => {
  const deps = await depsForHandler();
  const find = deps.principalRepo.findById.bind(deps.principalRepo);
  const fault = t.mock.method(deps.principalRepo, "findById", async (input) => input.id === "machine-3" ? fail() : find(input));
  const capture = await invoke(registerAdminApiKeyIssueRoute, deps, "/api/admin/v1/api-keys", {
    principalId: "machine-3", label: "Export", policyIds: ["manage-keys"], expiresAt: "2027-01-01T00:00:00Z",
  });
  assert.deepEqual(capture, { statusCode: 500, jsonBody: { error: "internal error" } });
  assert.deepEqual(fault.mock.calls.filter(({ arguments: args }) => args[0].id === "machine-3").map(({ arguments: args }) => args), [[{ workspaceId: "ws-7", id: "machine-3" }]]);
  assert.deepEqual(await deps.principalPolicyRepo.listByPrincipalId({ workspaceId: "ws-7", principalId: "machine-3" }), []);
});

test("API-key revoke redacts an unexpected key lookup failure", async (t) => {
  const deps = await depsForHandler();
  const fault = t.mock.method(deps.apiKeyRepo, "findById", fail);
  const capture = await invoke(registerAdminApiKeyRevokeRoute, deps, "/api/admin/v1/api-keys/:id/revoke", {}, { id: "key-5" });
  assert.deepEqual(capture, { statusCode: 500, jsonBody: { error: "internal error" } });
  assert.deepEqual(fault.mock.calls.map(({ arguments: args }) => args), [[{ workspaceId: "ws-7", id: "key-5" }]]);
});

test("revoking an unknown key returns RESOURCE_NOT_FOUND rather than a success receipt", async () => {
  const deps = await depsForHandler();
  const capture = await invoke(registerAdminApiKeyRevokeRoute, deps, "/api/admin/v1/api-keys/:id/revoke", {}, { id: "key-missing" });
  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "api key 'key-missing' was not found", code: "RESOURCE_NOT_FOUND" } });
  assert.equal(await deps.apiKeyRepo.findById({ workspaceId: "ws-7", id: "key-missing" }), null);
});
