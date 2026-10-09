import { registerAdminPolicyPermissionRemoveRoute } from "../remove-policy-permission.js";
import { registerAdminUserListRoute } from "../list.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createUser, assignRole } from "@jini-ai/user-management/server";
import type { ToolExecutionContext } from "@jini-ai/core";
import { DEFAULT_OWNER_CREDENTIALS, createInMemoryIdentityRouteDeps } from "#src/features/identity/wiring";
import { createAppPermissionGrants } from "#src/server/runtime/composition/app-permission-grants";
import { createSettingsPrincipalLookup } from "#src/features/settings/index";
import { buildGatedIdentityRegistrations } from "#src/features/identity/tool-registrations";
import { bindTrashUserForTool } from "#src/server/runtime/composition/trash-user-tool-port";
import { withUserTrashAdminOverride } from "#src/server/runtime/composition/trash-user-admin-override";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { identityServiceDepsFrom, type UsersRouteDeps } from "../deps.js";
import { registerAdminUserDisableRoute } from "../disable.js";
import { registerAdminUserDeleteRoute } from "../delete.js";
import { registerAdminUserResetPasswordRoute } from "../reset-password.js";
import { registerAdminUserUpdateRoute } from "../update.js";
import { registerAdminUserEnableRoute } from "../enable.js";
import { registerAdminRoleDeleteRoute } from "../delete-role.js";
import { registerAdminRoleUpdateRoute } from "../update-role.js";

const workspaceId = "account-protections";
const base = "/api/admin/v1/workspaces/:workspaceId/users";
async function setup() {
  let n = 0;
  const idGen = { newId: () => `protection-${++n}` };
  const clock = { nowMs: () => Date.parse("2026-10-07T00:00:00Z"), nowIso: () => "2026-10-07T00:00:00Z" };
  const wiring = createInMemoryIdentityRouteDeps({ ownerCredentials: DEFAULT_OWNER_CREDENTIALS, permissionGrants: createAppPermissionGrants({}), workspaceId, clock, idGen });
  await wiring.identityReady;
  const ownerId = await wiring.ownerPrincipalId;
  const trashed = new Set<string>();
  const deps: UsersRouteDeps = {
    ...wiring, workspaceId, clock, idGen,
    principalRepo: Object.assign(wiring.principalRepo, createSettingsPrincipalLookup({ repo: wiring.principalRepo })),
    isInTrash: async id => trashed.has(id),
    removeUser: async ({ id }) => { trashed.add(id); return { ok: true, version: null }; },
  };
  const service = identityServiceDepsFrom(deps);
  const make = async (username: string, role?: "admin" | "owner") => {
    const { principal } = await createUser({ deps: service, input: { workspaceId, callerPrincipalId: ownerId, username, password: "correct-horse-battery" } });
    if (role) {
      const record = await deps.roleRepo.findByName({ workspaceId, name: role });
      assert.ok(record);
      await assignRole({ deps: service, input: { workspaceId, callerPrincipalId: ownerId, principalId: principal.id, roleId: record.id } });
    }
    return principal.id;
  };
  const grantManage = async (id: string, permissions = ["user.manage"]) => {
    const policyId = idGen.newId();
    await deps.policyRepo.save({ id: policyId, workspaceId, name: policyId, isBuiltin: false, isFrozen: false });
    for (const permission of permissions) await deps.policyPermissionRepo.save({ id: idGen.newId(), workspaceId, policyId, permission, resourceType: null, constraintJson: null });
    await deps.principalPolicyRepo.save({ id: idGen.newId(), workspaceId, principalId: id, policyId });
    return policyId;
  };
  const app = express();
  for (const register of [registerAdminUserDisableRoute, registerAdminUserDeleteRoute, registerAdminUserResetPasswordRoute, registerAdminUserUpdateRoute, registerAdminUserEnableRoute, registerAdminRoleDeleteRoute, registerAdminRoleUpdateRoute, registerAdminPolicyPermissionRemoveRoute, registerAdminUserListRoute]) register(app, deps);
  const invoke = async (method: "post" | "delete" | "patch", suffix: string, callerId: string, principalId: string, body = {}) => {
    const { res, capture } = createCapturingResponse();
    res.send = () => res;
    res.locals.principal = { id: callerId };
    await extractRouteHandler(app, method, base + suffix)({ params: { workspaceId, principalId }, body }, res);
    return capture;
  };
  const tools = buildGatedIdentityRegistrations(deps);
  const tool = async (id: string, callerId: string, principalId: string) => {
    const registration = tools.find(r => r.descriptor.id === id);
    assert.ok(registration);
    return registration.handler({ principal: { id: callerId }, input: { principalId }, signal: new AbortController().signal } as ToolExecutionContext);
  };
  return { deps, ownerId, make, grantManage, invoke, tool, trashed, app };
}

