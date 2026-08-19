import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "../../db/sqlite/content-db.js";
import {
  InMemoryPolicyPermissionRepo,
  InMemoryPolicyRepo,
  InMemoryPrincipalPolicyRepo,
  InMemoryPrincipalRepo,
  InMemoryPrincipalRoleRepo,
  InMemoryRolePolicyRepo,
  InMemoryRoleRepo,
  InMemorySessionRepo,
  InMemoryUserRepo,
} from "@jini-ai/cms/identity";
import {
  SqlitePolicyPermissionRepo,
  SqlitePolicyRepo,
  SqlitePrincipalPolicyRepo,
  SqlitePrincipalRepo,
  SqlitePrincipalRoleRepo,
  SqliteRolePolicyRepo,
  SqliteRoleRepo,
  SqliteSessionRepo,
  SqliteUserRepo,
} from "../repo.sqlite.js";
import type {
  PolicyPermissionRepoPort,
  PolicyRepoPort,
  PrincipalPolicyRepoPort,
  PrincipalRepoPort,
  PrincipalRoleRepoPort,
  RolePolicyRepoPort,
  RoleRepoPort,
  SessionRepoPort,
  UserRepoPort,
} from "@jini-ai/cms/identity";

/**
 * @file Shared contract-test suite for the nine `identity` repo ports, run against both
 * `repo.memory.ts` and `repo.sqlite.ts` — mirrors `src/members/__tests__/repo.contract.test.ts`'s
 * shape (that file's own header cites this exact convention).
 */

const WS = "workspace-1";
const WS2 = "workspace-2";

function runPrincipalRepoSuite(adapterName: string, makeRepo: () => PrincipalRepoPort) {
  test(`[${adapterName}] PrincipalRepoPort: save + findById round-trips, save is upsert`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "p-1", workspaceId: WS, kind: "user", displayName: "Ada", status: "active", createdAt: "2026-01-01T00:00:00.000Z" });
    let found = await repo.findById({ workspaceId: WS, id: "p-1" });
    assert.equal(found?.displayName, "Ada");

    await repo.save({ id: "p-1", workspaceId: WS, kind: "user", displayName: "Ada Lovelace", status: "disabled", disabledAt: "2026-01-02T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" });
    found = await repo.findById({ workspaceId: WS, id: "p-1" });
    assert.equal(found?.displayName, "Ada Lovelace");
    assert.equal(found?.status, "disabled");
    assert.equal(found?.disabledAt, "2026-01-02T00:00:00.000Z");
  });

  test(`[${adapterName}] PrincipalRepoPort: list scopes by workspace`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "p-1", workspaceId: WS, kind: "user", displayName: "A", status: "active", createdAt: "2026-01-01T00:00:00.000Z" });
    await repo.save({ id: "p-2", workspaceId: WS2, kind: "user", displayName: "B", status: "active", createdAt: "2026-01-01T00:00:00.000Z" });
    const rows = await repo.list({ workspaceId: WS });
    assert.deepEqual(rows.map((r) => r.id), ["p-1"]);
  });
}

function runUserRepoSuite(adapterName: string, makeRepo: () => UserRepoPort) {
  test(`[${adapterName}] UserRepoPort: save + findByPrincipalId/findByUsername round-trip, save is upsert`, async () => {
    const repo = makeRepo();
    await repo.save({ principalId: "p-1", workspaceId: WS, username: "ada", passwordHash: "h1" });
    assert.equal((await repo.findByPrincipalId({ workspaceId: WS, principalId: "p-1" }))?.username, "ada");
    assert.equal((await repo.findByUsername({ workspaceId: WS, username: "ada" }))?.principalId, "p-1");

    await repo.save({ principalId: "p-1", workspaceId: WS, username: "ada", passwordHash: "h2", email: "a@b.co" });
    const found = await repo.findByPrincipalId({ workspaceId: WS, principalId: "p-1" });
    assert.equal(found?.passwordHash, "h2");
    assert.equal(found?.email, "a@b.co");
  });

  test(`[${adapterName}] UserRepoPort: list scopes by workspace`, async () => {
    const repo = makeRepo();
    await repo.save({ principalId: "p-1", workspaceId: WS, username: "a", passwordHash: "h" });
    await repo.save({ principalId: "p-2", workspaceId: WS2, username: "b", passwordHash: "h" });
    assert.deepEqual((await repo.list({ workspaceId: WS })).map((r) => r.principalId), ["p-1"]);
  });
}

