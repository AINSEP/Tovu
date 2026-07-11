import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "../app";

/**
 * @file Route-level proof of the SPEC-006 core path: real login, the gateway
 * `authorize()` gate on posts create/update (AC-03/AC-04-style), `AUTH_ME`
 * introspection (REQ-07), and disable-mid-session invalidation (AC-05-style).
 *
 * There is no HTTP/CLI surface yet for `CREATE_USER`/`ASSIGN_ROLE` (out of
 * scope this pass — see the Programmer handoff), so a second, lesser-
 * privileged principal is constructed directly against the in-memory
 * identity repos `createRouteDeps()` exposes on `RouteDeps` — the same repos
 * the running server reads from, since the same `deps` object is passed into
 * `createApp(deps)` below.
 */

async function bootServer(deps: ReturnType<typeof createRouteDeps>) {
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function loginAs(baseUrl: string, username: string, password: string) {
  const res = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return { res, cookie: res.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

test("AC-02: wrong password is rejected 401 and never sets a session cookie", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { res, cookie } = await loginAs(baseUrl, "admin", "wrong-password");
  assert.equal(res.status, 401);
  assert.equal(cookie, "");
});

test("REQ-07: AUTH_ME returns the owner principal with '*' in its effective permission set", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const me = await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } });
  assert.equal(me.status, 200);
  const body = (await me.json()) as { user: { id: string; username: string }; effectivePermissions: string[] };
  assert.equal(body.user.username, "admin");
  assert.deepEqual(body.effectivePermissions, ["*"]);
});

test("AC-03/AC-04: a viewer principal is denied content.write with a typed 403, and no post is created", async (t) => {
  const deps = createRouteDeps();
  await deps.identityReady;

  const viewerRole = (await deps.roleRepo.list({ workspaceId: deps.workspaceId })).find(
    (role) => role.name === "viewer"
  );
  assert.ok(viewerRole, "seed created a built-in viewer role");

  const viewerPrincipalId = "viewer-principal-1";
  await deps.principalRepo.save({
    id: viewerPrincipalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "Viewer",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: viewerPrincipalId,
    workspaceId: deps.workspaceId,
    username: "viewer1",
    passwordHash: await deps.passwordHasher.hash("viewer-pw"),
  });
  await deps.principalRoleRepo.save({
    id: "pr-viewer-1",
    workspaceId: deps.workspaceId,
    principalId: viewerPrincipalId,
    roleId: viewerRole!.id,
  });

  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "viewer1", "viewer-pw");
  assert.ok(cookie, "viewer login succeeded");

  const before = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/posts`, {
    headers: { cookie },
  });
  const beforeCount = ((await before.json()) as { posts: unknown[] }).posts.length;

  const createResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/posts`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Should not be created" }),
  });
  assert.equal(createResponse.status, 403);
  const body = (await createResponse.json()) as { code: string; details: { permission: string; reason: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "content.write");
  assert.equal(body.details.reason, "no_grant");

  const after = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/posts`, {
    headers: { cookie },
  });
  const afterCount = ((await after.json()) as { posts: unknown[] }).posts.length;
  assert.equal(afterCount, beforeCount, "no post was created for the denied caller");
});

test("AC-05/EC-02: disabling a principal mid-session invalidates its existing session on the next request", async (t) => {
  const deps = createRouteDeps();
  await deps.identityReady;

  const editorPrincipalId = "editor-principal-1";
  const editorRole = (await deps.roleRepo.list({ workspaceId: deps.workspaceId })).find(
    (role) => role.name === "editor"
  );
  assert.ok(editorRole);

  await deps.principalRepo.save({
    id: editorPrincipalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "Editor",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: editorPrincipalId,
    workspaceId: deps.workspaceId,
    username: "editor1",
    passwordHash: await deps.passwordHasher.hash("editor-pw"),
  });
  await deps.principalRoleRepo.save({
    id: "pr-editor-1",
    workspaceId: deps.workspaceId,
    principalId: editorPrincipalId,
    roleId: editorRole!.id,
  });

  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "editor1", "editor-pw");
  const meBefore = await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } });
  assert.equal(meBefore.status, 200);

  await deps.principalRepo.save({
    id: editorPrincipalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "Editor",
    status: "disabled",
    disabledAt: deps.clock.nowIso(),
    createdAt: deps.clock.nowIso(),
  });

  const meAfter = await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } });
  assert.equal(meAfter.status, 401);
});

test("AC-03: an editor CAN create a post through the gateway, and the change-set actorId is the editor's real principal id", async (t) => {
  const deps = createRouteDeps();
  await deps.identityReady;

  const editorPrincipalId = "editor-principal-2";
  const editorRole = (await deps.roleRepo.list({ workspaceId: deps.workspaceId })).find(
    (role) => role.name === "editor"
  );
  assert.ok(editorRole);

  await deps.principalRepo.save({
    id: editorPrincipalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "Editor Two",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: editorPrincipalId,
    workspaceId: deps.workspaceId,
    username: "editor2",
    passwordHash: await deps.passwordHasher.hash("editor2-pw"),
  });
  await deps.principalRoleRepo.save({
    id: "pr-editor-2",
    workspaceId: deps.workspaceId,
    principalId: editorPrincipalId,
    roleId: editorRole!.id,
  });

  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "editor2", "editor2-pw");
  const createResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/posts`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Editor's post" }),
  });
  assert.equal(createResponse.status, 201);

  // `listByWorkspace` sorts newest-first (see `core/commands/repo.memory.ts`).
  const changeSets = await deps.changeSets.listByWorkspace({ workspaceId: deps.workspaceId });
  const latest = changeSets[0];
  assert.equal(latest.actorId, editorPrincipalId, "the change-set actorId is the real principal, not 'user-local'");
});
