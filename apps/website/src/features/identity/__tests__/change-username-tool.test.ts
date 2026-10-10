import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { createUser, login, validateSession } from "@jini-ai/user-management/server";
import { identityServiceDepsFrom } from "#src/server/inbound/admin-http/routes/users/deps";
import { buildGatedIdentityRegistrations } from "../tool-registrations.js";
import { realToolCatalog } from "#src/assistant/__tests__/real-tool-catalog.fixture";

const TOOL = "identity_user_change_username";
test("the host username tool shares HTTP lifecycle ports, preserves sessions, audits, and hides secrets", async () => {
  const deps = createRouteDeps(); await deps.identityReady; const owner = await deps.ownerPrincipalId;
  const service = identityServiceDepsFrom(deps);
  const { user } = await createUser({ deps: service, input: { workspaceId: deps.workspaceId,
    callerPrincipalId: owner, username: "tool-rename", password: "tool-rename-password" } }, { email: "preserved@example.test" });
  const session = await login({ deps: service, input: { workspaceId: deps.workspaceId, username: user.username, password: "tool-rename-password" } });
  const tool = buildGatedIdentityRegistrations(deps).find(item => item.descriptor.id === TOOL); assert.ok(tool);
  const context: ToolExecutionContext = { executionId: "rename-execution", principal: { id: owner }, run: { id: "rename-run" },
    input: { principalId: user.principalId, username: " TOOL-RENAMED " }, signal: new AbortController().signal };
  const output = await tool.handler(context) as { user: { username: string; email: string } };
  assert.equal(output.user.username, "tool-renamed"); assert.equal(output.user.email, "preserved@example.test");
  assert.equal(JSON.stringify(output).includes("passwordHash"), false);
  assert.equal((await validateSession({ deps: service, input: { workspaceId: deps.workspaceId, rawToken: session.rawToken } }))?.principal.id, user.principalId);
  const rows = await deps.outbox.claimPending({ batchSize: 100, nowIso: deps.clock.nowIso() });
  const rename = rows.filter(row => row.event.name === "identity.user.username_changed");
  assert.equal(rename.length, 1); assert.equal(rename[0]!.event.actorId, owner);
  assert.deepEqual(rename[0]!.event.payload, { principalId: user.principalId, previousUsername: "tool-rename", username: "tool-renamed" });
  await assert.rejects(() => tool.handler({ ...context, principal: { id: user.principalId }, input: { principalId: user.principalId, username: "forbidden" } }),
    error => error instanceof Error && error.message.includes("user.manage"));
  const beforeOwner = await deps.userRepo.findByPrincipalId({ workspaceId: deps.workspaceId, principalId: owner });
  await assert.rejects(() => tool.handler({ ...context, input: { principalId: owner, username: "renamed-seeded-owner" } }),
    { message: "the seeded owner's username cannot be changed until a persistent owner identity is configured" });
  assert.deepEqual(await deps.userRepo.findByPrincipalId({ workspaceId: deps.workspaceId, principalId: owner }), beforeOwner);
});

test("search_tools discovers the registered username tool for account rename requests", async () => {
  const { catalog } = await realToolCatalog();
  for (const query of ["change username", "rename my login username", "change user account name"]) {
    assert.ok(catalog.search({ query }, { limit: 5 }).some(hit => hit.id === TOOL), query);
  }
});