function runSessionRepoSuite(adapterName: string, makeRepo: () => SessionRepoPort) {
  test(`[${adapterName}] SessionRepoPort: save + findById/findByTokenHash round-trip, revoke sets revokedAt`, async () => {
    const repo = makeRepo();
    await repo.save({
      id: "s-1",
      workspaceId: WS,
      principalId: "p-1",
      tokenHash: "hash-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-02-01T00:00:00.000Z",
    });
    assert.equal((await repo.findById({ workspaceId: WS, id: "s-1" }))?.tokenHash, "hash-1");
    assert.equal((await repo.findByTokenHash({ workspaceId: WS, tokenHash: "hash-1" }))?.id, "s-1");

    await repo.revoke({ workspaceId: WS, id: "s-1", revokedAt: "2026-01-05T00:00:00.000Z" });
    const found = await repo.findById({ workspaceId: WS, id: "s-1" });
    assert.equal(found?.revokedAt, "2026-01-05T00:00:00.000Z");
  });

  test(`[${adapterName}] SessionRepoPort: listByPrincipalId (SPEC-006 0.6.0)`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "s-2", workspaceId: WS, principalId: "p-1", tokenHash: "h2", createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z" });
    await repo.save({ id: "s-3", workspaceId: WS, principalId: "p-1", tokenHash: "h3", createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z" });
    await repo.save({ id: "s-4", workspaceId: WS, principalId: "p-2", tokenHash: "h4", createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z" });
    const rows = await repo.listByPrincipalId({ workspaceId: WS, principalId: "p-1" });
    assert.deepEqual(rows.map((r) => r.id).sort(), ["s-2", "s-3"]);
  });
}

function runRoleRepoSuite(adapterName: string, makeRepo: () => RoleRepoPort) {
  test(`[${adapterName}] RoleRepoPort: save + findById/findByName round-trip`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "r-1", workspaceId: WS, name: "admin", isBuiltin: true });
    assert.equal((await repo.findById({ workspaceId: WS, id: "r-1" }))?.name, "admin");
    assert.equal((await repo.findByName({ workspaceId: WS, name: "admin" }))?.id, "r-1");
    assert.equal((await repo.findById({ workspaceId: WS, id: "r-1" }))?.isBuiltin, true);
  });

  test(`[${adapterName}] RoleRepoPort: list scopes by workspace`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "r-1", workspaceId: WS, name: "admin", isBuiltin: true });
    await repo.save({ id: "r-2", workspaceId: WS2, name: "admin", isBuiltin: true });
    assert.deepEqual((await repo.list({ workspaceId: WS })).map((r) => r.id), ["r-1"]);
  });

  test(`[${adapterName}] RoleRepoPort: delete removes the row, scoped by workspace (SPEC-006 0.6.0)`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "r-3", workspaceId: WS, name: "custom", isBuiltin: false });
    await repo.delete({ workspaceId: WS, id: "r-3" });
    assert.equal(await repo.findById({ workspaceId: WS, id: "r-3" }), null);
  });
}

