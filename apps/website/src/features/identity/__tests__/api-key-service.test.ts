import { NodeSessionTokens } from "@jini-ai/user-management/server";
import { createTransactionalInMemoryIdentityRepos } from "@jini-ai/user-management/server";
import assert from "node:assert/strict";
import test from "node:test";

import { GrantExceedsIssuerError, IdentityNotFoundError, IdentityValidationError } from "@jini-ai/user-management";
import { InMemoryPolicyPermissionRepo, InMemoryPolicyRepo, InMemoryPrincipalPolicyRepo, InMemoryPrincipalRepo, InMemoryPrincipalRoleRepo, InMemoryRolePolicyRepo, InMemoryRoleRepo, InMemorySessionRepo, InMemoryUserRepo, resolveEffectivePermissions } from "@jini-ai/user-management/server";
import { authenticateApiKey, createApiKeyPrincipal, issueApiKey, revokeApiKey, type ApiKeyServiceDeps } from "../api-key-service.js";
import type { ApiKeyRecord } from "../api-key-types.js";
import { InMemoryApiKeyRepo } from "../repo.memory.js";

const WS = "ws-b08";
const NOW = "2026-10-01T12:00:00.000Z";

async function harness() {
  let id = 0;
  let now = NOW;
  const verified: Array<[string, string]> = [];
  const deps: ApiKeyServiceDeps = {
    tokens: new NodeSessionTokens({}),
    repos: createTransactionalInMemoryIdentityRepos({ repos: { principals: new InMemoryPrincipalRepo({}), users: new InMemoryUserRepo({}), sessions: new InMemorySessionRepo({}), roles: new InMemoryRoleRepo({}), policies: new InMemoryPolicyRepo({}), policyPermissions: new InMemoryPolicyPermissionRepo({}), principalPolicies: new InMemoryPrincipalPolicyRepo({}), principalRoles: new InMemoryPrincipalRoleRepo({}), rolePolicies: new InMemoryRolePolicyRepo({}) } }),
    apiKeys: new InMemoryApiKeyRepo(), clock: { nowIso: () => now, nowMs: () => Date.parse(now) }, idGen: { newId: () => `b08-${++id}` },
    hasher: { hash: async ({ password }) => `password:${password}`, verify: async ({ hash, password }) => hash === `password:${password}` },
    secretHasher: { hash: async (secret) => `digest:${secret}`, verify: async (hash, secret) => { verified.push([hash, secret]); return hash === `digest:${secret}`; } },
  };
  await deps.repos.principals.save({ id: "issuer", workspaceId: WS, kind: "user", displayName: "Owner", status: "active", createdAt: NOW });
  await deps.repos.policies.save({ id: "issuer-policy", workspaceId: WS, name: "issuer", isBuiltin: false, isFrozen: false });
  await deps.repos.principalPolicies.save({ id: "issuer-grant", workspaceId: WS, principalId: "issuer", policyId: "issuer-policy" });
  await deps.repos.policyPermissions.save({ id: "owner-permission", workspaceId: WS, policyId: "issuer-policy", permission: "*", resourceType: null, constraintJson: null });
  await deps.repos.policies.save({ id: "source", workspaceId: WS, name: "source", isBuiltin: false, isFrozen: false });
  await deps.repos.policyPermissions.save({ id: "source-read", workspaceId: WS, policyId: "source", permission: "content.read", resourceType: "entry", constraintJson: '{"type":"recipe"}' });
  const { principal } = await createApiKeyPrincipal({ deps, input: { workspaceId: WS, callerPrincipalId: "issuer", displayName: "  Runner  " } });
  return { deps, principal, verified, setNow: (value: string) => { now = value; }, input: { workspaceId: WS, callerPrincipalId: "issuer", principalId: principal.id, label: "  Build key  ", policyIds: ["source"] } };
}

