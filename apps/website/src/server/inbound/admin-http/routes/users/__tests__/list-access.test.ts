import assert from "node:assert/strict";
import test from "node:test";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { bootAuthenticated, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";

// F3.1/F4.4: real session middleware and real identity evaluator; removing role.manage must fail.
test("role and policy pickers deny an authenticated principal with no role.manage and allow the owner", async (t) => {
  const deps = createRouteDeps();
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl, { username: "b07-list-bare" });
  for (const kind of ["roles", "policies"]) {
    const url = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${kind}`;
    const anonymous = await fetch(url);
    assert.equal(anonymous.status, 401);
    const denied = await fetch(url, { headers: { cookie: bareCookie } });
    assert.equal(denied.status, 403);
    const body = await denied.json();
    assert.equal(body.code, "FORBIDDEN");
    assert.deepEqual(body.details, { permission: "role.manage", reason: "no_grant" });
    const allowed = await fetch(url, { headers: { cookie } });
    assert.equal(allowed.status, 200);
    const expected = kind === "roles" ? await deps.roleRepo.list({ workspaceId: deps.workspaceId }) : await deps.policyRepo.list({ workspaceId: deps.workspaceId });
    assert.ok(expected.length > 0);
    assert.deepEqual((await allowed.json())[kind].map((row: { id: string }) => row.id).sort(), expected.map(row => row.id).sort());
  }
});