for (const operation of ["delete", "disable"] as const) {
  test(`HTTP ${operation}: self is refused with SELF_DELETE, including seeded owner`, async () => {
    const f = await setup();
    const adminId = await f.make("self-admin", "admin");
    await f.grantManage(adminId);
    for (const id of [f.ownerId, adminId]) {
      assert.deepEqual(await f.invoke(operation === "delete" ? "delete" : "post", operation === "delete" ? "/:principalId" : "/:principalId/disable", id, id), {
        statusCode: 409, jsonBody: { code: "SELF_DELETE", error: operation === "delete" ? "you cannot delete your own account" : "you cannot disable your own account" },
      });
      assert.equal((await f.deps.principalRepo.findById({ workspaceId, id }))?.status, "active");
      assert.equal(f.trashed.has(id), false);
    }
  });
}
for (const operation of ["delete", "disable", "reset-password"] as const) {
  for (const targetRole of ["admin", "owner"] as const) {
    test(`HTTP ${operation}: non-owner cannot target built-in ${targetRole}`, async () => {
      const f = await setup();
      const caller = await f.make("manager", "admin");
      await f.grantManage(caller);
      const target = await f.make("protected", targetRole);
      const before = await f.deps.userRepo.findByPrincipalId({ workspaceId, principalId: target });
      assert.deepEqual(await f.invoke(operation === "delete" ? "delete" : "post", operation === "delete" ? "/:principalId" : `/:principalId/${operation}`, caller, target, { password: "replacement-password" }), {
        statusCode: 409, jsonBody: { code: "OWNER_REQUIRED", error: "only an owner can delete, trash, disable or reset the password of an admin or owner account" },
      });
      assert.equal((await f.deps.principalRepo.findById({ workspaceId, id: target }))?.status, "active");
      assert.deepEqual(await f.deps.userRepo.findByPrincipalId({ workspaceId, principalId: target }), before);
      assert.equal(f.trashed.has(target), false);
    });
  }
  test(`HTTP ${operation}: owner may target another admin, admin may target ordinary users`, async () => {
    const f = await setup();
    const admin = await f.make("manager", "admin");
    const ordinary = await f.make("ordinary");
    for (const [caller, target] of [[f.ownerId, await f.make("other-admin", "admin")], [admin, ordinary]]) {
      const r = await f.invoke(operation === "delete" ? "delete" : "post", operation === "delete" ? "/:principalId" : `/:principalId/${operation}`, caller, target, { password: "replacement-password" });
      assert.equal(r.statusCode, operation === "disable" ? 200 : 204);
    }
  });
}

test("assistant disable and trash_item use the same self and admin protections", async () => {
  const f = await setup();
  const caller = await f.make("manager", "admin");
  await f.grantManage(caller);
  const target = await f.make("other-admin", "admin");
  await assert.rejects(f.tool("identity_user_disable", f.ownerId, f.ownerId), { message: "identity_user_disable: SELF_DELETE: you cannot disable your own account. Nothing was changed." });
  await assert.rejects(f.tool("identity_user_disable", caller, caller), { message: "identity_user_disable: SELF_DELETE: you cannot disable your own account. Nothing was changed." });
  await assert.rejects(f.tool("identity_user_disable", caller, target), { message: "identity_user_disable: OWNER_REQUIRED: only an owner can delete, trash, disable or reset the password of an admin or owner account. Nothing was changed." });
  const trashTool = bindTrashUserForTool(f.deps);
  await assert.rejects(trashTool({ callerPrincipalId: caller, principalId: target }), { message: "trash_item: only an owner can delete, trash, disable or reset the password of an admin or owner account. Nothing was changed." });
  await assert.rejects(trashTool({ callerPrincipalId: caller, principalId: caller }), { message: "trash_item: you cannot delete your own account. Nothing was changed." });
});

test("all manual purge entry points reject self/seeded owner/admin targets even when base authorize allows", async () => {
  const f = await setup();
  const admin = await f.make("manager", "admin");
  const target = await f.make("other-admin", "admin");
  const ordinary = await f.make("ordinary");
  const authorize = withUserTrashAdminOverride({ base: async () => ({ allowed: true, reason: "grant" }), identity: identityServiceDepsFrom(f.deps), workspaceId });
  for (const id of [admin, target, f.ownerId]) assert.deepEqual(await authorize({ principalId: admin, workspaceId, permission: "user.manage", entityType: "user", entityId: id }), { allowed: false, reason: "owner-account-protection" });
  assert.equal((await authorize({ principalId: admin, workspaceId, permission: "user.manage", entityType: "user", entityId: ordinary })).allowed, true);
  assert.equal((await authorize({ principalId: f.ownerId, workspaceId, permission: "user.manage", entityType: "user", entityId: target })).allowed, true);
});