test("issuance freezes exact constrained permissions, canonicalizes expiry and survives source-policy widening", async () => {
  const h = await harness();
  await h.deps.repos.policyPermissions.save({ id: "source-write", workspaceId: WS, policyId: "source", permission: "content.write", resourceType: "post", constraintJson: null });
  const issued = await issueApiKey({ deps: h.deps, input: { ...h.input, expiresAt: "2026-10-02T09:00:00-04:00" } });
  assert.equal(issued.apiKey.label, "Build key");
  assert.equal(issued.apiKey.expiresAt, "2026-10-02T13:00:00.000Z");
  const stored = await h.deps.apiKeys.findById({ workspaceId: WS, id: issued.apiKey.id });
  assert.ok(stored);
  assert.equal(stored.keyHash, `digest:${issued.rawKey.split(".")[1]}`);
  assert.equal("rawKey" in stored, false);
  assert.equal((await h.deps.repos.policies.findById({ workspaceId: WS, id: stored.issuedPolicyId! }))?.isFrozen, true);
  const permissions = () => resolveEffectivePermissions({ deps: h.deps.repos, principalId: h.principal.id, workspaceId: WS });
  const read = (rows: Awaited<ReturnType<typeof permissions>>) => rows.map(({ permission, resourceType, constraintJson }) => ({ permission, resourceType, constraintJson }));
  const expected = [{ permission: "content.read", resourceType: "entry", constraintJson: '{"type":"recipe"}' }, { permission: "content.write", resourceType: "post", constraintJson: null }];
  assert.deepEqual(read(await permissions()), expected);
  await h.deps.repos.policyPermissions.save({ id: "widened", workspaceId: WS, policyId: "source", permission: "content.write", resourceType: null, constraintJson: null });
  assert.deepEqual(read(await permissions()), expected);
  await h.deps.repos.policyPermissions.deleteByPolicyId({ workspaceId: WS, policyId: "source" });
  // F6.3/F6.4: exercise the authority the running authorization path resolves.
  assert.deepEqual(read(await permissions()), expected);
  assert.equal((await authenticateApiKey({ deps: h.deps, input: { workspaceId: WS, rawKey: issued.rawKey } }))?.principal.id, h.principal.id);
  assert.equal((await h.deps.apiKeys.findById({ workspaceId: WS, id: stored.id }))?.lastUsedAt, NOW);
});

for (const restriction of [{ resourceType: "entry", constraintJson: null }, { resourceType: null, constraintJson: '{"type":"recipe"}' }]) {
  test(`issuance refuses a permission the issuer holds only with ${JSON.stringify(restriction)}`, async () => {
    const h = await harness();
    await h.deps.repos.policyPermissions.deleteByPolicyId({ workspaceId: WS, policyId: "issuer-policy" });
    await h.deps.repos.policyPermissions.save({ id: "manage", workspaceId: WS, policyId: "issuer-policy", permission: "apikey.manage", resourceType: null, constraintJson: null });
    await h.deps.repos.policyPermissions.save({ id: "limited", workspaceId: WS, policyId: "issuer-policy", permission: "content.read", ...restriction });
    await assert.rejects(issueApiKey({ deps: h.deps, input: h.input }), GrantExceedsIssuerError);
    assert.deepEqual(await h.deps.apiKeys.listByPrincipalId({ workspaceId: WS, principalId: h.principal.id }), []);
    assert.deepEqual(await h.deps.repos.principalPolicies.listByPrincipalId({ workspaceId: WS, principalId: h.principal.id }), []);
    assert.deepEqual((await h.deps.repos.policies.list({ workspaceId: WS })).map((p) => p.id).sort(), ["issuer-policy", "source"]);
  });
}

for (const badInput of [{ label: "x".repeat(256) }, { policyIds: [" "] }, { policyIds: [] }, { expiresAt: "not-a-date" }, { principalId: " " }]) {
  test(`invalid issuance input ${Object.keys(badInput)[0]} creates no snapshot or key`, async () => {
    const h = await harness();
    await assert.rejects(issueApiKey({ deps: h.deps, input: { ...h.input, ...badInput } }), IdentityValidationError);
    assert.deepEqual((await h.deps.repos.policies.list({ workspaceId: WS })).map((p) => p.id).sort(), ["issuer-policy", "source"]);
    assert.deepEqual(await h.deps.apiKeys.listByPrincipalId({ workspaceId: WS, principalId: h.principal.id }), []);
  });
}

