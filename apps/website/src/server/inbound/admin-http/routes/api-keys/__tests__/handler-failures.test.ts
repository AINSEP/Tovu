import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import { createTransactionalInMemoryIdentityRepos, NodeSessionTokens } from "@jini-ai/user-management/server";
import { InMemoryPolicyPermissionRepo, InMemoryPolicyRepo, InMemoryPrincipalPolicyRepo, InMemoryPrincipalRepo, InMemoryPrincipalRoleRepo, InMemoryRolePolicyRepo, InMemoryRoleRepo, InMemorySessionRepo, InMemoryUserRepo } from "@jini-ai/user-management/server";
import { InMemoryApiKeyRepo } from "#src/features/identity/repo.memory";
import { createSettingsPrincipalLookup } from "#src/features/settings/index";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import type { ApiKeysRouteDeps, ApiKeysRouteRegistrar } from "../deps.js";
import { registerAdminApiKeyPrincipalCreateRoute } from "../create-principal.js";
import { registerAdminApiKeyIssueRoute } from "../issue.js";
import { registerAdminApiKeyRevokeRoute } from "../revoke.js";

const NOW = "2026-09-15T01:02:03.000Z";

async function depsForHandler(): Promise<ApiKeysRouteDeps> {
  let id = 0;
  const repos = createTransactionalInMemoryIdentityRepos({ repos: {
    principals: new InMemoryPrincipalRepo({}), users: new InMemoryUserRepo({}), sessions: new InMemorySessionRepo({}),
    roles: new InMemoryRoleRepo({}), policies: new InMemoryPolicyRepo({}), policyPermissions: new InMemoryPolicyPermissionRepo({}),
    rolePolicies: new InMemoryRolePolicyRepo({}), principalRoles: new InMemoryPrincipalRoleRepo({}), principalPolicies: new InMemoryPrincipalPolicyRepo({}),
  } });
  const deps: ApiKeysRouteDeps = {
    workspaceId: "ws-7", clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW) }, idGen: { newId: () => `new-${++id}` },
    // RouteDeps' principalRepo also carries the settings lookup port; bind it the way app.ts does.
    principalRepo: Object.assign(repos.principals, createSettingsPrincipalLookup({ repo: repos.principals })), userRepo: repos.users, sessionRepo: repos.sessions,
    roleRepo: repos.roles, policyRepo: repos.policies, policyPermissionRepo: repos.policyPermissions,
    rolePolicyRepo: repos.rolePolicies, principalRoleRepo: repos.principalRoles, principalPolicyRepo: repos.principalPolicies,
    transactions: repos.transactions, tokens: new NodeSessionTokens({}),
    passwordHasher: { hash: async ({ password }) => password, verify: async ({ hash, password }) => hash === password },
    apiKeySecretHasher: { hash: async (secret) => secret, verify: async (hash, secret) => hash === secret },
    apiKeyRepo: new InMemoryApiKeyRepo(),
  };
  await deps.principalRepo.save({ id: "operator-9", workspaceId: "ws-7", kind: "user", displayName: "Operator", status: "active", createdAt: NOW });
  await deps.principalRepo.save({ id: "machine-3", workspaceId: "ws-7", kind: "api_key", displayName: "Exporter", status: "active", createdAt: NOW });
  await deps.policyRepo.save({ id: "manage-keys", workspaceId: "ws-7", name: "Manage keys", isBuiltin: false, isFrozen: false });
  await deps.policyPermissionRepo.save({ id: "manage-permission", workspaceId: "ws-7", policyId: "manage-keys", permission: "apikey.manage", resourceType: null, constraintJson: null });
  await deps.principalPolicyRepo.save({ id: "operator-grant", workspaceId: "ws-7", principalId: "operator-9", policyId: "manage-keys" });
  return deps;
}

