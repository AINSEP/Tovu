import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "../helpers/http-test-server";
import { createRouteDeps } from "../../app";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth";
import { registerAdminContentTypeListRoute } from "../../routes/admin/content-types/list";
import { registerAdminContentTypeRegisterRoute } from "../../routes/admin/content-types/register";
import { registerAdminContentTypeUpdateFieldsRoute } from "../../routes/admin/content-types/update-fields";
import { registerAdminContentTypeLifecycleRoute } from "../../routes/admin/content-types/lifecycle";
import type { RouteDeps } from "../../routes/types";

/**
 * @file design-spec.md §1.9 backend-gap closure — route-level tests for the Collections
 * content-type registry HTTP surface (ADR-022/ADR-043), this dispatch. Mirrors
 * `admin-database-timeline-route.test.ts`'s real-auth pattern.
 */
function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminContentTypeListRoute(app, deps);
  registerAdminContentTypeRegisterRoute(app, deps);
  registerAdminContentTypeUpdateFieldsRoute(app, deps);
  registerAdminContentTypeLifecycleRoute(app, deps);
  return { app, deps };
}

test("content-types routes: register -> list -> update-fields -> lifecycle golden path", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const createRes = await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ key: "recipe", label: "Recipe", fields: [{ name: "prep_minutes", kind: "integer", required: false, queryable: true }] }),
  });
  assert.equal(createRes.status, 201);
  const created = (await createRes.json()) as { contentType: { key: string; status: string; version: number } };
  assert.equal(created.contentType.status, "active");
  assert.equal(created.contentType.version, 1);

  const listRes = await fetch(`${baseUrl}/api/admin/v1/content-types`, { headers: { cookie } });
  assert.equal(listRes.status, 200);
  const listed = (await listRes.json()) as { items: Array<{ key: string }> };
  assert.deepEqual(
    listed.items.map((i) => i.key),
    ["recipe"]
  );

  const updateRes = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/fields`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ fields: [{ name: "prep_minutes", kind: "integer", required: false, queryable: true }, { name: "servings", kind: "integer", required: false, queryable: false }], expectedVersion: 1 }),
  });
  assert.equal(updateRes.status, 200);
  const updated = (await updateRes.json()) as { contentType: { version: number; fields: unknown[] } };
  assert.equal(updated.contentType.version, 2);
  assert.equal(updated.contentType.fields.length, 2);

  const deprecateRes = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "deprecate", expectedVersion: 2 }),
  });
  assert.equal(deprecateRes.status, 200);
  const deprecated = (await deprecateRes.json()) as { contentType: { status: string } };
  assert.equal(deprecated.contentType.status, "deprecated");
});

test("content-types routes: registering a reserved key ('post') is rejected VALIDATION_ERROR (ADR-043 §4)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ key: "post", label: "Post", fields: [] }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("content-types routes: an unrecognized lifecycle 'op' is rejected VALIDATION_ERROR before any write-service call (ADR-042 closed-union-dispatch)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  await fetch(`${baseUrl}/api/admin/v1/content-types`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ key: "recipe", label: "Recipe", fields: [] }),
  });

  const res = await fetch(`${baseUrl}/api/admin/v1/content-types/recipe/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op: "delete", expectedVersion: 1 }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});
