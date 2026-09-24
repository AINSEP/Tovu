import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated, createCapturingResponse, extractRouteHandler } from "./helpers/http-test-server.js";
import { createRouteDeps } from "../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../inbound/admin-http/dev-auth.js";
import { registerAdminMediaDeleteRoute } from "../inbound/admin-http/routes/media/delete.js";
import { registerAdminMediaListRoute } from "../inbound/admin-http/routes/media/list.js";
import { registerAdminMediaTrashRoute } from "../inbound/admin-http/routes/media/trash.js";
import { registerAdminMediaUpdateRoute } from "../inbound/admin-http/routes/media/update.js";
import { registerAdminMediaUploadRoute } from "../inbound/admin-http/routes/media/upload.js";
import { CORE_PUBLIC_TRANSFORM_NAME, registerTransform } from "#src/features/media/index";
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

test("admin media routes: upload/list/update/trash responses all include publicUrl, keyed by the asset's slug (readable-slugs S5a)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerTransform({
    deps: { clock: deps.clock, idGen: deps.idGen, transformRepo: deps.transformDefinitionRepo },
    input: { workspaceId: deps.workspaceId, name: CORE_PUBLIC_TRANSFORM_NAME, params: { format: "webp" }, owner: "core" },
  });

  const uploadRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ filename: "hero-shot.png", contentType: "image/png", dataBase64: base64Of("fake-png-bytes") }),
  });
  assert.equal(uploadRes.status, 201);
  const uploadPayload = (await uploadRes.json()) as { media: { id: string; slug: string; publicUrl: string | null } };
  assert.equal(
    uploadPayload.media.publicUrl,
    `/m/${uploadPayload.media.slug}/${CORE_PUBLIC_TRANSFORM_NAME}.v1/image.webp`,
    "the upload response's publicUrl must be keyed by the asset's readable slug, not its id"
  );

  const listRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media`, { headers: { cookie } });
  assert.equal(listRes.status, 200);
  const listPayload = (await listRes.json()) as { media: Array<{ id: string; publicUrl: string | null }> };
  const listed = listPayload.media.find((m) => m.id === uploadPayload.media.id);
  assert.ok(listed, "the uploaded asset must appear in the list response");
  assert.equal(listed!.publicUrl, uploadPayload.media.publicUrl, "list and upload must agree on the same asset's publicUrl");

  const updateRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${uploadPayload.media.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ caption: "a striking hero shot" }),
  });
  assert.equal(updateRes.status, 200);
  const updatePayload = (await updateRes.json()) as { media: { publicUrl: string | null } };
  assert.equal(updatePayload.media.publicUrl, uploadPayload.media.publicUrl, "an unrelated metadata PATCH must not change publicUrl");

  const trashRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${uploadPayload.media.id}/trash`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(trashRes.status, 200);
  const trashPayload = (await trashRes.json()) as { media: { publicUrl: string | null; status: string } };
  assert.equal(trashPayload.media.status, "trashed");
  assert.equal(trashPayload.media.publicUrl, null, "a trashed asset must not report a publicUrl a visitor would 404 on");
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

// ---------------------------------------------------------------------------
// update.ts coverage gap fill — this route's own workspace check, the
// MediaNotFoundError/MediaValidationError branches, and the width/height/cssClass
// undefined/null/value parsing, none of which the golden-path/permission suites
// above reach (they only ever send caption/credit as plain strings).
// ---------------------------------------------------------------------------

test("update: 404s for a wrong workspace id on the PATCH route itself (not just the trash route)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const mediaId = await uploadAsOwner(baseUrl, cookie);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/nope/media/${mediaId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ caption: "irrelevant" }),
  });
  assert.equal(res.status, 404);
});

