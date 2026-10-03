import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminPolicyPermissionRemoveRoute } from "../remove-policy-permission.js";

// F6.2/F6.3/F7.6: leaking a delete failure or returning 204 without deleting on retry must fail.
// The service/evaluator and repositories stay real; only the first delete is fault-injected.
test("permission removal hides storage failures, retains the row on failure, and allows a subsequent removal", async (t) => {
  const deps = createRouteDeps();
  await deps.identityReady;
  const ownerId = await deps.ownerPrincipalId;
  const policy = { id: "b07-custom-policy", workspaceId: deps.workspaceId, name: "Retry removal", isBuiltin: false, isFrozen: false };
  const permission = { id: "b07-permission", workspaceId: deps.workspaceId, policyId: policy.id, permission: "content.read", resourceType: null, constraintJson: null };
  await deps.policyRepo.save(policy);
  await deps.policyPermissionRepo.save(permission);
  const read = () => deps.policyPermissionRepo.listByPolicyId({ workspaceId: deps.workspaceId, policyId: policy.id });
  assert.deepEqual(await read(), [permission]);
  const remove = deps.policyPermissionRepo.delete.bind(deps.policyPermissionRepo);
  const calls: unknown[] = [];
  t.mock.method(deps.policyPermissionRepo, "delete", async (input: Parameters<typeof remove>[0]) => {
    calls.push(input);
    if (calls.length === 1) throw new Error("secret connection credentials");
    return remove(input);
  });
  const app = express();
  registerAdminPolicyPermissionRemoveRoute(app, deps);
  const handler = extractRouteHandler(app, "delete", "/api/admin/v1/workspaces/:workspaceId/policies/:policyId/permissions/:policyPermissionId");
  const sentBodies: unknown[] = [];
  const invoke = async () => {
    const { res, capture } = createCapturingResponse();
    res.send = (body?: unknown) => {
      sentBodies.push(body);
      return res;
    };
    res.locals.principal = { id: ownerId };
    await handler({ params: { workspaceId: deps.workspaceId, policyId: policy.id, policyPermissionId: permission.id } }, res);
    return capture;
  };
  assert.deepEqual(await invoke(), { statusCode: 500, jsonBody: { error: "internal error" } });
  assert.deepEqual(await read(), [permission]);
  assert.deepEqual(await invoke(), { statusCode: 204, jsonBody: undefined });
  assert.deepEqual(sentBodies, [undefined]);
  assert.deepEqual(await read(), []);
  assert.deepEqual(calls, [
    { workspaceId: deps.workspaceId, id: "b07-permission" },
    { workspaceId: deps.workspaceId, id: "b07-permission" },
  ]);
  assert.deepEqual(await deps.policyRepo.findById({ workspaceId: deps.workspaceId, id: policy.id }), policy);
});