function runPolicyRepoSuite(adapterName: string, makeRepo: () => PolicyRepoPort) {
  test(`[${adapterName}] PolicyRepoPort: save + findById/findByName round-trip`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "pol-1", workspaceId: WS, name: "owner", description: "full access", isBuiltin: true, isFrozen: false });
    const found = await repo.findById({ workspaceId: WS, id: "pol-1" });
    assert.equal(found?.name, "owner");
    assert.equal(found?.description, "full access");
    assert.equal(found?.isFrozen, false);
    assert.equal((await repo.findByName({ workspaceId: WS, name: "owner" }))?.id, "pol-1");
  });

  test(`[${adapterName}] PolicyRepoPort: delete removes the row, scoped by workspace (SPEC-006 0.6.0)`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "pol-3", workspaceId: WS, name: "custom", isBuiltin: false, isFrozen: false });
    await repo.delete({ workspaceId: WS, id: "pol-3" });
    assert.equal(await repo.findById({ workspaceId: WS, id: "pol-3" }), null);
  });
}

function runPolicyPermissionRepoSuite(adapterName: string, makeRepo: () => PolicyPermissionRepoPort) {
  test(`[${adapterName}] PolicyPermissionRepoPort: save + listByPolicyId`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "pp-1", workspaceId: WS, policyId: "pol-1", permission: "content.read" });
    await repo.save({ id: "pp-2", workspaceId: WS, policyId: "pol-1", permission: "content.write" });
    await repo.save({ id: "pp-3", workspaceId: WS, policyId: "pol-2", permission: "content.read" });
    const rows = await repo.listByPolicyId({ workspaceId: WS, policyId: "pol-1" });
    assert.deepEqual(rows.map((r) => r.permission).sort(), ["content.read", "content.write"]);
  });

  test(`[${adapterName}] PolicyPermissionRepoPort: deleteByPolicyId cascades only the target policy's own rows (SPEC-006 0.6.0)`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "pp-4", workspaceId: WS, policyId: "pol-a", permission: "content.read" });
    await repo.save({ id: "pp-5", workspaceId: WS, policyId: "pol-a", permission: "content.write" });
    await repo.save({ id: "pp-6", workspaceId: WS, policyId: "pol-b", permission: "content.read" });
    await repo.deleteByPolicyId({ workspaceId: WS, policyId: "pol-a" });
    assert.deepEqual(await repo.listByPolicyId({ workspaceId: WS, policyId: "pol-a" }), []);
    assert.equal((await repo.listByPolicyId({ workspaceId: WS, policyId: "pol-b" })).length, 1, "a different policy's rows are untouched");
  });
}

function runRolePolicyRepoSuite(adapterName: string, makeRepo: () => RolePolicyRepoPort) {
  test(`[${adapterName}] RolePolicyRepoPort: save + listByRoleId`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "rp-1", workspaceId: WS, roleId: "r-1", policyId: "pol-1" });
    assert.deepEqual((await repo.listByRoleId({ workspaceId: WS, roleId: "r-1" })).map((r) => r.policyId), ["pol-1"]);
  });

  test(`[${adapterName}] RolePolicyRepoPort: listByPolicyId (SPEC-006 0.6.0)`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "rp-2", workspaceId: WS, roleId: "r-a", policyId: "pol-x" });
    await repo.save({ id: "rp-3", workspaceId: WS, roleId: "r-b", policyId: "pol-x" });
    await repo.save({ id: "rp-4", workspaceId: WS, roleId: "r-c", policyId: "pol-y" });
    const rows = await repo.listByPolicyId({ workspaceId: WS, policyId: "pol-x" });
    assert.deepEqual(rows.map((r) => r.roleId).sort(), ["r-a", "r-b"]);
  });
}

function runPrincipalRoleRepoSuite(adapterName: string, makeRepo: () => PrincipalRoleRepoPort) {
  test(`[${adapterName}] PrincipalRoleRepoPort: save + listByPrincipalId`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "pr-1", workspaceId: WS, principalId: "p-1", roleId: "r-1" });
    assert.deepEqual((await repo.listByPrincipalId({ workspaceId: WS, principalId: "p-1" })).map((r) => r.roleId), ["r-1"]);
  });

  test(`[${adapterName}] PrincipalRoleRepoPort: listByRoleId (SPEC-006 0.6.0)`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "pr-2", workspaceId: WS, principalId: "p-a", roleId: "r-x" });
    await repo.save({ id: "pr-3", workspaceId: WS, principalId: "p-b", roleId: "r-x" });
    await repo.save({ id: "pr-4", workspaceId: WS, principalId: "p-c", roleId: "r-y" });
    const rows = await repo.listByRoleId({ workspaceId: WS, roleId: "r-x" });
    assert.deepEqual(rows.map((r) => r.principalId).sort(), ["p-a", "p-b"]);
  });
}

