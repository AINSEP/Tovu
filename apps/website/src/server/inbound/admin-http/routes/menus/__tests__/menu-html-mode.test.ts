import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { InMemoryMenuRepo } from "#src/features/navigation/index";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminMenuCreateRoute } from "../create.js";
import { registerAdminMenuUpdateTreeRoute } from "../update-tree.js";

/**
 * @file Menu HTML mode over the admin API (owner 2026-10-08): the editor's HTML tab saves
 * `{ mode, html }`; raw HTML needs `pages.edit_html` on top of the menu permission (the HTML-mode
 * forms trust boundary), while switching back to items does not.
 */

async function setup(t: test.TestContext, denied: readonly string[] = []) {
  const menuRepo = new InMemoryMenuRepo({});
  await menuRepo.save({ id: "m1", workspaceId: "ws-1", title: "Header", slug: "header-main", status: "published", version: 1,
    doc: { type: "menu", version: 1, items: [{ id: "home", label: "Home", target: { kind: "url", href: "/" } }] }, locations: [], updatedAt: "2026-10-08T00:00:00.000Z" });
  const asked: string[] = [];
  const deps = { workspaceId: "ws-1", menuRepo, clock: { nowMs: () => Date.parse("2026-10-08T01:00:00.000Z") }, idGen: { newId: () => "id-x" }, outbox: { enqueue: async () => {} },
    authorize: async ({ permission }: { permission: string }) => { asked.push(permission); return denied.includes(permission) ? { allowed: false, reason: "no_grant" } : { allowed: true, reason: "matched" }; } };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => { res.locals.principal = { id: "owner" }; next(); });
  registerAdminMenuUpdateTreeRoute(app, deps as any);
  registerAdminMenuCreateRoute(app, deps as any);
  const baseUrl = await startTestServer(app, t);
  const send = (method: "PUT" | "POST", path: string, body: object) => fetch(`${baseUrl}/api/admin/v1/workspaces/ws-1/menus${path}`, {
    method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return { menuRepo, asked, send };
}

test("PUT with mode html saves normalized html, keeps items, and returns mode/html", async (t) => {
  const { menuRepo, asked, send } = await setup(t);
  const res = await send("PUT", "/m1", { expectedVersion: 1, mode: "html", html: "<ul><li>A</ul>" });
  assert.equal(res.status, 200, await res.clone().text());
  const body = await res.json() as { menu: { mode: string; html: string; items: unknown[] } };
  assert.equal(body.menu.mode, "html");
  assert.equal(body.menu.html, "<ul><li>A</li></ul>");
  assert.equal(body.menu.items.length, 1);
  assert.deepEqual(asked, ["admin.menus.update", "pages.edit_html"]);
  assert.equal((await menuRepo.findById({ workspaceId: "ws-1", id: "m1" }))?.doc.html, "<ul><li>A</li></ul>");
});

test("PUT with html but no raw-HTML permission is 403 and stores nothing", async (t) => {
  const { menuRepo, send } = await setup(t, ["pages.edit_html"]);
  const res = await send("PUT", "/m1", { expectedVersion: 1, mode: "html", html: "<p>x</p>" });
  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as { details: { permission: string } }).details.permission, "pages.edit_html");
  const stored = await menuRepo.findById({ workspaceId: "ws-1", id: "m1" });
  assert.equal(stored?.version, 1);
  assert.equal(stored?.doc.html, undefined);
});

test("PUT switching back to items needs no raw-HTML permission and keeps the html", async (t) => {
  const { menuRepo, send } = await setup(t);
  assert.equal((await send("PUT", "/m1", { expectedVersion: 1, mode: "html", html: "<p>x</p>" })).status, 200);
  const { send: deniedSend } = { send };
  const res = await deniedSend("PUT", "/m1", { expectedVersion: 2, mode: "items", items: [] });
  assert.equal(res.status, 200);
  const stored = await menuRepo.findById({ workspaceId: "ws-1", id: "m1" });
  assert.equal(stored?.doc.mode, "items");
  assert.equal(stored?.doc.html, "<p>x</p>");
});

test("PUT with an unknown mode is 400", async (t) => {
  const { send } = await setup(t);
  const res = await send("PUT", "/m1", { expectedVersion: 1, mode: "tree" });
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: string }).error, /mode must be 'items' or 'html'/);
});

test("POST create accepts mode/html under the same permission", async (t) => {
  const { asked, send } = await setup(t);
  const res = await send("POST", "", { title: "Footer", slug: "footer", mode: "html", html: "<p>f</p>" });
  assert.equal(res.status, 201, await res.clone().text());
  const body = await res.json() as { menu: { mode: string; html: string } };
  assert.equal(body.menu.html, "<p>f</p>");
  assert.ok(asked.includes("pages.edit_html"));
});
