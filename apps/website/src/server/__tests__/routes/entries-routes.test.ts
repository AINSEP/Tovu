import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "../helpers/http-test-server.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminContentTypeRegisterRoute } from "../../inbound/admin-http/routes/content-types/register.js";
import { registerAdminContentTypeLifecycleRoute } from "../../inbound/admin-http/routes/content-types/lifecycle.js";
import { registerAdminEntryListRoute } from "../../inbound/admin-http/routes/entries/list.js";
import { registerAdminEntryCreateRoute } from "../../inbound/admin-http/routes/entries/create.js";
import { registerAdminEntryUpdateRoute } from "../../inbound/admin-http/routes/entries/update.js";
import { registerAdminEntryLifecycleRoute } from "../../inbound/admin-http/routes/entries/lifecycle.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file design-spec.md §1.9 backend-gap closure — route-level tests for the Collections entries
 * HTTP surface (ADR-022/ADR-043), this dispatch.
 */
function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminContentTypeRegisterRoute(app, deps);
  registerAdminContentTypeLifecycleRoute(app, deps);
  registerAdminEntryListRoute(app, deps);
  registerAdminEntryCreateRoute(app, deps);
  registerAdminEntryUpdateRoute(app, deps);
  registerAdminEntryLifecycleRoute(app, deps);
  return { app, deps };
}

async function registerRecipeType(baseUrl: string, cookie: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ key: "recipe", label: "Recipe", fields: [] }),
  });
  assert.equal(res.status, 201);
}

/** Tombstones the `recipe` content type registered by {@link registerRecipeType} (starts at
 *  version 1). EC-09: a content type must be `deprecated` before it can be `tombstone`d, so this
 *  drives both transitions in sequence rather than jumping straight to tombstone. */
async function tombstoneRecipeType(baseUrl: string, cookie: string): Promise<void> {
  const deprecateRes = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "deprecate", expectedVersion: 1 }),
  });
  assert.equal(deprecateRes.status, 200);

  const tombstoneRes = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "tombstone", expectedVersion: 2 }),
  });
  assert.equal(tombstoneRes.status, 200);
}

async function createRecipeEntry(baseUrl: string, cookie: string, slug = "eggs"): Promise<{ id: string; version: number }> {
  const res = await fetch(`${baseUrl}/api/admin/v1/entries`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ type: "recipe", slug, title: "Eggs" }),
  });
  assert.equal(res.status, 201);
  const created = (await res.json()) as { entry: { id: string; version: number } };
  return created.entry;
}

test("entries routes: create denied 403 FORBIDDEN without admin.collections.manage", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);

  // Denies every permission from this point on — same technique taxonomy-routes.test.ts's own
  // equivalent 403 test uses, applied here to lock create.ts's pre-conversion 403 shape before
  // it moves to the shared authorizeOrRespond helper.
  deps.authorize = async () => ({ allowed: false, reason: "test_denied" });

  const res = await fetch(`${baseUrl}/api/admin/v1/entries`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ type: "recipe", slug: "eggs", title: "Eggs" }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { error: string; code: string; details: { permission: string; reason: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.match(body.error, /^principal '.+' is not authorized for 'admin\.collections\.manage' \(test_denied\)$/);
  assert.deepEqual(body.details, { permission: "admin.collections.manage", reason: "test_denied" });
});

test("entries routes: create surfaces an authorize() failure as a 500 (INTERNAL_ERROR)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);

  deps.authorize = async () => {
    throw new Error("boom");
  };

  const res = await fetch(`${baseUrl}/api/admin/v1/entries`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ type: "recipe", slug: "eggs", title: "Eggs" }),
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(body.error, "boom");
});