test("revoking twice keeps the original timestamp and removes effective authority", async () => {
  const h = await harness();
  const issued = await issueApiKey({ deps: h.deps, input: h.input });
  const input = { workspaceId: WS, callerPrincipalId: "issuer", keyId: issued.apiKey.id };
  await revokeApiKey({ deps: h.deps, input });
  h.setNow("2026-10-02T12:00:00.000Z");
  await revokeApiKey({ deps: h.deps, input });
  assert.equal((await h.deps.apiKeys.findById({ workspaceId: WS, id: input.keyId }))?.revokedAt, NOW);
  assert.deepEqual(await resolveEffectivePermissions({ deps: h.deps.repos, workspaceId: WS, principalId: h.principal.id }), []);
  assert.equal(await authenticateApiKey({ deps: h.deps, input: { workspaceId: WS, rawKey: issued.rawKey } }), null);
});

test("a future expiry expressed with an offset authenticates by instant and records usage", async () => {
  const h = await harness();
  const key: ApiKeyRecord = { id: "key", workspaceId: WS, principalId: h.principal.id, label: "Runner", keyHash: "digest:secret", prefix: "tovu_ak_0123456789ab", expiresAt: "2026-10-01T09:00:00-04:00", createdAt: NOW };
  await h.deps.apiKeys.save(key);
  const result = await authenticateApiKey({ deps: h.deps, input: { workspaceId: WS, rawKey: "tovu_ak_0123456789ab.secret" } });
  assert.equal(result?.principal.id, h.principal.id);
  assert.equal(result?.apiKey.id, "key");
  assert.equal((await h.deps.apiKeys.findById({ workspaceId: WS, id: "key" }))?.lastUsedAt, NOW);
});

test("a disabled machine cannot receive a key and no partial snapshot is persisted", async () => {
  const h = await harness();
  await h.deps.repos.principals.save({ ...h.principal, status: "disabled" });
  await assert.rejects(issueApiKey({ deps: h.deps, input: h.input }), (error) => {
    assert(error instanceof IdentityValidationError);
    assert.equal(error.message, `principal '${h.principal.id}' is disabled`);
    return true;
  });
  assert.deepEqual(await h.deps.apiKeys.listByPrincipalId({ workspaceId: WS, principalId: h.principal.id }), []);
  assert.deepEqual((await h.deps.repos.policies.list({ workspaceId: WS })).map((p) => p.id).sort(), ["issuer-policy", "source"]);
});

for (const variant of ["revoked", "expiry-boundary", "disabled", "wrong-kind", "missing-principal", "wrong-secret"] as const) {
  test(`authentication rejects ${variant}, verifies the secret first and never records usage`, async () => {
    const h = await harness();
    const key: ApiKeyRecord = { id: "key", workspaceId: WS, principalId: h.principal.id, label: "Runner", keyHash: "digest:secret", prefix: "tovu_ak_0123456789ab", createdAt: NOW };
    if (variant === "revoked") key.revokedAt = "2026-09-30T00:00:00Z";
    if (variant === "expiry-boundary") key.expiresAt = "2026-10-01T08:00:00-04:00";
    if (variant === "disabled") await h.deps.repos.principals.save({ ...h.principal, status: "disabled" });
    if (variant === "wrong-kind") await h.deps.repos.principals.save({ ...h.principal, kind: "user" });
    if (variant === "missing-principal") key.principalId = "missing";
    await h.deps.apiKeys.save(key);
    const secret = variant === "wrong-secret" ? "wrong" : "secret";
    assert.equal(await authenticateApiKey({ deps: h.deps, input: { workspaceId: WS, rawKey: `tovu_ak_0123456789ab.${secret}` } }), null);
    assert.deepEqual(h.verified, [["digest:secret", secret]]);
    assert.equal((await h.deps.apiKeys.findById({ workspaceId: WS, id: "key" }))?.lastUsedAt, undefined);
  });
}

