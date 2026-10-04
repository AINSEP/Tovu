import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { InMemoryMenuRepo } from "#src/features/navigation/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminMenuUpdateTreeRoute } from "../update-tree.js";

/**
 * `updateMenuTree` refuses a trashed menu with `EntityNotLiveError` (web-high fix plan follow-up,
 * 2026-09-24). Tovu's real menu repos hide trashed rows, so this pins the route mapping with a
 * repo that does return one: 409 with the guard's code, not the opaque 500.
 */
test("update-tree: a trashed menu is refused with 409 ENTITY_IN_TRASH", async (t) => {
  const menuRepo = {
    findById: async () => ({ id: "m1", workspaceId: "ws-1", status: "trash", version: 2, title: "Nav", slug: "nav" }),
  };
  const deps = {
    workspaceId: "ws-1",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: { nowMs: () => Date.parse("2026-09-24T00:00:00.000Z") },
    idGen: { newId: () => "id-1" },
    outbox: { enqueue: async () => {} },
    menuRepo,
  } as any;

  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal", displayName: "Test Principal" };
    next();
  });
  registerAdminMenuUpdateTreeRoute(app, deps);

  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/ws-1/menus/m1`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedVersion: 2, items: [] }),
  });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.code, "ENTITY_IN_TRASH");
  assert.equal(body.error, "ENTITY_IN_TRASH: menu 'm1' is in the Trash. Restore it from the Trash before changing it.");
});


test("update-tree persists changed live metadata and ordered items; stale and denied writes preserve it", async (t) => {
  const menuRepo = new InMemoryMenuRepo({});
  const initial = { id: "m-live", workspaceId: "ws-1", title: "Original", slug: "original", status: "published" as const,
    version: 1, doc: { type: "menu" as const, version: 1, items: [] }, locations: [], updatedAt: "2026-09-24T00:00:00.000Z" };
  await menuRepo.save(initial);
  const deps = { workspaceId: "ws-1", menuRepo, authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: { nowMs: () => Date.parse("2026-09-25T00:00:00.000Z") }, idGen: { newId: () => "event-1" }, outbox: { enqueue: async () => {} } };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => { res.locals.principal = { id: "owner" }; next(); });
  registerAdminMenuUpdateTreeRoute(app, deps as any);
  const baseUrl = await startTestServer(app, t);
  const items = [
    { id: "second", label: "About", target: { kind: "url" as const, href: "/about" } },
    { id: "first", label: "Home", target: { kind: "url" as const, href: "/" } },
  ];
  const update = (body: object) => fetch(`${baseUrl}/api/admin/v1/workspaces/ws-1/menus/m-live`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const saved = await update({ expectedVersion: 1, title: "Changed title", slug: "changed-slug", items });
  assert.equal(saved.status, 200, await saved.text());
  const target = { workspaceId: "ws-1", id: "m-live" };
  const persisted = await menuRepo.findById(target);
  assert.deepEqual(persisted, { ...initial, title: "Changed title", slug: "changed-slug", version: 2,
    updatedAt: "2026-09-25T00:00:00.000Z", doc: { type: "menu", version: 1, items: items.map((item) => ({ ...item, children: undefined })) } });
  const expected = structuredClone(persisted);
  const stale = await update({ expectedVersion: 1, title: "Stale", slug: "stale", items: [] });
  assert.equal(stale.status, 409);
  assert.deepEqual(await menuRepo.findById(target), expected);
  deps.authorize = async () => ({ allowed: false, reason: "no_grant" });
  const denied = await update({ expectedVersion: 2, title: "Denied", slug: "denied", items: [] });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, "FORBIDDEN");
  assert.deepEqual(await menuRepo.findById(target), expected);
});