function runPrincipalPolicyRepoSuite(adapterName: string, makeRepo: () => PrincipalPolicyRepoPort) {
  test(`[${adapterName}] PrincipalPolicyRepoPort: save + listByPrincipalId`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "pp-1", workspaceId: WS, principalId: "p-1", policyId: "pol-1" });
    assert.deepEqual((await repo.listByPrincipalId({ workspaceId: WS, principalId: "p-1" })).map((r) => r.policyId), ["pol-1"]);
  });

  test(`[${adapterName}] PrincipalPolicyRepoPort: listByPolicyId (SPEC-006 0.6.0)`, async () => {
    const repo = makeRepo();
    await repo.save({ id: "pp-2", workspaceId: WS, principalId: "p-a", policyId: "pol-x" });
    await repo.save({ id: "pp-3", workspaceId: WS, principalId: "p-b", policyId: "pol-x" });
    await repo.save({ id: "pp-4", workspaceId: WS, principalId: "p-c", policyId: "pol-y" });
    const rows = await repo.listByPolicyId({ workspaceId: WS, policyId: "pol-x" });
    assert.deepEqual(rows.map((r) => r.principalId).sort(), ["p-a", "p-b"]);
  });
}

runPrincipalRepoSuite("InMemoryPrincipalRepo", () => new InMemoryPrincipalRepo());
runPrincipalRepoSuite("SqlitePrincipalRepo", () => new SqlitePrincipalRepo(openContentDb(":memory:")));

runUserRepoSuite("InMemoryUserRepo", () => new InMemoryUserRepo());
runUserRepoSuite("SqliteUserRepo", () => new SqliteUserRepo(openContentDb(":memory:")));

runSessionRepoSuite("InMemorySessionRepo", () => new InMemorySessionRepo());
runSessionRepoSuite("SqliteSessionRepo", () => new SqliteSessionRepo(openContentDb(":memory:")));

runRoleRepoSuite("InMemoryRoleRepo", () => new InMemoryRoleRepo());
runRoleRepoSuite("SqliteRoleRepo", () => new SqliteRoleRepo(openContentDb(":memory:")));

runPolicyRepoSuite("InMemoryPolicyRepo", () => new InMemoryPolicyRepo());
runPolicyRepoSuite("SqlitePolicyRepo", () => new SqlitePolicyRepo(openContentDb(":memory:")));

runPolicyPermissionRepoSuite("InMemoryPolicyPermissionRepo", () => new InMemoryPolicyPermissionRepo());
runPolicyPermissionRepoSuite("SqlitePolicyPermissionRepo", () => new SqlitePolicyPermissionRepo(openContentDb(":memory:")));

runRolePolicyRepoSuite("InMemoryRolePolicyRepo", () => new InMemoryRolePolicyRepo());
runRolePolicyRepoSuite("SqliteRolePolicyRepo", () => new SqliteRolePolicyRepo(openContentDb(":memory:")));

runPrincipalRoleRepoSuite("InMemoryPrincipalRoleRepo", () => new InMemoryPrincipalRoleRepo());
runPrincipalRoleRepoSuite("SqlitePrincipalRoleRepo", () => new SqlitePrincipalRoleRepo(openContentDb(":memory:")));

runPrincipalPolicyRepoSuite("InMemoryPrincipalPolicyRepo", () => new InMemoryPrincipalPolicyRepo());
runPrincipalPolicyRepoSuite("SqlitePrincipalPolicyRepo", () => new SqlitePrincipalPolicyRepo(openContentDb(":memory:")));