async function invoke(register: ApiKeysRouteRegistrar, deps: ApiKeysRouteDeps, path: string, body: unknown, params: unknown = {}, credentialKind = "session") {
  const app = express();
  register(app, deps);
  const handler = extractRouteHandler(app, "post", path);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "operator-9" };
  res.locals.authCredentialKind = credentialKind;
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
  const fault = t.mock.method(deps.principalRepo, "findById", async (input: Parameters<typeof find>[0]) => input.id === "machine-3" ? fail() : find(input));
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

/**
 * `String(req.params.id ?? "")` (extractRouteHandler's own doc, `helpers/http-test-server.ts`): Express
 * guarantees a matched `:id` is always populated, so the right side of that `??` is unreachable through
 * any real HTTP request. Restored 2026-09-03 after being wrongly deleted as "unreachable dead code" --
 * the repo's established answer is to KEEP the guard and exercise it with a hand-built `req` that
 * deliberately violates that contract.
 */
test("API-key revoke: `req.params.id ?? \"\"` fallback, forced via a direct handler call, looks up the empty id and answers the ordinary not-found", async (t) => {
  const deps = await depsForHandler();
  const lookup = t.mock.method(deps.apiKeyRepo, "findById");
  const capture = await invoke(registerAdminApiKeyRevokeRoute, deps, "/api/admin/v1/api-keys/:id/revoke", {}, {});
  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "api key '' was not found", code: "RESOURCE_NOT_FOUND" } });
  assert.deepEqual(lookup.mock.calls.map(({ arguments: args }) => args), [[{ workspaceId: "ws-7", id: "" }]]);
});

// F6 fix wave (L12 Stryker top-10: `req.body?.x` → `req.body.x` survived): a request with NO parsed body
// is a 400 validation refusal through the service, never a TypeError 500, and writes nothing.
for (const [label, register, path] of [
  ["API-key issuance", registerAdminApiKeyIssueRoute, "/api/admin/v1/api-keys"],
  ["API-key principal create", registerAdminApiKeyPrincipalCreateRoute, "/api/admin/v1/api-keys/principals"],
] as const) {
  test(`${label} without a request body is a 400 refusal, not a 500`, async () => {
    const deps = await depsForHandler();
    const capture = await invoke(register, deps, path, undefined);
    assert.equal(capture.statusCode, 400, JSON.stringify(capture.jsonBody));
    assert.notDeepEqual(capture.jsonBody, { error: "internal error" });
    assert.equal(await deps.principalRepo.findById({ workspaceId: "ws-7", id: "new-1" }), null);
    assert.deepEqual(await deps.apiKeyRepo.listByPrincipalId({ workspaceId: "ws-7", principalId: "machine-3" }), []);
  });
}

// F6 fix wave (Stryker re-score: the route-level `rejectApiKeyCredential` survived): an api-key
// credential can never mint principals or keys, even for a valid body — 403 before any write.
for (const [label, register, path, body] of [
  ["API-key issuance", registerAdminApiKeyIssueRoute, "/api/admin/v1/api-keys", { principalId: "machine-3", label: "Export", policyIds: ["manage-keys"] }],
  ["API-key principal create", registerAdminApiKeyPrincipalCreateRoute, "/api/admin/v1/api-keys/principals", { displayName: "Nightly Export" }],
] as const) {
  test(`${label} refuses an api-key credential with 403 and writes nothing`, async () => {
    const deps = await depsForHandler();
    const capture = await invoke(register, deps, path, body, {}, "api_key");
    assert.equal(capture.statusCode, 403);
    assert.deepEqual((capture.jsonBody as { details?: unknown }).details, { permission: "apikey.manage", reason: "credential_kind_not_permitted" });
    assert.equal(await deps.principalRepo.findById({ workspaceId: "ws-7", id: "new-1" }), null);
    assert.deepEqual(await deps.apiKeyRepo.listByPrincipalId({ workspaceId: "ws-7", principalId: "machine-3" }), []);
  });
}