test("an unknown well-formed key verifies a decoy; malformed input never reaches the hasher", async () => {
  const h = await harness();
  const hashed: string[] = [];
  h.deps.secretHasher.hash = async (secret) => { hashed.push(secret); return "opaque-decoy-digest"; };
  assert.equal(await authenticateApiKey({ deps: h.deps, input: { workspaceId: WS, rawKey: "malformed" } }), null);
  assert.deepEqual(h.verified, []);
  assert.deepEqual(hashed, []);
  assert.equal(await authenticateApiKey({ deps: h.deps, input: { workspaceId: WS, rawKey: "tovu_ak_0123456789ab.unknown-secret" } }), null);
  // F2.5: verify must receive the hash returned by the injected port, never an arbitrary value.
  assert.deepEqual(h.verified, [["opaque-decoy-digest", "unknown-secret"]]);
  assert.equal(hashed.length, 1);
  assert.notEqual(hashed[0], "unknown-secret");
  assert.equal(await authenticateApiKey({ deps: h.deps, input: { workspaceId: WS, rawKey: "tovu_ak_0123456789ab.another-secret" } }), null);
  assert.deepEqual(h.verified, [["opaque-decoy-digest", "unknown-secret"], ["opaque-decoy-digest", "another-secret"]]);
  assert.equal(hashed.length, 1, "the same hasher reuses its decoy");
});

test("a valid source followed by a missing policy creates no partial snapshot or key", async () => {
  // F4.4/F6.3: all earlier guards pass; the missing second source must stop every write.
  const h = await harness();
  await assert.rejects(issueApiKey({ deps: h.deps, input: { ...h.input, policyIds: ["source", "missing-policy"] } }), (error) => {
    assert(error instanceof IdentityNotFoundError);
    assert.equal(error.message, "policy 'missing-policy' was not found");
    return true;
  });
  assert.deepEqual((await h.deps.repos.policies.list({ workspaceId: WS })).map((p) => p.id).sort(), ["issuer-policy", "source"]);
  assert.deepEqual(await h.deps.apiKeys.listByPrincipalId({ workspaceId: WS, principalId: h.principal.id }), []);
  assert.deepEqual(await h.deps.repos.principalPolicies.listByPrincipalId({ workspaceId: WS, principalId: h.principal.id }), []);
});

test("the grant clamp checks the second source policy even when the first permission is held", async () => {
  // F4.3: checking only the first source would grant system.write that the issuer lacks.
  const h = await harness();
  await h.deps.repos.policyPermissions.deleteByPolicyId({ workspaceId: WS, policyId: "issuer-policy" });
  for (const permission of ["apikey.manage", "content.read"]) {
    await h.deps.repos.policyPermissions.save({ id: `issuer-${permission}`, workspaceId: WS, policyId: "issuer-policy", permission, resourceType: null, constraintJson: null });
  }
  await h.deps.repos.policies.save({ id: "second-source", workspaceId: WS, name: "Privileged", isBuiltin: false, isFrozen: false });
  await h.deps.repos.policyPermissions.save({ id: "second-permission", workspaceId: WS, policyId: "second-source", permission: "system.write", resourceType: null, constraintJson: null });
  await assert.rejects(issueApiKey({ deps: h.deps, input: { ...h.input, policyIds: ["source", "second-source"] } }), (error) => {
    assert(error instanceof GrantExceedsIssuerError);
    assert.equal(error.message, "principal 'issuer' cannot grant permission(s) it does not hold unconstrained: system.write");
    return true;
  });
  assert.deepEqual((await h.deps.repos.policies.list({ workspaceId: WS })).map((p) => p.id).sort(), ["issuer-policy", "second-source", "source"]);
  assert.deepEqual(await h.deps.apiKeys.listByPrincipalId({ workspaceId: WS, principalId: h.principal.id }), []);
  assert.deepEqual(await h.deps.repos.principalPolicies.listByPrincipalId({ workspaceId: WS, principalId: h.principal.id }), []);
});

test("a trimmed name or label exactly 255 characters long is accepted and persisted", async () => {
  const h = await harness();
  const { principal } = await createApiKeyPrincipal({ deps: h.deps, input: { workspaceId: WS, callerPrincipalId: "issuer", displayName: ` ${"n".repeat(255)} ` } });
  assert.equal((await h.deps.repos.principals.findById({ workspaceId: WS, id: principal.id }))?.displayName, "n".repeat(255));
  const issued = await issueApiKey({ deps: h.deps, input: { ...h.input, principalId: principal.id, label: ` ${"l".repeat(255)} ` } });
  assert.equal((await h.deps.apiKeys.findById({ workspaceId: WS, id: issued.apiKey.id }))?.label, "l".repeat(255));
});