test("PATCH ignores status/roleIds; enable cannot mutate status to disabled", async () => {
  const f = await setup();
  assert.equal((await f.invoke("patch", "/:principalId", f.ownerId, f.ownerId, { status: "disabled", roleIds: [] })).statusCode, 200);
  assert.equal((await f.invoke("post", "/:principalId/enable", f.ownerId, f.ownerId, { status: "disabled" })).statusCode, 200);
  assert.equal((await f.deps.principalRepo.findById({ workspaceId, id: f.ownerId }))?.status, "active");
  assert.equal((await f.deps.principalRoleRepo.listByPrincipalId({ workspaceId, principalId: f.ownerId })).length, 1);
});

test("last owner wildcard cannot be removed through policy-permission DELETE; transaction rolls back", async () => {
  const f = await setup();
  const last = await f.make("policy-owner");
  const policyId = await f.grantManage(last, ["*"]);
  const seeded = await f.deps.principalRepo.findById({ workspaceId, id: f.ownerId });
  assert.ok(seeded);
  await f.deps.principalRepo.save({ ...seeded, status: "disabled" });
  const rows = await f.deps.policyPermissionRepo.listByPolicyId({ workspaceId, policyId });
  const { res, capture } = createCapturingResponse();
  res.send = () => res;
  res.locals.principal = { id: last };
  await extractRouteHandler(f.app, "delete", "/api/admin/v1/workspaces/:workspaceId/policies/:policyId/permissions/:policyPermissionId")({ params: { workspaceId, policyId, policyPermissionId: rows[0]!.id } }, res);
  assert.deepEqual(capture, { statusCode: 409, jsonBody: { code: "OWNER_REQUIRED", error: "the workspace must keep at least one active owner-`*` principal" } });
  assert.deepEqual(await f.deps.policyPermissionRepo.listByPolicyId({ workspaceId, policyId }), rows);
});

for (const action of ["delete", "patch"] as const) test(`owner role ${action} route refuses built-in owner; role removal has no route/tool`, async () => {
  const f = await setup();
  const role = await f.deps.roleRepo.findByName({ workspaceId, name: "owner" });
  assert.ok(role);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: f.ownerId };
  await extractRouteHandler(f.app, action, "/api/admin/v1/workspaces/:workspaceId/roles/:roleId")({ params: { workspaceId, roleId: role.id }, body: { name: "ordinary" } }, res);
  assert.deepEqual(capture, { statusCode: 400, jsonBody: { code: "VALIDATION_ERROR", error: action === "delete" ? "a built-in role cannot be deleted" : "a built-in role cannot be renamed" } });
  assert.deepEqual(await f.deps.roleRepo.findById({ workspaceId, id: role.id }), role);
});

test("roster labels policy owners and builtin owner/admin targets without changing username", async () => {
  const f = await setup();
  const policyOwner = await f.make("policy-owner");
  await f.grantManage(policyOwner, ["*"]);
  const admin = await f.make("another-admin", "admin");
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: f.ownerId };
  await extractRouteHandler(f.app, "get", base)({ params: { workspaceId } }, res);
  assert.equal(capture.statusCode, 200);
  const users = (capture.jsonBody as { users: { principalId: string; username: string; isOwner: boolean; isProtectedAccount: boolean }[] }).users;
  assert.deepEqual(users.filter(u => [f.ownerId, policyOwner, admin].includes(u.principalId)).map(u => [u.isOwner, u.isProtectedAccount]), [[true, true], [true, true], [false, true]]);
  assert.equal(users.find(u => u.principalId === f.ownerId)?.username, "admin");
});

test("assistant status/profile schemas cannot disable through enable/update; no role unassign or password-reset tool exists", async () => {
  const f = await setup();
  const tools = buildGatedIdentityRegistrations(f.deps);
  for (const id of ["identity_user_enable", "identity_user_update_email"]) {
    const registration = tools.find(r => r.descriptor.id === id);
    assert.ok(registration);
    const schema = registration.descriptor.inputSchema as { properties: Record<string, unknown>; additionalProperties: boolean };
    assert.equal(schema.properties.status, undefined);
    assert.equal(schema.properties.roleIds, undefined);
    assert.equal(schema.additionalProperties, false);
  }
  assert.equal(tools.some(r => /unassign|reset.*password|password.*reset|remove.*permission/.test(r.descriptor.id)), false);
});
