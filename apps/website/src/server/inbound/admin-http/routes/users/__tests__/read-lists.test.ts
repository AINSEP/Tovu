import assert from "node:assert/strict";
import test from "node:test";
import { portFake } from "#src/server/__tests__/helpers/port-fake";
import type { UsersRouteDeps } from "../deps.js";
import express from "express";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminPolicyListRoute } from "../list-policies.js";
import { registerAdminRoleListRoute } from "../list-roles.js";
import { registerAdminPolicyPermissionListRoute } from "../list-policy-permissions.js";

const base = "/api/admin/v1/workspaces/:workspaceId";
function harness(overrides: Record<string, unknown>) {
  const app = express();
  const deps = { workspaceId: "ws-7", authorize: async () => ({ allowed: true, reason: "matched" }), ...overrides } as any;
  registerAdminPolicyListRoute(app, deps);
  registerAdminRoleListRoute(app, deps);
  registerAdminPolicyPermissionListRoute(app, deps);
  return async (suffix: string, workspaceId = "ws-7") => {
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "principal-7" };
    await extractRouteHandler(app, "get", base + suffix)({ params: { workspaceId, policyId: "policy-7" } }, res);
    return capture;
  };
}
// F1.2/F4.1: omitted flags/description, unscoped repository calls, or leaked fields must fail.
test("policy and role lists scope repository reads and project custom and built-in flags", async () => {
  const invoke = harness({
    policyRepo: { list: async (input: unknown) => {
      assert.deepEqual(input, { workspaceId: "ws-7" });
      return [{ id: "policy-7", workspaceId: "ws-7", name: "Review", description: "Review content", isBuiltin: false, isFrozen: true, internal: "hidden" }];
    } },
    roleRepo: { list: async (input: unknown) => {
      assert.deepEqual(input, { workspaceId: "ws-7" });
      return [{ id: "role-7", workspaceId: "ws-7", name: "Reviewer", isBuiltin: true, internal: "hidden" }];
    } },
  });
  assert.deepEqual(await invoke("/policies"), { statusCode: 200, jsonBody: { policies: [
    { id: "policy-7", workspaceId: "ws-7", name: "Review", description: "Review content", isBuiltin: false, isFrozen: true },
  ] } });
  assert.deepEqual(await invoke("/roles"), { statusCode: 200, jsonBody: { roles: [
    { id: "role-7", workspaceId: "ws-7", name: "Reviewer", isBuiltin: true },
  ] } });
});
test("missing policy returns RESOURCE_NOT_FOUND without listing orphan permission rows", async () => {
  let reads = 0;
  const invoke = harness({ policyRepo: { findById: async (input: unknown) => {
    assert.deepEqual(input, { workspaceId: "ws-7", id: "policy-7" }); return null;
  } }, policyPermissionRepo: { listByPolicyId: async () => { reads++; return [{ id: "orphan" }]; } } });
  assert.deepEqual(await invoke("/policies/:policyId/permissions"), {
    statusCode: 404, jsonBody: { error: "policy 'policy-7' was not found", code: "RESOURCE_NOT_FOUND" },
  });
  assert.equal(reads, 0);
});
test("permission list retains constraint and resource fields from the selected policy only", async () => {
  const invoke = harness({ policyRepo: { findById: async () => ({ id: "policy-7" }) },
    policyPermissionRepo: { listByPolicyId: async (input: unknown) => {
      assert.deepEqual(input, { workspaceId: "ws-7", policyId: "policy-7" });
      return [{ id: "pp-9", workspaceId: "ws-7", policyId: "policy-7", permission: "content.read", resourceType: "post", constraintJson: '{"status":"published"}' }];
    } } });
  assert.deepEqual(await invoke("/policies/:policyId/permissions"), { statusCode: 200, jsonBody: { policyPermissions: [
    { id: "pp-9", workspaceId: "ws-7", policyId: "policy-7", permission: "content.read", resourceType: "post", constraintJson: '{"status":"published"}' },
  ] } });
});
test("list repository failures return generic 500 without leaking storage details", async () => {
  const fail = async () => { throw new Error("private storage detail"); };
  const invoke = harness({ policyRepo: { list: fail, findById: async () => ({ id: "policy-7" }) }, roleRepo: { list: fail }, policyPermissionRepo: { listByPolicyId: fail } });
  for (const suffix of ["/roles", "/policies", "/policies/:policyId/permissions"]) {
    assert.deepEqual(await invoke(suffix), { statusCode: 500, jsonBody: { error: "internal error" } });
  }
});
test("wrong workspace returns 404 before any repository access", async () => {
  const invoke = harness({});
  for (const suffix of ["/roles", "/policies", "/policies/:policyId/permissions"]) {
    assert.deepEqual(await invoke(suffix, "foreign"), { statusCode: 404, jsonBody: { error: "workspace was not found" } });
  }
});
test("denied role.manage returns the standard 403 before any repository access", async () => {
  let reads = 0;
  const count = async () => { reads++; return []; };
  const invoke = harness({
    authorize: async (input: unknown) => {
      assert.deepEqual(input, { principalId: "principal-7", permission: "role.manage", workspaceId: "ws-7" });
      return { allowed: false, reason: "no matching grant" };
    },
    policyRepo: { list: count, findById: count }, roleRepo: { list: count }, policyPermissionRepo: { listByPolicyId: count },
  });
  for (const suffix of ["/roles", "/policies", "/policies/:policyId/permissions"]) {
    assert.deepEqual(await invoke(suffix), { statusCode: 403, jsonBody: {
      error: "principal 'principal-7' is not authorized for 'role.manage' (no matching grant)", code: "FORBIDDEN", details: { permission: "role.manage", reason: "no matching grant" },
    } });
  }
  assert.equal(reads, 0);
});
// Route-param guards (`String(req.params.X ?? "")`): a request with no params must still 404 cleanly.
test("absent workspaceId param falls back to empty string and 404s on every list route", async () => {
  const app = express();
  const deps = portFake<UsersRouteDeps>({ workspaceId: "ws-7", authorize: async () => ({ allowed: true, reason: "matched" }) });
  registerAdminPolicyListRoute(app, deps);
  registerAdminRoleListRoute(app, deps);
  registerAdminPolicyPermissionListRoute(app, deps);
  for (const suffix of ["/roles", "/policies", "/policies/:policyId/permissions"]) {
    const { res, capture } = createCapturingResponse();
    await extractRouteHandler(app, "get", base + suffix)({ params: {} }, res);
    assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "workspace was not found" } });
  }
});
test("absent policyId param falls back to empty string and looks up policy ''", async () => {
  const app = express();
  const deps = portFake<UsersRouteDeps>({ workspaceId: "ws-7", authorize: async () => ({ allowed: true, reason: "matched" }), policyRepo: {
    findById: async (input: unknown) => { assert.deepEqual(input, { workspaceId: "ws-7", id: "" }); return null; },
  } });
  registerAdminPolicyPermissionListRoute(app, deps);
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-7" };
  await extractRouteHandler(app, "get", base + "/policies/:policyId/permissions")({ params: { workspaceId: "ws-7" } }, res);
  assert.deepEqual(capture, { statusCode: 404, jsonBody: { error: "policy '' was not found", code: "RESOURCE_NOT_FOUND" } });
});
