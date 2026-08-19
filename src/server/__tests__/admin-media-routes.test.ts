import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "./helpers/http-test-server.js";
import { createRouteDeps } from "../app.js";
import { registerAuthRoutes, requireAdminSession } from "../middleware/dev-auth.js";
import { registerAdminMediaDeleteRoute } from "../routes/admin/media/delete.js";
import { registerAdminMediaListRoute } from "../routes/admin/media/list.js";
import { registerAdminMediaTrashRoute } from "../routes/admin/media/trash.js";
import { registerAdminMediaUpdateRoute } from "../routes/admin/media/update.js";
import { registerAdminMediaUploadRoute } from "../routes/admin/media/upload.js";
import type { RouteDeps } from "../routes/types.js";

/**
 * @file Route-level tests for the admin `media` HTTP surface (ADR-027 walking skeleton).
 *
 * SPEC-021 REQ-39/REQ-40/OQ-01/OQ-02: none of the 5 admin media routes used to call
 * `deps.authorize(...)` — any authenticated session, regardless of grants, could upload, list,
 * edit, trash, or permanently purge media. This suite now mirrors `admin-menus-routes.test.ts`'s
 * already-working pattern (`createRouteDeps()` for a real `authorize()` + identity repos, real auth
 * middleware, a real login before hitting any route) and additionally proves both the denied and
 * granted side of each route's new `media.*` gate (ADR-027 §7).
 */
function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = { ...createRouteDeps() };

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminMediaListRoute(app, deps);
  registerAdminMediaUploadRoute(app, deps);
  registerAdminMediaUpdateRoute(app, deps);
  registerAdminMediaTrashRoute(app, deps);
  registerAdminMediaDeleteRoute(app, deps);
  return { app, deps };
}

