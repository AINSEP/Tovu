import assert from "node:assert/strict";
import test from "node:test";

import { GrantExceedsIssuerError, IdentityForbiddenError, IdentityNotFoundError, IdentityValidationError } from "@jini-ai/user-management";
import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";
import { apiKeyServiceDepsFrom, sendApiKeyError, type ApiKeysRouteDeps } from "../deps.js";

// F2.4/F4.3: distinct collaborator identities detect swaps as well as omitted adapters.
test("API-key service composition preserves each identity repository and crypto/runtime port", () => {
  const flatNames = ["principalRepo", "userRepo", "sessionRepo", "roleRepo", "policyRepo", "policyPermissionRepo", "rolePolicyRepo", "principalRoleRepo", "principalPolicyRepo", "passwordHasher", "apiKeyRepo", "apiKeySecretHasher", "clock", "idGen"] as const;
  const deps = Object.fromEntries(flatNames.map((name) => [name, { name }])) as unknown as ApiKeysRouteDeps;
  const actual = apiKeyServiceDepsFrom(deps);
  assert.deepEqual(Object.keys(actual).sort(), ["apiKeys", "clock", "hasher", "idGen", "repos", "secretHasher"]);
  assert.deepEqual(Object.keys(actual.repos).sort(), ["policies", "policyPermissions", "principalPolicies", "principalRoles", "principals", "rolePolicies", "roles", "sessions", "users"]);
  const bindings = [
    [actual.repos.principals, deps.principalRepo], [actual.repos.users, deps.userRepo],
    [actual.repos.sessions, deps.sessionRepo], [actual.repos.roles, deps.roleRepo],
    [actual.repos.policies, deps.policyRepo], [actual.repos.policyPermissions, deps.policyPermissionRepo],
    [actual.repos.rolePolicies, deps.rolePolicyRepo], [actual.repos.principalRoles, deps.principalRoleRepo],
    [actual.repos.principalPolicies, deps.principalPolicyRepo], [actual.hasher, deps.passwordHasher],
    [actual.apiKeys, deps.apiKeyRepo], [actual.secretHasher, deps.apiKeySecretHasher],
    [actual.clock, deps.clock], [actual.idGen, deps.idGen],
  ];
  for (const [actualPort, expectedPort] of bindings) assert.equal(actualPort, expectedPort);
});

// F4.1/F4.4/F6.2: branch-specific exact envelopes, including an unknown error containing a secret.
const cases = [
  { name: "base permission denied", error: new IdentityForbiddenError({ message: "key management denied", permission: "apikey.manage", reason: "no_grant" }), status: 403,
    body: { error: "key management denied", code: "FORBIDDEN", details: { permission: "apikey.manage", reason: "no_grant" } } },
  { name: "grant exceeds issuer", error: new GrantExceedsIssuerError({ message: "cannot delegate", offendingPermissions: ["content.delete", "role.manage"] }), status: 403,
    body: { error: "cannot delegate", code: "GRANT_EXCEEDS_ISSUER", details: { offendingPermissions: ["content.delete", "role.manage"] } } },
  { name: "invalid input", error: new IdentityValidationError({ message: "expiry is invalid" }), status: 400,
    body: { error: "expiry is invalid", code: "VALIDATION_ERROR" } },
  { name: "missing resource", error: new IdentityNotFoundError({ message: "key absent" }), status: 404,
    body: { error: "key absent", code: "RESOURCE_NOT_FOUND" } },
  { name: "unexpected failure", error: new Error("database /private/path with secret key"), status: 500,
    body: { error: "internal error" } },
];
for (const { name, error, status, body } of cases) {
  test(`API-key ${name} sends its exact status and safe error envelope`, () => {
    const { res, capture } = createCapturingResponse();
    sendApiKeyError(res, error);
    assert.deepEqual(capture, { statusCode: status, jsonBody: body });
  });
}
