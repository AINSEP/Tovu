import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

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
    clock: { nowIso: () => "2026-09-24T00:00:00.000Z" },
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