test("entries routes: create -> list -> update -> publish golden path (REQ-13/14/19/28)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/entries`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ type: "recipe", slug: "eggs", title: "Eggs" }),
  });
  assert.equal(createRes.status, 201);
  const created = (await createRes.json()) as { entry: { id: string; status: string; version: number } };
  assert.equal(created.entry.status, "draft");
  const entryId = created.entry.id;

  const listRes = await fetch(`${baseUrl}/api/admin/v1/entries?type=recipe`, { headers: { cookie } });
  assert.equal(listRes.status, 200);
  const listed = (await listRes.json()) as { items: Array<{ id: string }> };
  assert.deepEqual(
    listed.items.map((i) => i.id),
    [entryId]
  );

  const updateRes = await fetch(`${baseUrl}/api/admin/v1/entries/${entryId}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Scrambled Eggs", expectedVersion: 1 }),
  });
  assert.equal(updateRes.status, 200);
  const updated = (await updateRes.json()) as { entry: { title: string; version: number } };
  assert.equal(updated.entry.title, "Scrambled Eggs");
  assert.equal(updated.entry.version, 2);

  const publishRes = await fetch(`${baseUrl}/api/admin/v1/entries/${entryId}/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "publish", expectedVersion: 2 }),
  });
  assert.equal(publishRes.status, 200);
  const published = (await publishRes.json()) as { entry: { status: string; publishedAt: string | null } };
  assert.equal(published.entry.status, "published");
  assert.ok(published.entry.publishedAt);
});

test("entries routes: creating against a nonexistent content type is rejected CONTENT_TYPE_NOT_FOUND (INV-01)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/entries`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ type: "does-not-exist", slug: "x", title: "X" }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "CONTENT_TYPE_NOT_FOUND");
});

test("entries routes: a duplicate (workspaceId, type, slug) is rejected ENTRY_SLUG_CONFLICT (AC-21)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);

  await fetch(`${baseUrl}/api/admin/v1/entries`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ type: "recipe", slug: "eggs", title: "Eggs" }),
  });
  const res = await fetch(`${baseUrl}/api/admin/v1/entries`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ type: "recipe", slug: "eggs", title: "Eggs Again" }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "ENTRY_SLUG_CONFLICT");
});

test("entries routes: a body edit on an existing entry actually persists (REQ-28)", async (t) => {
  // The CRITICAL finding from the 2026-08-01 audit sweep, reproduced end-to-end
  // by two independent auditors: the route never read `bodyJson`, so editing an
  // existing entry's rich text returned 200 while the stored body kept its
  // pre-edit value. Silent data loss on the primary content surface, reported as
  // success. `features/entries/write-service.ts` always supported the field —
  // only this route and the admin client failed to carry it.
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);

  const before = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "before" }] }] };
  const after = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "AFTER" }] }] };

  const createRes = await fetch(`${baseUrl}/api/admin/v1/entries`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ type: "recipe", slug: "body-edit", title: "Body edit", bodyJson: before }),
  });
  assert.equal(createRes.status, 201);
  const created = (await createRes.json()) as { entry: { id: string; version: number } };

  const updateRes = await fetch(`${baseUrl}/api/admin/v1/entries/${created.entry.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Body edit", bodyJson: after, expectedVersion: created.entry.version }),
  });
  assert.equal(updateRes.status, 200);
  const updated = (await updateRes.json()) as { entry: { bodyJson: unknown; version: number } };
  assert.deepEqual(updated.entry.bodyJson, after, "the edited body must be what was saved, not the pre-edit one");

  // And it must be durable, not just echoed back in the response.
  const listRes = await fetch(`${baseUrl}/api/admin/v1/entries?type=recipe`, { headers: { cookie } });
  const listed = (await listRes.json()) as { items: Array<{ id: string; bodyJson: unknown }> };
  assert.deepEqual(listed.items.find((i) => i.id === created.entry.id)?.bodyJson, after);
});

test("entries routes: an update that omits bodyJson leaves the existing body alone (REQ-28)", async (t) => {
  // The other half of the contract, and why `undefined`-when-absent is
  // load-bearing: a title-only PUT must not clear the body.
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);

  const body = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "keep me" }] }] };
  const createRes = await fetch(`${baseUrl}/api/admin/v1/entries`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ type: "recipe", slug: "title-only", title: "Title only", bodyJson: body }),
  });
  const created = (await createRes.json()) as { entry: { id: string; version: number } };

  const updateRes = await fetch(`${baseUrl}/api/admin/v1/entries/${created.entry.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Renamed", expectedVersion: created.entry.version }),
  });
  assert.equal(updateRes.status, 200);
  const updated = (await updateRes.json()) as { entry: { title: string; bodyJson: unknown } };
  assert.equal(updated.entry.title, "Renamed");
  assert.deepEqual(updated.entry.bodyJson, body, "omitting bodyJson must preserve it, not clear it");
});