function base64Of(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

/**
 * Registers a principal with a login but no role/policy grants at all — `authorize()` returns
 * `no_grant` for any permission it's checked against. Used to prove the denied side of each
 * `media.*` gate (mirrors `admin-menus-routes.test.ts`'s `loginAsBarePrincipal`).
 */
async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string) {
  await deps.identityReady;
  const bareId = "bare-principal-media";
  await deps.principalRepo.save({
    id: bareId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "No Grants",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: bareId,
    workspaceId: deps.workspaceId,
    username: "bare-media",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-media", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

let grantCounter = 0;

/**
 * Registers a principal holding ONLY the given permission strings (no role, no wildcard) — proves
 * a route's `media.*` gate grants exactly what it names, nothing more. Mirrors
 * `admin-menus-routes.test.ts`'s `loginWithPermissions`.
 */
async function loginWithPermissions(
  deps: RouteDeps,
  baseUrl: string,
  permissions: readonly string[]
): Promise<string> {
  await deps.identityReady;
  const suffix = `${++grantCounter}`;
  const principalId = `grant-principal-media-${suffix}`;
  const policyId = `grant-policy-media-${suffix}`;
  const username = `grant-media-${suffix}`;

  await deps.principalRepo.save({
    id: principalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: `Grants: ${permissions.join(", ")}`,
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId,
    workspaceId: deps.workspaceId,
    username,
    passwordHash: await deps.passwordHasher.hash("grant-pw"),
  });
  await deps.policyRepo.save({
    id: policyId,
    workspaceId: deps.workspaceId,
    name: `grant-policy-${suffix}`,
    isBuiltin: false,
    isFrozen: false,
  });
  for (const permission of permissions) {
    await deps.policyPermissionRepo.save({
      id: `grant-pp-${suffix}-${permission}`,
      workspaceId: deps.workspaceId,
      policyId,
      permission,
      resourceType: null,
      constraintJson: null,
    });
  }
  await deps.principalPolicyRepo.save({
    id: `grant-link-${suffix}`,
    workspaceId: deps.workspaceId,
    principalId,
    policyId,
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "grant-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

/** Uploads one media asset as the owner (full `*` grant) and returns its id. */
async function uploadAsOwner(baseUrl: string, ownerCookie: string): Promise<string> {
  const uploadRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({
      filename: "hero.png",
      contentType: "image/png",
      dataBase64: base64Of("fake-png-bytes"),
      alt: "a hero image",
    }),
  });
  assert.equal(uploadRes.status, 201);
  const payload = (await uploadRes.json()) as { media: { id: string } };
  return payload.media.id;
}

test("admin media routes: upload -> list -> update -> trash -> purge ladder (owner)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const mediaId = await uploadAsOwner(baseUrl, cookie);

  const listRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media`, {
    headers: { cookie },
  });
  assert.equal(listRes.status, 200);
  const listPayload = (await listRes.json()) as { media: Array<{ id: string }> };
  assert.ok(listPayload.media.some((m) => m.id === mediaId));

  const updateRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ caption: "A striking hero shot", credit: "Jane Doe" }),
  });
  assert.equal(updateRes.status, 200);
  const updatePayload = (await updateRes.json()) as {
    media: { caption: string; credit: string; version: number };
  };
  assert.equal(updatePayload.media.caption, "A striking hero shot");
  assert.equal(updatePayload.media.credit, "Jane Doe");
  assert.equal(updatePayload.media.version, 2);

  // Purge before trash -> 409 with a referencing list.
  const prematurePurge = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(prematurePurge.status, 409);
  const prematurePayload = (await prematurePurge.json()) as { referencing: string[] };
  assert.ok(prematurePayload.referencing.length > 0);

  const trashRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}/trash`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(trashRes.status, 200);
  const trashPayload = (await trashRes.json()) as { media: { status: string } };
  assert.equal(trashPayload.media.status, "trashed");

  const purgeRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(purgeRes.status, 200);
  const purgePayload = (await purgeRes.json()) as { purged: boolean };
  assert.equal(purgePayload.purged, true);

  const listAfterPurge = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media`, {
    headers: { cookie },
  });
  const listAfterPurgePayload = (await listAfterPurge.json()) as { media: Array<{ id: string }> };
  assert.ok(!listAfterPurgePayload.media.some((m) => m.id === mediaId));
});

test("admin media routes: upload rejects a disallowed content type with 400", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      filename: "malware.exe",
      contentType: "application/x-msdownload",
      dataBase64: base64Of("x"),
    }),
  });
  assert.equal(res.status, 400);
});

test("admin media routes: 404s for an unknown workspace id and an unknown media id", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const wrongWorkspace = await fetch(`${baseUrl}/api/admin/v1/workspaces/nope/media`, {
    headers: { cookie },
  });
  assert.equal(wrongWorkspace.status, 404);

  const unknownMedia = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/workspace-local/media/does-not-exist/trash`,
    { method: "POST", headers: { cookie } }
  );
  assert.equal(unknownMedia.status, 404);
});

test("SPEC-021 REQ-39/OQ-01: a principal with zero grants is denied 403 with the route's specific media.* permission named, on every one of the 5 routes", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const mediaId = await uploadAsOwner(baseUrl, ownerCookie);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const listRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media`, {
    headers: { cookie: bareCookie },
  });
  assert.equal(listRes.status, 403);
  const listBody = (await listRes.json()) as { code: string; details: { permission: string } };
  assert.equal(listBody.code, "FORBIDDEN");
  assert.equal(listBody.details.permission, "media.read");

  const uploadRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify({ filename: "x.png", contentType: "image/png", dataBase64: base64Of("x") }),
  });
  assert.equal(uploadRes.status, 403);
  const uploadBody = (await uploadRes.json()) as { code: string; details: { permission: string } };
  assert.equal(uploadBody.code, "FORBIDDEN");
  assert.equal(uploadBody.details.permission, "media.upload");

  const updateRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify({ caption: "nope" }),
  });
  assert.equal(updateRes.status, 403);
  const updateBody = (await updateRes.json()) as { code: string; details: { permission: string } };
  assert.equal(updateBody.code, "FORBIDDEN");
  assert.equal(updateBody.details.permission, "media.update");

  const trashRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}/trash`, {
    method: "POST",
    headers: { cookie: bareCookie },
  });
  assert.equal(trashRes.status, 403);
  const trashBody = (await trashRes.json()) as { code: string; details: { permission: string } };
  assert.equal(trashBody.code, "FORBIDDEN");
  assert.equal(trashBody.details.permission, "media.delete");

  const deleteRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}`, {
    method: "DELETE",
    headers: { cookie: bareCookie },
  });
  assert.equal(deleteRes.status, 403);
  const deleteBody = (await deleteRes.json()) as { code: string; details: { permission: string } };
  assert.equal(deleteBody.code, "FORBIDDEN");
  assert.equal(deleteBody.details.permission, "media.delete.force");
});

test("T-media-list: list.ts is gated by media.read specifically — that grant alone succeeds", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["media.read"]);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
});

test("T-media-upload: upload.ts is gated by media.upload specifically — that grant alone succeeds", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginWithPermissions(deps, baseUrl, ["media.upload"]);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ filename: "hero.png", contentType: "image/png", dataBase64: base64Of("bytes") }),
  });
  assert.equal(res.status, 201);
});

test("T-media-update: update.ts is gated by media.update specifically — that grant alone succeeds", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const mediaId = await uploadAsOwner(baseUrl, ownerCookie);
  const cookie = await loginWithPermissions(deps, baseUrl, ["media.update"]);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ caption: "granted" }),
  });
  assert.equal(res.status, 200);
});

test("T-media-trash: trash.ts is gated by media.delete specifically — that grant alone succeeds", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const mediaId = await uploadAsOwner(baseUrl, ownerCookie);
  const cookie = await loginWithPermissions(deps, baseUrl, ["media.delete"]);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}/trash`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(res.status, 200);
});

test("T-media-delete: delete.ts (hard purge) requires media.delete.force specifically — media.delete alone is denied, media.delete.force succeeds", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const mediaId = await uploadAsOwner(baseUrl, ownerCookie);

  await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}/trash`, {
    method: "POST",
    headers: { cookie: ownerCookie },
  });

  const deleteOnlyCookie = await loginWithPermissions(deps, baseUrl, ["media.delete"]);
  const deniedRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}`, {
    method: "DELETE",
    headers: { cookie: deleteOnlyCookie },
  });
  assert.equal(deniedRes.status, 403);
  const deniedBody = (await deniedRes.json()) as { details: { permission: string } };
  assert.equal(deniedBody.details.permission, "media.delete.force");

  const forceCookie = await loginWithPermissions(deps, baseUrl, ["media.delete.force"]);
  const grantedRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}`, {
    method: "DELETE",
    headers: { cookie: forceCookie },
  });
  assert.equal(grantedRes.status, 200);
  const grantedBody = (await grantedRes.json()) as { purged: boolean };
  assert.equal(grantedBody.purged, true);
});
