import assert from "node:assert/strict";
import test from "node:test";

import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";
import { MENU_RAW_HTML_PERMISSION } from "#src/features/navigation/index";
import { authorizeMenuHtmlOrRespond, parseMenuHtmlAuthoring, toAdminMenuDto } from "../../menus.js";

const baseMenu = {
  id: "menu-1", workspaceId: "ws-1", slug: "main", title: "Main", status: "published",
  locations: ["header"], updatedAt: "2026-10-22T00:00:00.000Z", version: 3,
};

test("toAdminMenuDto omits mode/html when the doc carries neither", () => {
  const dto = toAdminMenuDto({ ...baseMenu, doc: { items: [] } } as never) as unknown as Record<string, unknown>;
  assert.equal("mode" in dto, false);
  assert.equal("html" in dto, false);
  assert.deepEqual(dto.items, []);
  assert.deepEqual(dto.locations, ["header"]);
});

test("toAdminMenuDto carries mode and html through when the doc is HTML-authored", () => {
  const dto = toAdminMenuDto({ ...baseMenu, doc: { items: [], mode: "html", html: "<a>x</a>" } } as never) as unknown as Record<string, unknown>;
  assert.equal(dto.mode, "html");
  assert.equal(dto.html, "<a>x</a>");
});

test("parseMenuHtmlAuthoring keeps only the fields that were sent", () => {
  assert.deepEqual(parseMenuHtmlAuthoring({}), {});
  assert.deepEqual(parseMenuHtmlAuthoring({ mode: "html", html: "<b>y</b>", other: 1 }), { mode: "html", html: "<b>y</b>" });
});

test("authorizeMenuHtmlOrRespond names the menu as entityId only when a menuId is given", async () => {
  const calls: unknown[] = [];
  const deps = { workspaceId: "ws-1", authorize: async (p: unknown) => { calls.push(p); return { allowed: true, reason: "grant" }; } };
  const authoring = { mode: "html", html: "<i>z</i>" } as never;
  const { res } = createCapturingResponse();
  assert.equal(await authorizeMenuHtmlOrRespond(res as never, deps as never, { principalId: "p-1", authoring, menuId: "menu-1" }), true);
  assert.equal(await authorizeMenuHtmlOrRespond(res as never, deps as never, { principalId: "p-1", authoring }), true);
  assert.deepEqual(calls, [
    { principalId: "p-1", permission: MENU_RAW_HTML_PERMISSION, workspaceId: "ws-1", entityType: "menu", entityId: "menu-1" },
    { principalId: "p-1", permission: MENU_RAW_HTML_PERMISSION, workspaceId: "ws-1", entityType: "menu" },
  ]);
});