test("update: 404 MediaNotFoundError for a PATCH against a media id that does not exist", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/does-not-exist`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ caption: "irrelevant" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /was not found/);
});

test("update: 400 MediaValidationError for a non-positive-integer width", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const mediaId = await uploadAsOwner(baseUrl, cookie);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ width: -5 }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /must be a positive integer/);
});

test("update: width/height/cssClass round-trip through their full undefined/null/value contract (parseOptionalNullableField's two branches)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const mediaId = await uploadAsOwner(baseUrl, cookie);

  // 1. Provide real values.
  const setRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ width: 640, height: 480, cssClass: "hero-image" }),
  });
  assert.equal(setRes.status, 200);
  const setBody = (await setRes.json()) as { media: { width: number; height: number; cssClass: string } };
  assert.equal(setBody.media.width, 640);
  assert.equal(setBody.media.height, 480);
  assert.equal(setBody.media.cssClass, "hero-image");

  // 2. Omitting them on a later PATCH must leave them unchanged (partial-update — the field this
  //    dispatch's coverage gap explicitly asks about: does omission blank the field?).
  const untouchedRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ caption: "unrelated edit" }),
  });
  assert.equal(untouchedRes.status, 200);
  const untouchedBody = (await untouchedRes.json()) as { media: { width: number; height: number; cssClass: string } };
  assert.equal(untouchedBody.media.width, 640, "omitting width must NOT blank it");
  assert.equal(untouchedBody.media.height, 480, "omitting height must NOT blank it");
  assert.equal(untouchedBody.media.cssClass, "hero-image", "omitting cssClass must NOT blank it");

  // 3. Explicit null clears them back to unset.
  const clearedRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ width: null, height: null, cssClass: null }),
  });
  assert.equal(clearedRes.status, 200);
  const clearedBody = (await clearedRes.json()) as { media: { width: unknown; height: unknown; cssClass: unknown } };
  assert.equal(clearedBody.media.width, null, "explicit null must clear width, not be ignored");
  assert.equal(clearedBody.media.height, null, "explicit null must clear height, not be ignored");
  assert.equal(clearedBody.media.cssClass, null, "explicit null must clear cssClass, not be ignored");
});

test("update: an unexpected repo failure surfaces as the generic 500 (sendPostUpdateError-style default branch, via a real save() failure)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const mediaId = await uploadAsOwner(baseUrl, cookie);

  const originalSave = deps.mediaRepo.save.bind(deps.mediaRepo);
  deps.mediaRepo.save = async () => {
    throw new Error("simulated media repo failure");
  };
  try {
    const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ caption: "will not persist" }),
    });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "internal error" });
  } finally {
    deps.mediaRepo.save = originalSave;
  }
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

test("admin media routes: delete returns 404 for wrong workspace id and non-existent media, and 500 on unexpected error", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const wrongWs = await fetch(`${baseUrl}/api/admin/v1/workspaces/unknown-ws/media/m-1`, {
    method: "DELETE",
    headers: { cookie: ownerCookie },
  });
  assert.equal(wrongWs.status, 404);
  assert.deepEqual(await wrongWs.json(), { error: "workspace was not found" });

  const notFound = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/non-existent-media`, {
    method: "DELETE",
    headers: { cookie: ownerCookie },
  });
  assert.equal(notFound.status, 404);

  const originalFind = deps.mediaRepo.findById;
  deps.mediaRepo.findById = async () => {
    throw new Error("unexpected error");
  };
  try {
    const errorRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/any-id`, {
      method: "DELETE",
      headers: { cookie: ownerCookie },
    });
    assert.equal(errorRes.status, 500);
    assert.deepEqual(await errorRes.json(), { error: "internal error" });
  } finally {
    deps.mediaRepo.findById = originalFind;
  }
});

/**
 * `req.params.workspaceId ?? ""` / `req.params.mediaId ?? ""` (used twice: the authorize() call's
 * `entityId` and the update input's `id`) / `parseMediaMetadataPatch`'s own `(rawBody ?? {})`
 * (extractRouteHandler's own doc, `helpers/http-test-server.ts`): Express guarantees a matched
 * `:param` is always populated, and real `body-parser` always assigns `req.body`, so the right side
 * of every `??` below is unreachable through any real HTTP request. Restored 2026-09-03 after being
 * wrongly deleted as "unreachable dead code" -- the repo's established answer is to KEEP the guard
 * and exercise it with a hand-built `req` that deliberately violates those contracts.
 */
test("update media: `req.params.workspaceId ?? \"\"` fallback, forced via a direct handler call", async () => {
  const { app } = buildTestApp();
  const handler = extractRouteHandler(app, "patch", "/api/admin/v1/workspaces/:workspaceId/media/:mediaId");
  const { res, capture } = createCapturingResponse();

  await handler({ params: {} }, res);

  assert.equal(capture.statusCode, 404);
  assert.equal((capture.jsonBody as { error: string }).error, "workspace was not found");
});

