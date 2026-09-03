import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "../runtime/composition/app.js";

/**
 * @file Route-level proof of SPEC-044 (Workspace Administration) — AC-01..AC-08.
 *
 * Mirrors `identity-routes.test.ts`'s harness (`bootServer`/`loginAs`) and dev-seed credentials
 * (`admin`/`tovu-dev`, `deps.workspaceId === "workspace-local"`).
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

test("AC-01: unauthenticated POST /api/admin/v1/workspaces is refused 401, and the old POST /workspaces path is gone", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const created = await fetch(`${baseUrl}/api/admin/v1/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Nope", slug: "nope" }),
  });
  assert.equal(created.status, 401);

  const oldPath = await fetch(`${baseUrl}/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Nope", slug: "nope" }),
  });
  assert.equal(oldPath.status, 404, "the old unauthenticated route no longer exists");
});

test("AC-02: an authenticated admin (workspace.manage) can create a workspace, and duplicate slug is 409", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");

  const created = await fetch(`${baseUrl}/api/admin/v1/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Second Site", slug: "second-site" }),
  });
  assert.equal(created.status, 201);

  const dup = await fetch(`${baseUrl}/api/admin/v1/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Dup", slug: "second-site" }),
  });
  assert.equal(dup.status, 409);
  const dupBody = (await dup.json()) as { code?: string };
  assert.equal(dupBody.code, "RESOURCE_CONFLICT");

  const badSlug = await fetch(`${baseUrl}/api/admin/v1/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Bad", slug: "Not A Slug" }),
  });
  assert.equal(badSlug.status, 400);
});

test("AC-03: GET /api/admin/v1/workspaces returns exactly the caller's own workspace, and is denied without workspace.manage", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const listed = await fetch(`${baseUrl}/api/admin/v1/workspaces`, { headers: { cookie } });
  assert.equal(listed.status, 200);
  const body = (await listed.json()) as { workspaces: Array<{ id: string }> };
  assert.equal(body.workspaces.length, 1);
  assert.equal(body.workspaces[0].id, deps.workspaceId);

  // AC-08: a caller holding only settings.write (not workspace.manage) is denied.
  await deps.identityReady;
  const viewerRole = (await deps.roleRepo.list({ workspaceId: deps.workspaceId })).find(
    (role) => role.name === "viewer"
  );
  assert.ok(viewerRole, "seed created a built-in viewer role");
  await deps.principalRepo.save({
    id: "ws-viewer-1",
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "Viewer",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: "ws-viewer-1",
    workspaceId: deps.workspaceId,
    username: "wsviewer",
    passwordHash: await deps.passwordHasher.hash("viewer-pw"),
  });
  await deps.principalRoleRepo.save({
    id: "pr-ws-viewer-1",
    workspaceId: deps.workspaceId,
    principalId: "ws-viewer-1",
    roleId: viewerRole!.id,
  });
  const { cookie: viewerCookie } = await loginAs(baseUrl, "wsviewer", "viewer-pw");
  const deniedList = await fetch(`${baseUrl}/api/admin/v1/workspaces`, { headers: { cookie: viewerCookie } });
  assert.equal(deniedList.status, 403);
});

test("AC-04: GET /api/admin/v1/workspaces/:workspaceId 404s on a mismatched id, 200s on the caller's own", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");

  const mismatched = await fetch(`${baseUrl}/api/admin/v1/workspaces/some-other-id`, { headers: { cookie } });
  assert.equal(mismatched.status, 404);

  const own = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}`, { headers: { cookie } });
  assert.equal(own.status, 200);
  const body = (await own.json()) as { workspace: { id: string; slug: string } };
  assert.equal(body.workspace.id, deps.workspaceId);
});

test("AC-05: PATCH renames name/slug, rejects a colliding slug, and rejects an invalid slug", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");

  const renamed = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Renamed Site" }),
  });
  assert.equal(renamed.status, 200);
  const renamedBody = (await renamed.json()) as { workspace: { name: string } };
  assert.equal(renamedBody.workspace.name, "Renamed Site");

  // Create a second workspace, then try to rename the first onto the second's slug.
  await fetch(`${baseUrl}/api/admin/v1/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Other", slug: "other-slug" }),
  });
  const collide = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ slug: "other-slug" }),
  });
  assert.equal(collide.status, 409);

  const invalid = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ slug: "Not Valid" }),
  });
  assert.equal(invalid.status, 400);
});

test("AC-06: DELETE always refuses in v1 (LAST_WORKSPACE) for the caller's own workspace, checked after auth", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");

  const deleted = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(deleted.status, 409);
  const body = (await deleted.json()) as { code?: string };
  assert.equal(body.code, "LAST_WORKSPACE");

  const stillThere = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}`, { headers: { cookie } });
  assert.equal(stillThere.status, 200, "the workspace was not deleted");

  // EC-04: a mismatched :workspaceId 404s before the LAST_WORKSPACE guard is ever reached.
  const mismatched = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-mine`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(mismatched.status, 404);
});

test("AC-06b: unauthenticated DELETE is 401, and a caller without workspace.manage is 403 (both before the LAST_WORKSPACE guard)", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const unauthed = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}`, { method: "DELETE" });
  assert.equal(unauthed.status, 401);

  await deps.identityReady;
  const viewerRole = (await deps.roleRepo.list({ workspaceId: deps.workspaceId })).find((role) => role.name === "viewer");
  assert.ok(viewerRole, "seed created a built-in viewer role");
  await deps.principalRepo.save({
    id: "ws-viewer-del",
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "Viewer",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: "ws-viewer-del",
    workspaceId: deps.workspaceId,
    username: "wsviewerdel",
    passwordHash: await deps.passwordHasher.hash("viewer-pw"),
  });
  await deps.principalRoleRepo.save({
    id: "pr-ws-viewer-del",
    workspaceId: deps.workspaceId,
    principalId: "ws-viewer-del",
    roleId: viewerRole!.id,
  });
  const { cookie: viewerCookie } = await loginAs(baseUrl, "wsviewerdel", "viewer-pw");
  const denied = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}`, {
    method: "DELETE",
    headers: { cookie: viewerCookie },
  });
  assert.equal(denied.status, 403);
});

test("AC-06c: DELETE succeeds (204) once a second workspace row exists, so the caller's own is no longer the last remaining", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  await fetch(`${baseUrl}/api/admin/v1/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Decoy", slug: "decoy" }),
  });

  // NOTE (reported to the coordinator, not fixed here — out of this dispatch's route-file scope):
  // every other route in this composition trusts `deps.workspaceId` as a fixed, always-valid
  // constant (it is never re-validated per request). This guard only refuses deleting the LAST
  // workspace row, not specifically the process's OWN configured workspace, so an authorized admin
  // can delete the site's real, currently-in-use workspace as long as a second (even unrelated,
  // empty) workspace row exists to satisfy INV-03 -- leaving every other route pointed at a
  // workspace id that no longer resolves. This test documents the route's mechanical behavior
  // (204 on a real non-last delete), not an endorsement of that broader design gap.
  const deleted = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(deleted.status, 204);
});

test("AC-06d: DELETE surfaces WorkspaceNotFoundError as 404 RESOURCE_NOT_FOUND when the repo has no row for the id", async (t) => {
  const deps = createRouteDeps();
  deps.workspaceRepo.findById = async () => null;
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code?: string };
  assert.equal(body.code, "RESOURCE_NOT_FOUND");
});

test("AC-06e: DELETE 500s (generic) when the repo throws something other than the two typed workspace errors", async (t) => {
  const deps = createRouteDeps();
  deps.workspaceRepo.list = async () => {
    throw new Error("db exploded");
  };
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal error" });
});
