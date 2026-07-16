import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "../helpers/http-test-server";
import { createRouteDeps } from "../../app";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth";
import { registerAdminContentTypeRegisterRoute } from "../../routes/admin/content-types/register";
import { registerAdminEntryListRoute } from "../../routes/admin/entries/list";
import { registerAdminEntryCreateRoute } from "../../routes/admin/entries/create";
import { registerAdminEntryUpdateRoute } from "../../routes/admin/entries/update";
import { registerAdminEntryLifecycleRoute } from "../../routes/admin/entries/lifecycle";
import type { RouteDeps } from "../../routes/types";

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
