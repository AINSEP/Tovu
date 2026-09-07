import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "../runtime/composition/app.js";
import { WorkspaceLastRemainingError, WorkspaceNotFoundError } from "../../features/workspace/index.js";
import { sendDeleteWorkspaceError } from "../inbound/admin-http/routes/workspace/delete.js";
import { createCapturingResponse } from "./helpers/http-test-server.js";

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

test("AC-06/INV-05: DELETE always refuses in v1 (BOUND_WORKSPACE) for the caller's own workspace, checked after auth", async (t) => {
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
  // Was LAST_WORKSPACE (INV-03, count-based). The refusal is now INV-05's identity check, which
  // reaches the same verdict for the same request but for a reason the caller cannot engineer away
  // by creating a second row — see AC-06c.
  assert.equal(body.code, "BOUND_WORKSPACE");

  const stillThere = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}`, { headers: { cookie } });
  assert.equal(stillThere.status, 200, "the workspace was not deleted");

  // EC-04: a mismatched :workspaceId 404s before the BOUND_WORKSPACE guard is ever reached.
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

test("AC-06c/INV-05: minting a second workspace row does NOT unlock deleting the server's own bound workspace, and the row survives", async (t) => {
  const deps = createRouteDeps();
  const { server, baseUrl } = await bootServer(deps);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const { cookie } = await loginAs(baseUrl, "admin", "tovu-dev");

  // This test previously asserted 204 here and documented the resulting gap in a comment instead
  // of closing it. The two calls below ARE the exploit: `workspace.manage` alone was enough to
  // satisfy INV-03's row-count precondition with a throwaway row and then delete the workspace
  // this process is actually serving, leaving every other route resolving against a dead id.
  const decoy = await fetch(`${baseUrl}/api/admin/v1/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Decoy", slug: "decoy" }),
  });
  assert.equal(decoy.status, 201, "the decoy row must really be created — otherwise this test proves nothing");
  assert.equal((await deps.workspaceRepo.list()).length, 2, "INV-03's count precondition is now satisfied");

  const deleted = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}`, {
    method: "DELETE",
    headers: { cookie },
  });

  assert.equal(deleted.status, 409);
  assert.equal(((await deleted.json()) as { code?: string }).code, "BOUND_WORKSPACE");

  // The status code alone would still pass if the guard ran AFTER the delete, or if some later
  // handler removed the row anyway — so assert the durable outcome, not just the envelope.
  assert.ok(
    await deps.workspaceRepo.findById(deps.workspaceId),
    "the bound workspace row must still exist after a refused delete"
  );
});

/**
 * AC-06d/AC-06e now exercise `sendDeleteWorkspaceError` directly rather than over HTTP.
 *
 * INV-05 refuses before `deleteWorkspace` is ever called, so no fetch against this route can reach
 * the typed-error mapping any more (that is the point of the guard). The mapping is retained for
 * the multi-workspace future, so it is covered by direct invocation instead of deleted — the same
 * choice `admin-menus-routes.test.ts` makes for its own unreachable-by-fetch 500 branch.
 */
test("AC-06d: sendDeleteWorkspaceError maps WorkspaceNotFoundError to 404 RESOURCE_NOT_FOUND", () => {
  const { res, capture } = createCapturingResponse();

  sendDeleteWorkspaceError(res, new WorkspaceNotFoundError("workspace 'nope' was not found"));

  assert.equal(capture.statusCode, 404);
  assert.deepEqual(capture.jsonBody, {
    error: "workspace 'nope' was not found",
    code: "RESOURCE_NOT_FOUND",
  });
});

test("AC-06e: sendDeleteWorkspaceError maps WorkspaceLastRemainingError to 409 LAST_WORKSPACE, and anything else to a generic 500 that leaks no message", () => {
  const last = createCapturingResponse();
  sendDeleteWorkspaceError(last.res, new WorkspaceLastRemainingError("the install's last remaining workspace cannot be deleted (INV-03)"));
  assert.equal(last.capture.statusCode, 409);
  assert.equal((last.capture.jsonBody as { code?: string }).code, "LAST_WORKSPACE");

  const generic = createCapturingResponse();
  sendDeleteWorkspaceError(generic.res, new Error("db exploded: connection string postgres://user:pw@host"));
  assert.equal(generic.capture.statusCode, 500);
  // The untyped branch must stay opaque — a repo error can carry connection strings.
  assert.deepEqual(generic.capture.jsonBody, { error: "internal error" });
});
