import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminPolicyPermissionRemoveRoute } from "../remove-policy-permission.js";

/**
 * @file Error-envelope coverage for `DELETE policies/:policyId/permissions/:policyPermissionId`,
 * against the real identity services and repositories (`createRouteDeps()`): the caller-lacks-
 * `role.manage` refusal, the owner-wildcard guard, a built-in policy, a permission id that is not a
 * member of the policy, and hand-built requests whose `policyId`/`policyPermissionId` params are
 * absent (the `?? ""` guards must turn those into an honest not-found, never a delete).
 */

const PATH = "/api/admin/v1/workspaces/:workspaceId/policies/:policyId/permissions/:policyPermissionId";

async function harness() {
  const deps = createRouteDeps();
  await deps.identityReady;
  const ownerId = await deps.ownerPrincipalId;
  const app = express();
  registerAdminPolicyPermissionRemoveRoute(app, deps);
  const handler = extractRouteHandler(app, "delete", PATH);
  const invoke = async (callerId: string, params: Record<string, string>) => {
    const { res, capture } = createCapturingResponse();
    (res as any).send = () => res;
    res.locals.principal = { id: callerId };
    await handler({ params: { workspaceId: deps.workspaceId, ...params } }, res);
    return capture;
  };
  return { deps, ownerId, invoke };
}

/** Saves an active principal holding a custom policy with exactly `permissions`. */
async function grant(deps: ReturnType<typeof createRouteDeps>, suffix: string, permissions: readonly string[]) {
  const principalId = `rpp-principal-${suffix}`;
  const policyId = `rpp-grant-policy-${suffix}`;
  await deps.principalRepo.save({ id: principalId, workspaceId: deps.workspaceId, kind: "user", displayName: suffix, status: "active", createdAt: deps.clock.nowIso() });
  await deps.policyRepo.save({ id: policyId, workspaceId: deps.workspaceId, name: `grant-${suffix}`, isBuiltin: false, isFrozen: false });
  for (const permission of permissions) {
    await deps.policyPermissionRepo.save({ id: `rpp-pp-${suffix}-${permission}`, workspaceId: deps.workspaceId, policyId, permission, resourceType: null, constraintJson: null });
  }
  await deps.principalPolicyRepo.save({ id: `rpp-link-${suffix}`, workspaceId: deps.workspaceId, principalId, policyId });
  return principalId;
}

async function targetPolicy(deps: ReturnType<typeof createRouteDeps>, permission: string, isBuiltin = false) {
  const policy = { id: `rpp-target-${permission === "*" ? "wild" : permission}-${isBuiltin}`, workspaceId: deps.workspaceId, name: `target ${permission} ${isBuiltin}`, isBuiltin, isFrozen: false };
  const row = { id: `${policy.id}-row`, workspaceId: deps.workspaceId, policyId: policy.id, permission, resourceType: null, constraintJson: null };
  await deps.policyRepo.save(policy);
  await deps.policyPermissionRepo.save(row);
  const read = () => deps.policyPermissionRepo.listByPolicyId({ workspaceId: deps.workspaceId, policyId: policy.id });
  return { policy, row, read };
}

test("a caller without role.manage is refused 403 FORBIDDEN and the permission row survives", async () => {
  const { deps, invoke } = await harness();
  const callerId = await grant(deps, "reader", ["content.read"]);
  const { policy, row, read } = await targetPolicy(deps, "content.read");
  const result = await invoke(callerId, { policyId: policy.id, policyPermissionId: row.id });
  assert.equal(result.statusCode, 403);
  const body = result.jsonBody as { code: string; details: { permission: string; reason: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "role.manage");
  assert.equal(typeof body.details.reason, "string");
  assert.deepEqual(await read(), [row]);
});

test("a non-owner holding role.manage cannot strip the owner wildcard '*' row — 409 OWNER_REQUIRED", async () => {
  const { deps, invoke } = await harness();
  const callerId = await grant(deps, "manager", ["role.manage"]);
  const { policy, row, read } = await targetPolicy(deps, "*");
  assert.deepEqual(await invoke(callerId, { policyId: policy.id, policyPermissionId: row.id }), {
    statusCode: 409, jsonBody: { error: "only an owner can modify an owner principal", code: "OWNER_REQUIRED" },
  });
  assert.deepEqual(await read(), [row]);
});

test("the owner may remove a wildcard row from a policy nobody holds — the owner floor is untouched", async () => {
  const { deps, ownerId, invoke } = await harness();
  const { policy, row, read } = await targetPolicy(deps, "*");
  assert.deepEqual(await invoke(ownerId, { policyId: policy.id, policyPermissionId: row.id }), { statusCode: 204, jsonBody: undefined });
  assert.deepEqual(await read(), []);
});

test("a non-owner with role.manage removes an ordinary permission row (the wildcard guard is scoped to '*')", async () => {
  const { deps, invoke } = await harness();
  const callerId = await grant(deps, "manager2", ["role.manage"]);
  const { policy, row, read } = await targetPolicy(deps, "content.read");
  assert.deepEqual(await invoke(callerId, { policyId: policy.id, policyPermissionId: row.id }), { statusCode: 204, jsonBody: undefined });
  assert.deepEqual(await read(), []);
});

test("a built-in parent policy is refused 400 VALIDATION_ERROR", async () => {
  const { deps, ownerId, invoke } = await harness();
  const { policy, row, read } = await targetPolicy(deps, "content.read", true);
  const result = await invoke(ownerId, { policyId: policy.id, policyPermissionId: row.id });
  assert.equal(result.statusCode, 400);
  assert.equal((result.jsonBody as { code: string }).code, "VALIDATION_ERROR");
  assert.deepEqual(await read(), [row]);
});

test("absent policyId / policyPermissionId params resolve to 404 RESOURCE_NOT_FOUND, never a delete", async () => {
  const { deps, ownerId, invoke } = await harness();
  const { policy, row, read } = await targetPolicy(deps, "content.read");
  for (const params of [{ policyPermissionId: row.id }, { policyId: policy.id }]) {
    const result = await invoke(ownerId, params as Record<string, string>);
    assert.equal(result.statusCode, 404, JSON.stringify(params));
    assert.equal((result.jsonBody as { code: string }).code, "RESOURCE_NOT_FOUND");
  }
  assert.deepEqual(await read(), [row]);
});