// --- Coverage gap fill (2026-09-03): update.ts / lifecycle.ts / list.ts branch coverage ---

test("entries routes: update denied 403 FORBIDDEN without admin.collections.manage", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);

  deps.authorize = async () => ({ allowed: false, reason: "test_denied" });

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "New title", expectedVersion: entry.version }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { error: string; code: string; details: { permission: string; reason: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.match(body.error, /^principal '.+' is not authorized for 'admin\.collections\.manage' \(test_denied\)$/);
  assert.deepEqual(body.details, { permission: "admin.collections.manage", reason: "test_denied" });
});

test("entries routes: update without a numeric expectedVersion is rejected 400 VALIDATION_ERROR", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "New title" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.equal(body.error, "'expectedVersion' (number) is required");
});

test("entries routes: a fields-only update (no `title` key at all) leaves the existing title alone", async (t) => {
  // The other half of `typeof body.title === "string" ? body.title : undefined` from the
  // existing bodyJson-omission test — `title` itself must survive being omitted too.
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ fieldsJson: { ext: { site: {} } }, expectedVersion: entry.version }),
  });
  assert.equal(res.status, 200);
  const updated = (await res.json()) as { entry: { title: string } };
  assert.equal(updated.entry.title, "Eggs", "omitting `title` must preserve it, not clear it");
});

