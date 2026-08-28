import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "../helpers/http-test-server.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminContentTypeRegisterRoute } from "../../inbound/admin-http/routes/content-types/register.js";
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
