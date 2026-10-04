import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createRouteDeps } from "../runtime/composition/app.js";
import { registerAdminMenuUpdateTreeRoute } from "../inbound/admin-http/routes/menus/update-tree.js";
import { registerAdminMenuListRoute } from "../inbound/admin-http/routes/menus/list.js";
import { createCapturingResponse, extractRouteHandler } from "./helpers/http-test-server.js";

test("admin menu PUT then GET list keeps nested page hints and last-known URLs", async () => {
  const deps = createRouteDeps();
  await deps.identityReady;
  const owner = await deps.userRepo.findByUsername({ workspaceId: deps.workspaceId, username: "admin" });
  assert.ok(owner);
  const principal = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: owner.principalId });
  assert.ok(principal);
  await deps.menuRepo.save({ id: "footer", workspaceId: deps.workspaceId, slug: "footer-nav", title: "Footer", status: "published",
    version: 1, updatedAt: "2026-10-04", locations: [], doc: { type: "menu", version: 1, items: [] } });
  const app = express();
  registerAdminMenuUpdateTreeRoute(app, deps);
  registerAdminMenuListRoute(app, deps);
  const target = { kind: "entryRef", entryId: "page-about", entryType: "page", lastKnownHref: "/about" };
  const items = [{ id: "parent", target: { kind: "url", href: "/" }, children: [{ id: "about", label: "About", target }] }];
  const written = createCapturingResponse();
  written.res.locals.principal = principal;
  await extractRouteHandler(app, "put", "/api/admin/v1/workspaces/:workspaceId/menus/:menuId")({
    params: { workspaceId: deps.workspaceId, menuId: "footer" }, body: { expectedVersion: 1, items },
  }, written.res);
  assert.equal(written.capture.statusCode, 200);
  const listed = createCapturingResponse();
  listed.res.locals.principal = principal;
  await extractRouteHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/menus")({ params: { workspaceId: deps.workspaceId } }, listed.res);
  assert.equal(listed.capture.statusCode, 200);
  const body = listed.capture.jsonBody as { menus: Array<{ id: string; items: typeof items }> };
  assert.deepEqual(body.menus.find((menu) => menu.id === "footer")?.items[0].children[0].target, target);
});
