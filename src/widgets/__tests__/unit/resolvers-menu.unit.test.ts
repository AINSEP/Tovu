import assert from "node:assert/strict";
import test from "node:test";

import type { NavMenuEntry, NavMenuReadModel } from "#src/navigation/index";
import { createMenuResolver } from "../../resolvers/index.js";
import type { WidgetInstanceView, WidgetResolveContext } from "../../types.js";

/**
 * @file `menu` widget resolver href resolution (SPEC-043 REQ-09) — real hrefs for `url`-kind nav
 * targets, honest `available: false` for targets `src/routing` (ADR-039) can't resolve yet.
 */

const WORKSPACE_ID = "ws-1";
const CTX: WidgetResolveContext = { workspaceId: WORKSPACE_ID, preview: false };

function instance(overrides: Partial<WidgetInstanceView> & Pick<WidgetInstanceView, "id">): WidgetInstanceView {
  return { widgetType: "menu", config: {}, ...overrides };
}

function fakeMenuReadModel(menu: NavMenuEntry | null): NavMenuReadModel {
  return {
    async getMenu() {
      return menu;
    },
    async getMenuBySlug() {
      return menu;
    },
    async listMenus() {
      return menu ? [menu] : [];
    },
    async resolveForLocation() {
      return null;
    },
  };
}

test("REQ-09: a url-kind nav target resolves to a real href/available, not a raw target passthrough", async () => {
  const menu: NavMenuEntry = {
    id: "menu-1",
    workspaceId: WORKSPACE_ID,
    slug: "footer-menu",
    title: "Footer",
    status: "published",
    doc: {
      type: "menu",
      version: 1,
      items: [
        { id: "item-1", label: "Docs", target: { kind: "url", href: "https://example.com/docs" } },
      ],
    },
    locations: [],
    updatedAt: "2026-07-21T00:00:00.000Z",
    version: 1,
  };

  const resolver = createMenuResolver({ navMenuReadModel: fakeMenuReadModel(menu) });
  const results = await resolver.resolveMany([instance({ id: "w-1", config: { menuRef: "menu-1" } })], CTX);

  const result = results.get("w-1");
  assert.ok(result?.ok);
  if (!result.ok) return;
  const items = result.ir.props.items as unknown as Array<{ href: string | null; available: boolean }>;
  assert.equal(items.length, 1);
  assert.equal(items[0].href, "https://example.com/docs", "a url-kind target must resolve to its real href, not a raw NavTarget object");
  assert.equal(items[0].available, true);
});

test("REQ-09: an entryRef target resolves to available:false honestly (src/routing not built yet), never throws", async () => {
  const menu: NavMenuEntry = {
    id: "menu-2",
    workspaceId: WORKSPACE_ID,
    slug: "primary-menu",
    title: "Primary",
    status: "published",
    doc: {
      type: "menu",
      version: 1,
      items: [
        { id: "item-1", label: "About", target: { kind: "entryRef", entryId: "entry-about" } },
      ],
    },
    locations: [],
    updatedAt: "2026-07-21T00:00:00.000Z",
    version: 1,
  };

  const resolver = createMenuResolver({ navMenuReadModel: fakeMenuReadModel(menu) });
  const results = await resolver.resolveMany([instance({ id: "w-2", config: { menuRef: "menu-2" } })], CTX);

  const result = results.get("w-2");
  assert.ok(result?.ok);
  if (!result.ok) return;
  const items = result.ir.props.items as unknown as Array<{ href: string | null; available: boolean }>;
  assert.equal(items[0].href, null);
  assert.equal(items[0].available, false);
});
