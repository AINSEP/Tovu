import assert from "node:assert/strict";
import test from "node:test";
import { createApp, createRouteDeps } from "../runtime/composition/app.js";
import { bootAuthenticated, loginAsBarePrincipal } from "./helpers/http-test-server.js";

// F2.4/F3.1/F4.4: use production mounting, authentication and real authorization over HTTP.
// Author checklist: no mocked subject/gateway; real login; nonempty picker fixtures; read back
// a refused PATCH through owner GET (F6.3); per-test deps; server teardown registered by helper.
// Mutation: removing the role.manage/workspace.manage guard must expose data or allow the write.
// NOT RUN here: bootAuthenticated binds a port, forbidden by this sandbox.
test("role and policy pickers refuse an authenticated user with no role.manage grant", async (t) => {
  const deps = createRouteDeps();
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl, { username: "b07-picker-reader" });
  for (const kind of ["roles", "policies"]) {
    const url = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${kind}`;
    const owner = await fetch(url, { headers: { cookie } });
    assert.equal(owner.status, 200);
    const seeded = await owner.json() as Record<string, { name: string }[]>;
    assert.ok(seeded[kind].length > 0, "real seed ensures a bypass would disclose data");
    const denied = await fetch(url, { headers: { cookie: bareCookie } });
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), {
      error: "principal 'bare-b07-picker-reader' is not authorized for 'role.manage' (no_grant)",
      code: "FORBIDDEN", details: { permission: "role.manage", reason: "no_grant" },
    });
  }
});

test("workspace get and PATCH refuse an authenticated user with no workspace.manage grant and preserve the row", async (t) => {
  const deps = createRouteDeps();
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl, { username: "b07-workspace-reader" });
  const url = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}`;
  const before = await fetch(url, { headers: { cookie } });
  assert.equal(before.status, 200);
  const expected = await before.json() as { workspace: { name: string } };
  assert.notEqual(expected.workspace.name, "Unauthorized rename b07");
  for (const method of ["GET", "PATCH"]) {
    const denied = await fetch(url, { method, headers: { cookie: bareCookie, "content-type": "application/json" },
      ...(method === "PATCH" ? { body: JSON.stringify({ name: "Unauthorized rename b07" }) } : {}) });
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), {
      error: "principal 'bare-b07-workspace-reader' is not authorized for 'workspace.manage' (no_grant)",
      code: "FORBIDDEN", details: { permission: "workspace.manage", reason: "no_grant" },
    });
  }
  const after = await fetch(url, { headers: { cookie } });
  assert.equal(after.status, 200);
  assert.deepEqual(await after.json(), expected);
});
