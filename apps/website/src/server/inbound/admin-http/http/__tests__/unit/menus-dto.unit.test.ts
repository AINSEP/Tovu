import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { InMemoryMenuRepo } from "#src/features/navigation/index";
import { MENU_RAW_HTML_PERMISSION } from "@jini-ai/cms/navigation/site/menu-html-permission";
import { parseMenuHtmlAuthoring, toAdminMenuDto } from "@jini-ai/cms/admin-http/http/menus";
import { registerAdminMenuCreateRoute, registerAdminMenuUpdateTreeRoute } from "#src/server/runtime/composition/modules/menus";

const baseMenu = {
  id: "menu-1", workspaceId: "ws-1", slug: "main", title: "Main", status: "published",
  locations: ["header"], updatedAt: "2026-10-22T00:00:00.000Z", version: 3,
};

test("toAdminMenuDto omits mode/html when the doc carries neither", () => {
  const dto = toAdminMenuDto({ menu: { ...baseMenu, doc: { items: [] } } as never }) as unknown as Record<string, unknown>;
  assert.equal("mode" in dto, false);
  assert.equal("html" in dto, false);
  assert.deepEqual(dto.items, []);
  assert.deepEqual(dto.locations, ["header"]);
});

test("toAdminMenuDto carries mode and html through when the doc is HTML-authored", () => {
  const dto = toAdminMenuDto({ menu: { ...baseMenu, doc: { items: [], mode: "html", html: "<a>x</a>" } } as never }) as unknown as Record<string, unknown>;
  assert.equal(dto.mode, "html");
  assert.equal(dto.html, "<a>x</a>");
});

test("parseMenuHtmlAuthoring keeps only the fields that were sent", () => {
  assert.deepEqual(parseMenuHtmlAuthoring({ body: {} }), {});
  assert.deepEqual(parseMenuHtmlAuthoring({ body: { mode: "html", html: "<b>y</b>", other: 1 } }), { mode: "html", html: "<b>y</b>" });
});

// K1: the raw-HTML check moved into the Jini specs (`authorizeMenuHtml`); this pins the same rule at
// the wire — the menu is named as `entityId` on an update (by id) and omitted on a create.
test("the raw-HTML permission names the menu as entityId only on the by-id update", async (t) => {
  const calls: Array<Record<string, unknown>> = [];
  const menuRepo = new InMemoryMenuRepo({});
  await menuRepo.save({ ...baseMenu, id: "menu-1", version: 1, doc: { type: "menu", version: 1, items: [] } } as never);
  const deps = { workspaceId: "ws-1", menuRepo, clock: { nowMs: () => 0, nowIso: () => "1970-01-01T00:00:00.000Z" }, idGen: { newId: () => "id-1" }, outbox: { enqueue: async () => {} },
    authorize: async (p: Record<string, unknown>) => { calls.push(p); return { allowed: true, reason: "grant" }; } };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => { res.locals.principal = { id: "p-1" }; next(); });
  registerAdminMenuUpdateTreeRoute({ app, deps: deps as never });
  registerAdminMenuCreateRoute({ app, deps: deps as never });
  const baseUrl = await startTestServer(app, t);
  const send = (method: string, path: string, body: object) => fetch(`${baseUrl}/api/admin/v1/workspaces/ws-1/menus${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await send("PUT", "/menu-1", { expectedVersion: 1, mode: "html", html: "<i>z</i>" })).status, 200);
  assert.equal((await send("POST", "", { title: "F", slug: "f", mode: "html", html: "<i>z</i>" })).status, 201);
  assert.deepEqual(calls.filter((call) => call.permission === MENU_RAW_HTML_PERMISSION), [
    { principalId: "p-1", permission: MENU_RAW_HTML_PERMISSION, workspaceId: "ws-1", entityType: "menu", entityId: "menu-1" },
    { principalId: "p-1", permission: MENU_RAW_HTML_PERMISSION, workspaceId: "ws-1", entityType: "menu" },
  ]);
});