test("update media: `req.params.mediaId ?? \"\"` fallback (both the authorize() entityId and the update input id), forced via a direct handler call past auth with a real seeded principal", async () => {
  const { app, deps } = buildTestApp();
  await deps.identityReady;
  const ownerUser = await deps.userRepo.findByUsername({ workspaceId: deps.workspaceId, username: "admin" });
  assert.ok(ownerUser, "expected the seeded admin user");
  const ownerPrincipal = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: ownerUser.principalId });
  assert.ok(ownerPrincipal, "expected the seeded admin principal");

  const handler = extractRouteHandler(app, "patch", "/api/admin/v1/workspaces/:workspaceId/media/:mediaId");
  const { res, capture } = createCapturingResponse();
  res.locals.principal = ownerPrincipal;

  await handler({ params: { workspaceId: deps.workspaceId }, body: {} }, res); // no mediaId at all

  assert.equal(capture.statusCode, 404);
});

test("update media: `parseMediaMetadataPatch`'s `(rawBody ?? {})` fallback, forced via a direct handler call with req.body omitted entirely", async () => {
  const { app, deps } = buildTestApp();
  await deps.identityReady;
  const ownerUser = await deps.userRepo.findByUsername({ workspaceId: deps.workspaceId, username: "admin" });
  assert.ok(ownerUser, "expected the seeded admin user");
  const ownerPrincipal = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: ownerUser.principalId });
  assert.ok(ownerPrincipal, "expected the seeded admin principal");

  const handler = extractRouteHandler(app, "patch", "/api/admin/v1/workspaces/:workspaceId/media/:mediaId");
  const { res, capture } = createCapturingResponse();
  res.locals.principal = ownerPrincipal;

  // No `body` key at all -> `(rawBody ?? {})` fallback; every field then reads as omitted rather
  // than throwing on a property access of `undefined`.
  await handler({ params: { workspaceId: deps.workspaceId, mediaId: "media-does-not-exist" } }, res);

  assert.equal(capture.statusCode, 404);
});


/**
 * The media half of the local admin Trash
 * (`ADS-memory/reports/2026-09-20-trash-delete-architecture.md`).
 *
 * Asserts the wiring end to end through the real composition root, in both directions: the trash
 * rung has to index the asset (or it never appears on the Trash screen), and the purge rung has to
 * drop the index row (or the screen offers a Restore for bytes that are already gone).
 */
test("trashing a media asset indexes it for the Trash screen; purging it drops the index row", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const mediaId = await uploadAsOwner(baseUrl, cookie);

  const beforeRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media`, { headers: { cookie } });
  const beforePayload = (await beforeRes.json()) as { media: { id: string; title: string; slug: string }[] };
  const uploaded = beforePayload.media.find((m) => m.id === mediaId);
  assert.ok(uploaded, "the upload fixture did not land");

  const trashRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}/trash`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(trashRes.status, 200);
  assert.equal(((await trashRes.json()) as { media: { status: string } }).media.status, "trashed");

  const listed = await deps.trash.list({ workspaceId: deps.workspaceId, now: deps.clock.nowIso(), limit: 50 });
  const indexed = listed.items.find((item) => item.entityId === mediaId);
  assert.ok(indexed, "a trashed media asset never reached trashed_items — the delete path is unwired");
  assert.equal(indexed.entityType, "media");
  // Snapshot captured from columns the route already held, so a corrupt asset still lists.
  assert.equal(indexed.displayTitle, uploaded.title);
  assert.equal(indexed.displaySubtitle, uploaded.slug);

  const purgeRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/workspace-local/media/${mediaId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  assert.equal(purgeRes.status, 200);

  const afterPurge = await deps.trash.list({ workspaceId: deps.workspaceId, now: deps.clock.nowIso(), limit: 50 });
  assert.equal(
    afterPurge.items.some((item) => item.entityId === mediaId),
    false,
    "a hard-purged asset is still listed in the Trash — its index row outlived the bytes"
  );
});
