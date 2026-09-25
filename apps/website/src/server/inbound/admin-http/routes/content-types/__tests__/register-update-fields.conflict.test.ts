import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { InMemoryContentTypeRepo, type ContentTypeRecord } from "#src/features/content-types/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminContentTypeRegisterRoute } from "../register.js";
import { registerAdminContentTypeUpdateFieldsRoute } from "../update-fields.js";
import type { ContentTypesRouteDeps } from "../deps.js";

/**
 * S9 (web-high fix plan, 2026-09-24): registering an existing or tombstoned key, and updating a
 * tombstoned type's fields, each answer 409 with a stable code instead of overwriting the row.
 */
async function buildApp(t: import("node:test").TestContext, status: ContentTypeRecord["status"]) {
  const repo = new InMemoryContentTypeRepo();
  await repo.save({
    workspaceId: "ws-1",
    key: "recipe",
    label: "Recipe",
    fields: [],
    version: 3,
    status,
    tombstonedAt: status === "tombstone" ? "2026-09-24T00:00:00.000Z" : null,
  } as ContentTypeRecord);
  const deps: ContentTypesRouteDeps = {
    workspaceId: "ws-1",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: { nowIso: () => "2026-09-24T00:00:00.000Z" } as any,
    idGen: { newId: () => "id-1" } as any,
    outbox: { enqueue: async () => {} } as any,
    contentTypeRepo: repo,
    contentTypeIndexProvisioner: {} as any,
    entryRepo: {} as any,
  };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal", displayName: "Test Principal" };
    next();
  });
  registerAdminContentTypeRegisterRoute(app, deps);
  registerAdminContentTypeUpdateFieldsRoute(app, deps);
  return { baseUrl: await startTestServer(app, t), repo };
}

const FIELDS = [{ name: "title", kind: "text", required: false, queryable: false }];

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
}

test("register: an existing key is refused with 409 CONTENT_TYPE_ALREADY_EXISTS and the row is unchanged", async (t) => {
  const { baseUrl, repo } = await buildApp(t, "active");
  const { status, json } = await send(`${baseUrl}/api/admin/v1/content-types`, "POST", { key: "recipe", label: "Recipe v2", fields: FIELDS });
  assert.equal(status, 409);
  assert.equal(json.code, "CONTENT_TYPE_ALREADY_EXISTS");
  assert.equal(json.error, "content type 'recipe' already exists; use collections_content_type_update_fields to change its fields");
  const row = await repo.findByKey({ workspaceId: "ws-1", key: "recipe" });
  assert.equal(row?.label, "Recipe");
  assert.equal(row?.version, 3);
});

test("register: a tombstoned key is refused with 409 CONTENT_TYPE_ALREADY_EXISTS naming INV-06", async (t) => {
  const { baseUrl, repo } = await buildApp(t, "tombstone");
  const { status, json } = await send(`${baseUrl}/api/admin/v1/content-types`, "POST", { key: "recipe", label: "Recipe", fields: FIELDS });
  assert.equal(status, 409);
  assert.equal(json.code, "CONTENT_TYPE_ALREADY_EXISTS");
  assert.equal(json.error, "content type 'recipe' was permanently deleted; its key can't be reused (INV-06)");
  assert.equal((await repo.findByKey({ workspaceId: "ws-1", key: "recipe" }))?.status, "tombstone");
});

test("update-fields: a tombstoned type is refused with 409 ENTITY_TOMBSTONED", async (t) => {
  const { baseUrl } = await buildApp(t, "tombstone");
  const { status, json } = await send(`${baseUrl}/api/admin/v1/content-types/recipe/fields`, "PUT", { expectedVersion: 3, fields: FIELDS });
  assert.equal(status, 409);
  assert.equal(json.code, "ENTITY_TOMBSTONED");
  assert.equal(json.error, "ENTITY_TOMBSTONED: content type 'recipe' was permanently deleted and can't be changed.");
});
