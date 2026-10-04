import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createUser } from "@jini-ai/user-management/server";
import { createInMemoryIdentityRouteDeps } from "#src/features/identity/wiring";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { identityServiceDepsFrom, type UsersRouteDeps } from "../deps.js";
import { registerAdminUserCreateRoute } from "../create.js";
import { registerAdminUserUpdateRoute } from "../update.js";
import { registerAdminUserEnableRoute } from "../enable.js";
import { registerAdminUserAssignRoleRoute } from "../assign-role.js";
import { registerAdminUserAttachPolicyRoute } from "../attach-policy.js";

/** Owner-email follow-up: real identity services and transactions, with direct route invocation
 * to verify response mapping in environments that cannot open HTTP listeners. Existing HTTP
 * integration suites remain in place to exercise Express routing and middleware. */
const workspaceId = "owner-protection";
const routeBase = "/api/admin/v1/workspaces/:workspaceId/users";

async function setup() {
  let n = 0;
  const idGen = { newId: () => `guard-${++n}` };
  const clock = { nowIso: () => "2026-10-03T00:00:00.000Z" };
  const wiring = createInMemoryIdentityRouteDeps({ workspaceId, clock, idGen });
  await wiring.identityReady;
  const ownerId = await wiring.ownerPrincipalId;
  const deps: UsersRouteDeps = { ...wiring, workspaceId, clock, idGen };
  const service = identityServiceDepsFrom(deps);
  const create = async (username: string) => (await createUser({
    deps: service, input: { workspaceId, callerPrincipalId: ownerId, username, password: "correct-horse-battery" },
  }, { email: `${username}@example.com` })).principal;
  const grant = async (principalId: string, permissions: string[]) => {
    const policyId = idGen.newId();
    await deps.policyRepo.save({ id: policyId, workspaceId, name: policyId, isBuiltin: false, isFrozen: false });
    for (const permission of permissions) {
      await deps.policyPermissionRepo.save({ id: idGen.newId(), workspaceId, policyId, permission, resourceType: null, constraintJson: null });
    }
    await deps.principalPolicyRepo.save({ id: idGen.newId(), workspaceId, principalId, policyId });
    return policyId;
  };
  const app = express();
  registerAdminUserCreateRoute(app, deps);
  registerAdminUserUpdateRoute(app, deps);
  registerAdminUserEnableRoute(app, deps);
  registerAdminUserAssignRoleRoute(app, deps);
  registerAdminUserAttachPolicyRoute(app, deps);
  const invoke = async (method: "post" | "patch", suffix: string, callerId: string, principalId: string, body: unknown) => {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: callerId };
    await extractRouteHandler(app, method, routeBase + suffix)({ params: { workspaceId, principalId }, body }, res);
    return capture;
  };
  return { deps, ownerId, create, grant, invoke };
}

for (const targetKind of ["seeded", "role", "policy"] as const) {
  test(`owner protection: delegated user.manage/role.manage cannot update, enable, assign or attach to a ${targetKind} owner`, async () => {
    const f = await setup();
    const caller = await f.create("delegated");
    const policyId = await f.grant(caller.id, ["user.manage", "role.manage"]);
    const target = targetKind === "seeded"
      ? await f.deps.principalRepo.findById({ workspaceId, id: f.ownerId })
      : await f.create("secondary-owner");
    assert.ok(target);
    const ownerRole = await f.deps.roleRepo.findByName({ workspaceId, name: "owner" });
    assert.ok(ownerRole);
    if (targetKind === "role") {
      await f.deps.principalRoleRepo.save({ id: "owner-link", workspaceId, principalId: target.id, roleId: ownerRole.id });
    } else if (targetKind === "policy") {
      await f.grant(target.id, ["*"]);
    }
    // Disabled owner accounts retain their protection; enabling one is a modification too.
    await f.deps.principalRepo.save({ ...target, status: "disabled", disabledAt: f.deps.clock.nowIso() });
    const before = {
      principal: await f.deps.principalRepo.findById({ workspaceId, id: target.id }),
      user: await f.deps.userRepo.findByPrincipalId({ workspaceId, principalId: target.id }),
      roles: await f.deps.principalRoleRepo.listByPrincipalId({ workspaceId, principalId: target.id }),
      policies: await f.deps.principalPolicyRepo.listByPrincipalId({ workspaceId, principalId: target.id }),
    };
    for (const operation of [
      { method: "patch", suffix: "/:principalId", body: { email: "changed@example.com" } },
      { method: "post", suffix: "/:principalId/enable", body: {} },
      { method: "post", suffix: "/:principalId/roles", body: { roleId: ownerRole.id } },
      { method: "post", suffix: "/:principalId/policies", body: { policyId } },
    ] as const) {
      assert.deepEqual(await f.invoke(operation.method, operation.suffix, caller.id, target.id, operation.body), {
        statusCode: 409, jsonBody: { error: "only an owner can modify an owner principal", code: "OWNER_REQUIRED" },
      });
    }
    assert.deepEqual({
      principal: await f.deps.principalRepo.findById({ workspaceId, id: target.id }),
      user: await f.deps.userRepo.findByPrincipalId({ workspaceId, principalId: target.id }),
      roles: await f.deps.principalRoleRepo.listByPrincipalId({ workspaceId, principalId: target.id }),
      policies: await f.deps.principalPolicyRepo.listByPrincipalId({ workspaceId, principalId: target.id }),
    }, before);
  });
}

