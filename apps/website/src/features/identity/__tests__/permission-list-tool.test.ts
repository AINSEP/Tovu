import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext } from "@jini-ai/core";
import { buildRegistrations, catalog, contributeIdentityPolicyListPermissionsTools, derivedRisk, type Deps } from "../permission-list-tool.js";

/**
 * @file `identity_policy_list_permissions` (L7 Stryker: 30.6 %, the handler never ran). Denials first:
 * the caller must hold `role.manage`, and the policy id must be a non-empty string naming a policy in
 * THIS workspace. DI fakes only.
 */

const WS = "ws-1";
const GRANTS = [{ id: "pp-1", workspaceId: WS, policyId: "pol-1", permission: "post.read" }, { id: "pp-2", workspaceId: WS, policyId: "pol-1", permission: "post.edit" }];

function harness(options: { allowed?: boolean } = {}) {
  const calls: { authorize: unknown[]; findById: unknown[]; list: unknown[] } = { authorize: [], findById: [], list: [] };
  const deps = {
    workspaceId: WS,
    authorize: async (input: unknown) => { calls.authorize.push(input); return options.allowed ?? true; },
    policyRepo: { findById: async (input: { workspaceId: string; id: string }) => { calls.findById.push(input); return input.workspaceId === WS && input.id === "pol-1" ? { id: "pol-1", workspaceId: WS, name: "p" } : null; } },
    policyPermissionRepo: { listByPolicyId: async (input: unknown) => { calls.list.push(input); return GRANTS; } },
  } as unknown as Deps;
  const [tool] = buildRegistrations(deps);
  const run = (input: unknown) => tool!.handler({ executionId: "e", principal: { id: "principal-1" }, run: { id: "r" }, input, signal: new AbortController().signal } as ToolExecutionContext);
  return { tool: tool!, run, calls };
}

test("the catalog pins role.manage, a read-only risk and a strict one-field input schema", () => {
  assert.deepEqual(catalog.map(({ name, sideEffects, authorization, inputSchema }) => ({ name, sideEffects, authorization, inputSchema })), [{
    name: "identity_policy_list_permissions", sideEffects: "none", authorization: { permission: "role.manage" },
    inputSchema: { type: "object", additionalProperties: false, required: ["policyId"], properties: { policyId: { type: "string", minLength: 1 } } },
  }]);
  assert.deepEqual([...derivedRisk], [["identity_policy_list_permissions", "none"]]);
  const contributor = contributeIdentityPolicyListPermissionsTools();
  assert.equal(contributor.domain, "identity-policy-list-permissions");
  assert.equal(contributor.build, buildRegistrations);
  assert.equal(contributor.risk, derivedRisk);
});

test("an allowed caller gets the policy's permissions, read from this workspace", async () => {
  const h = harness();
  assert.equal(h.tool.descriptor.id, "identity_policy_list_permissions");
  assert.deepEqual(await h.run({ policyId: "pol-1" }), { policyPermissions: GRANTS });
  assert.deepEqual(h.calls.findById, [{ workspaceId: WS, id: "pol-1" }]);
  assert.deepEqual(h.calls.list, [{ workspaceId: WS, policyId: "pol-1" }]);
});

test("a caller without role.manage is refused before any policy is read", async () => {
  const h = harness({ allowed: false });
  await assert.rejects(h.run({ policyId: "pol-1" }), (error: Error) => {
    assert.notEqual(error.name, "ToolInputError");
    assert.match(error.message, /role\.manage/);
    return true;
  });
  assert.equal(h.calls.authorize.length, 1);
  assert.deepEqual(h.calls.findById, []);
  assert.deepEqual(h.calls.list, []);
});

for (const [label, input] of [
  ["missing policyId", {}], ["empty policyId", { policyId: "" }], ["blank policyId", { policyId: "   " }],
  ["numeric policyId", { policyId: 7 }], ["null policyId", { policyId: null }], ["array policyId", { policyId: ["pol-1"] }],
] as const) {
  test(`${label} is refused with the non-empty-string message and reads nothing`, async () => {
    const h = harness();
    await assert.rejects(h.run(input), { name: "ToolInputError", message: "policyId must be a non-empty string." });
    assert.deepEqual(h.calls.findById, []);
  });
}

test("a non-object input is refused as a ToolInputError", async () => {
  const h = harness();
  await assert.rejects(h.run("pol-1"), { name: "ToolInputError" });
  assert.deepEqual(h.calls.findById, []);
});

test("an unknown policy is refused with lookup guidance and its grants are never listed", async () => {
  const h = harness();
  await assert.rejects(h.run({ policyId: "pol-other" }), {
    name: "ToolInputError", message: "policy 'pol-other' was not found. Use content_read.identity_policy to find a policy id.",
  });
  assert.deepEqual(h.calls.list, []);
});