test("entries routes: updating a nonexistent entry is rejected 404 ENTRY_NOT_FOUND", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/does-not-exist`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "X", expectedVersion: 1 }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "ENTRY_NOT_FOUND");
});

test("entries routes: updating an entry whose content type has been tombstoned is rejected 409 CONTENT_TYPE_NOT_ACTIVE (REQ-28/AC-45)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);
  await tombstoneRecipeType(baseUrl, cookie);

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "New title", expectedVersion: entry.version }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "CONTENT_TYPE_NOT_ACTIVE");
});

test("entries routes: updating with a stale expectedVersion is rejected 409 VERSION_CONFLICT", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "New title", expectedVersion: 999 }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VERSION_CONFLICT");
});

test("entries routes: updating with an un-enveloped fieldsJson is rejected 400 VALIDATION_ERROR", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ fieldsJson: { notEnveloped: true }, expectedVersion: entry.version }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("entries routes: update's write-service chokepoint re-check enforces FORBIDDEN even though the route's own pre-check passed", async (t) => {
  // BUG WATCH (see final report): `update.ts`'s own pre-check calls `deps.authorize` with
  // `entityType: "entry"`; `features/entries/write-service.ts`'s `resolveExistingEntryForTransition`
  // (the chokepoint `updateEntry` shares with `publishEntry`/`unpublishEntry`) calls the SAME
  // `deps.authorize` a second time but WITHOUT `entityType`. A real RBAC policy scoped to
  // `resourceType: "entry"` would pass the route's own check and then be denied by the
  // chokepoint's re-check — this mock reproduces that exact divergence (keyed on `entityType`
  // presence, not a synthetic denial) to prove the chokepoint is what actually decides, and to
  // exercise `statusFor`'s `ForbiddenError` branch, which no test previously reached.
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);

  deps.authorize = async (params) =>
    params.entityType ? { allowed: true, reason: "matched" } : { allowed: false, reason: "resource_scope_mismatch" };

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "New title", expectedVersion: entry.version }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FORBIDDEN");
});

test("entries routes: update surfaces an authorize() Error as 500 (INTERNAL_ERROR) carrying its message", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);

  deps.authorize = async () => {
    throw new Error("boom");
  };

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "New title", expectedVersion: entry.version }),
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(body.error, "boom");
});

test("entries routes: update surfaces a non-Error throw as 500 (INTERNAL_ERROR) with a generic message", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);

  deps.authorize = async () => {
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw "boom";
  };

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "New title", expectedVersion: entry.version }),
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(body.error, "internal error");
});

test("entries routes: lifecycle denied 403 FORBIDDEN without admin.collections.manage", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);

  deps.authorize = async () => ({ allowed: false, reason: "test_denied" });

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "publish", expectedVersion: entry.version }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { error: string; code: string; details: { permission: string; reason: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.match(body.error, /^principal '.+' is not authorized for 'admin\.collections\.manage' \(test_denied\)$/);
  assert.deepEqual(body.details, { permission: "admin.collections.manage", reason: "test_denied" });
});

test("entries routes: lifecycle with an unrecognized op is rejected 400 VALIDATION_ERROR", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "archive", expectedVersion: entry.version }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.equal(body.error, "'op' must be one of 'publish', 'unpublish'");
});

test("entries routes: lifecycle without a numeric expectedVersion is rejected 400 VALIDATION_ERROR", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "publish" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.equal(body.error, "'expectedVersion' (number) is required");
});

test("entries routes: lifecycle on a nonexistent entry is rejected 404 ENTRY_NOT_FOUND", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/does-not-exist/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "publish", expectedVersion: 1 }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "ENTRY_NOT_FOUND");
});

test("entries routes: lifecycle on an entry whose content type has been tombstoned is rejected 409 CONTENT_TYPE_NOT_ACTIVE (REQ-28/AC-45)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);
  await tombstoneRecipeType(baseUrl, cookie);

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "publish", expectedVersion: entry.version }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "CONTENT_TYPE_NOT_ACTIVE");
});

test("entries routes: lifecycle with a stale expectedVersion is rejected 409 VERSION_CONFLICT", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "publish", expectedVersion: 999 }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VERSION_CONFLICT");
});

test("entries routes: lifecycle's write-service chokepoint re-check enforces FORBIDDEN even though the route's own pre-check passed", async (t) => {
  // Same divergence as update.ts's equivalent test — `publishEntry`/`unpublishEntry` share
  // `resolveExistingEntryForTransition`'s entityType-less internal `authorize()` call.
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);

  deps.authorize = async (params) =>
    params.entityType ? { allowed: true, reason: "matched" } : { allowed: false, reason: "resource_scope_mismatch" };

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "publish", expectedVersion: entry.version }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FORBIDDEN");
});

test("entries routes: lifecycle surfaces an authorize() Error as 500 (INTERNAL_ERROR) carrying its message", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);

  deps.authorize = async () => {
    throw new Error("boom");
  };

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "publish", expectedVersion: entry.version }),
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(body.error, "boom");
});

test("entries routes: lifecycle surfaces a non-Error throw as 500 (INTERNAL_ERROR) with a generic message", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);

  deps.authorize = async () => {
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw "boom";
  };

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "publish", expectedVersion: entry.version }),
  });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(body.error, "internal error");
});

test("entries routes: list denied 403 FORBIDDEN without admin.collections.read", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  deps.authorize = async () => ({ allowed: false, reason: "test_denied" });

  const res = await fetch(`${baseUrl}/api/admin/v1/entries`, { headers: { cookie } });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { error: string; code: string; details: { permission: string; reason: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.match(body.error, /^principal '.+' is not authorized for 'admin\.collections\.read' \(test_denied\)$/);
  assert.deepEqual(body.details, { permission: "admin.collections.read", reason: "test_denied" });
});

test("entries routes: list without a `type` filter returns every content type's entries", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);

  const res = await fetch(`${baseUrl}/api/admin/v1/entries`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const listed = (await res.json()) as { items: Array<{ id: string }> };
  assert.deepEqual(
    listed.items.map((i) => i.id),
    [entry.id]
  );
});

test("entries routes: list surfaces an authorize() Error as 500 (INTERNAL_ERROR) carrying its message", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  deps.authorize = async () => {
    throw new Error("boom");
  };

  const res = await fetch(`${baseUrl}/api/admin/v1/entries`, { headers: { cookie } });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(body.error, "boom");
});

test("entries routes: list surfaces a non-Error throw as 500 (INTERNAL_ERROR) with a generic message", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  deps.authorize = async () => {
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw "boom";
  };

  const res = await fetch(`${baseUrl}/api/admin/v1/entries`, { headers: { cookie } });
  assert.equal(res.status, 500);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.equal(body.error, "internal error");
});

// --- Publish/unpublish idempotency (2026-09-03 owner ruling on SPEC-020-state.spec.md vs
// AC-45/api.spec.md): PUBLISH_ENTRY/UNPUBLISH_ENTRY are idempotent state assertions, not a strict
// FSM — `write-service.ts`'s `transitionEntryStatus` has no `current.status === target.status`
// guard, so every call (first or repeat) re-runs the full write: version bump, `publishedAt`
// (re)stamp, a new `EntryRevision`, and a fresh outbox event. These tests pin that behavior so it
// isn't "fixed" into a rejecting guard later, and so propagation isn't silently dropped on a
// repeat call. See the amended precondition/failure-handling cells at SPEC-020-state.spec.md's
// `PUBLISH_ENTRY`/`UNPUBLISH_ENTRY` rows for the governing contract. ---

/** Counts pending `entry.published`/`entry.unpublished` outbox rows for one entry, using the real
 *  `OutboxPort.claimPending` surface (`@jini-ai/cms/core`) rather than reaching into the in-memory
 *  outbox's private storage — the same surface `processOutbox` itself uses to drain the queue. */
async function countPendingEntryEvents(deps: RouteDeps, entryId: string, eventName: string): Promise<number> {
  const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const claimed = await deps.outbox.claimPending(1000, farFuture);
  return claimed.filter((row) => row.event.name === eventName && (row.event.payload as { entryId?: string }).entryId === entryId).length;
}

test("entries routes: republishing an already-published, unchanged entry succeeds and re-fires the full publish effect set, not a silent no-op", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);

  const firstPublish = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "publish", expectedVersion: entry.version }),
  });
  assert.equal(firstPublish.status, 200);
  const first = (await firstPublish.json()) as { entry: { status: string; version: number; publishedAt: string | null } };
  assert.equal(first.entry.status, "published");
  assert.equal(first.entry.version, 2);
  assert.ok(first.entry.publishedAt);

  const secondPublish = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "publish", expectedVersion: first.entry.version }),
  });
  // AC-45/api.spec.md govern: no "already published" error code exists in the error table, so this
  // must succeed (200), not reject — the owner's 2026-09-03 ruling on the contradicting
  // SPEC-020-state.spec.md draft.
  assert.equal(secondPublish.status, 200);
  const second = (await secondPublish.json()) as { entry: { status: string; version: number; publishedAt: string | null } };
  assert.equal(second.entry.status, "published");
  // The write pipeline re-ran in full, not a no-op: version keeps advancing and publishedAt is
  // re-stamped to the new call's `now` (never null, never before the first publish's stamp).
  assert.equal(second.entry.version, 3);
  assert.ok(second.entry.publishedAt);
  assert.ok(new Date(second.entry.publishedAt as string).getTime() >= new Date(first.entry.publishedAt as string).getTime());

  // The redundant publish enqueued its OWN outbox event rather than being skipped — proves
  // downstream propagation (SEO/search/webhook consumers, whenever wired) sees the repeat action.
  const publishedEventCount = await countPendingEntryEvents(deps, entry.id, "entry.published");
  assert.equal(publishedEventCount, 2, "each publish call — first and redundant — must enqueue its own entry.published event");
});

test("entries routes: an entry's content edit while it is already published is visible immediately, and republishing afterward does not lose or revert it", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);

  const before = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "before" }] }] };
  const after = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "AFTER" }] }] };

  const createRes = await fetch(`${baseUrl}/api/admin/v1/entries`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ type: "recipe", slug: "republish-edit", title: "Eggs", bodyJson: before }),
  });
  const created = (await createRes.json()) as { entry: { id: string; version: number } };

  const publishRes = await fetch(`${baseUrl}/api/admin/v1/entries/${created.entry.id}/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "publish", expectedVersion: created.entry.version }),
  });
  assert.equal(publishRes.status, 200);
  const published = (await publishRes.json()) as { entry: { version: number } };

  // Entries have no separate draft/live copy — `updateEntry` mutates the SAME row `publishEntry`
  // flips `status` on, regardless of current status (REQ-28: only a tombstoned owning type blocks
  // it). So an edit made while an entry is already published is live immediately, with no
  // republish required to propagate it.
  const updateRes = await fetch(`${baseUrl}/api/admin/v1/entries/${created.entry.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: "Scrambled Eggs", bodyJson: after, expectedVersion: published.entry.version }),
  });
  assert.equal(updateRes.status, 200);
  const updated = (await updateRes.json()) as { entry: { version: number; status: string } };
  assert.equal(updated.entry.status, "published", "editing a published entry's content must not change its status");

  const listAfterEditRes = await fetch(`${baseUrl}/api/admin/v1/entries?type=recipe`, { headers: { cookie } });
  const listedAfterEdit = (await listAfterEditRes.json()) as { items: Array<{ id: string; title: string; bodyJson: unknown }> };
  const rowAfterEdit = listedAfterEdit.items.find((i) => i.id === created.entry.id);
  assert.equal(rowAfterEdit?.title, "Scrambled Eggs", "the edit must be visible before any republish call");
  assert.deepEqual(rowAfterEdit?.bodyJson, after, "the edit must be visible before any republish call");

  const republishRes = await fetch(`${baseUrl}/api/admin/v1/entries/${created.entry.id}/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "publish", expectedVersion: updated.entry.version }),
  });
  assert.equal(republishRes.status, 200);

  const listAfterRepublishRes = await fetch(`${baseUrl}/api/admin/v1/entries?type=recipe`, { headers: { cookie } });
  const listedAfterRepublish = (await listAfterRepublishRes.json()) as { items: Array<{ id: string; title: string; bodyJson: unknown }> };
  const rowAfterRepublish = listedAfterRepublish.items.find((i) => i.id === created.entry.id);
  assert.equal(rowAfterRepublish?.title, "Scrambled Eggs", "republishing must not revert the edited content");
  assert.deepEqual(rowAfterRepublish?.bodyJson, after, "republishing must not revert the edited content");
});

test("entries routes: unpublishing a draft entry that was never published succeeds — unpublish asserts 'not publicly visible', not a status-in-{published} FSM guard", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerRecipeType(baseUrl, cookie);
  const entry = await createRecipeEntry(baseUrl, cookie);
  assert.equal(entry.version, 1);

  const res = await fetch(`${baseUrl}/api/admin/v1/entries/${entry.id}/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "unpublish", expectedVersion: entry.version }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { entry: { status: string; version: number; publishedAt: string | null } };
  assert.equal(body.entry.status, "unpublished");
  assert.equal(body.entry.version, 2);
  // A draft's `publishedAt` was already null; unpublish only sets `publishedAt = now` when the
  // TARGET is `published` (`write-service.ts`'s `transitionEntryStatus`) — for an unpublish target
  // it's left untouched, so it stays null here rather than being back-filled.
  assert.equal(body.entry.publishedAt, null);
});