test("member.manage cannot create operators or edit other operators, including owners; self-email edits remain allowed", async () => {
  const f = await setup();
  const memberManager = await f.create("member-manager");
  const other = await f.create("other-operator");
  await f.grant(memberManager.id, ["member.manage"]);
  const created = await f.invoke("post", "", memberManager.id, "", { username: "denied-operator", password: "correct-horse-battery" });
  assert.equal(created.statusCode, 403);
  assert.deepEqual((created.jsonBody as { code: string; details: unknown }).details, { permission: "user.manage", reason: "no_grant" });
  assert.equal((created.jsonBody as { code: string }).code, "FORBIDDEN");
  assert.equal(await f.deps.userRepo.findByUsername({ workspaceId, username: "denied-operator" }), null);
  for (const principalId of [other.id, f.ownerId]) {
    const before = await f.deps.userRepo.findByPrincipalId({ workspaceId, principalId });
    const result = await f.invoke("patch", "/:principalId", memberManager.id, principalId, { email: "denied@example.com" });
    assert.equal(result.statusCode, 403);
    assert.equal((result.jsonBody as { code: string }).code, "FORBIDDEN");
    assert.deepEqual((result.jsonBody as { details: unknown }).details, { permission: "user.manage", reason: "no_grant" });
    assert.deepEqual(await f.deps.userRepo.findByPrincipalId({ workspaceId, principalId }), before);
  }
  const self = await f.invoke("patch", "/:principalId", memberManager.id, memberManager.id, { email: "self@example.com" });
  assert.equal(self.statusCode, 200);
  assert.equal((self.jsonBody as { user: { email: string } }).user.email, "self@example.com");
  assert.equal((await f.deps.userRepo.findByPrincipalId({ workspaceId, principalId: memberManager.id }))?.email, "self@example.com");
});

test("owners may edit owner email; delegated user.manage may edit ordinary operator email without changing credentials", async () => {
  const f = await setup();
  const caller = await f.create("user-manager");
  const target = await f.create("ordinary-operator");
  await f.grant(caller.id, ["user.manage"]);
  for (const [callerId, principalId] of [[f.ownerId, f.ownerId], [caller.id, target.id]]) {
    const before = await f.deps.userRepo.findByPrincipalId({ workspaceId, principalId });
    assert.ok(before);
    const result = await f.invoke("patch", "/:principalId", callerId, principalId, { email: "allowed@example.com", username: "ignored", password: "ignored" });
    assert.equal(result.statusCode, 200);
    const user = (result.jsonBody as { user: Record<string, unknown> }).user;
    assert.equal(user.email, "allowed@example.com");
    assert.equal(user.username, before.username);
    assert.equal(Object.hasOwn(user, "passwordHash"), false);
    assert.equal(Object.hasOwn(user, "password"), false);
    assert.deepEqual(await f.deps.userRepo.findByPrincipalId({ workspaceId, principalId }), { ...before, email: "allowed@example.com" });
  }
});
