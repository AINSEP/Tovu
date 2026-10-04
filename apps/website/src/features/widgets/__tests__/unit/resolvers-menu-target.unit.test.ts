import assert from "node:assert/strict";
import test from "node:test";
import { createMenuResolver } from "../../resolvers/menu.js";
import type { NavMenuEntry, NavMenuReadModel } from "#src/features/navigation/index";

// F2.6/F3.6: the actual navigation resolver runs; only the lower read/routing ports are faked.
test("an injected target resolver supplies hrefs for non-URL items in the configured menu", async () => {
  const menu: NavMenuEntry = {
    id: "menu-footer", workspaceId: "ws-menu", slug: "footer", title: "Footer eight", status: "published", locations: [], updatedAt: "2026-09-29T00:00:00Z", version: 1,
    doc: { type: "menu", version: 1, items: [{ id: "about", label: "About eight", target: { kind: "entryRef", entryId: "entry-eight" } }] },
  };
  const reads: unknown[] = [];
  const targets: unknown[] = [];
  const reader = { getMenu: async (p: unknown) => { reads.push(p); assert.deepEqual(p, { workspaceId: "ws-menu", menuId: "menu-footer" }); return menu; } } as NavMenuReadModel;
  const resolver = createMenuResolver({ navMenuReadModel: reader,
    resolveTargetHref: async ({ target, context }) => { targets.push([target, context]); assert.deepEqual(target, { kind: "entryRef", entryId: "entry-eight" }); assert.deepEqual(context, { workspaceId: "ws-menu" }); return { path: "/about-eight", available: true }; },
  });
  const result = await resolver.resolveMany([
    { id: "bad", widgetType: "menu", config: { menuRef: "" } },
    { id: "footer", widgetType: "menu", config: { menuRef: "menu-footer" } },
  ], { workspaceId: "ws-menu", preview: false });
  assert.deepEqual(result.get("bad"), { ok: false, reason: "invalid-config" });
  assert.deepEqual(result.get("footer"), {
    ok: true, ir: { componentId: "menu", props: { title: "Footer eight", items: [{ id: "about", label: "About eight", href: "/about-eight", available: true, isCurrent: false, isActive: false, attrs: undefined, children: [] }] } }, dependencyKeys: ["menu-footer"],
  });
  assert.deepEqual(reads, [{ workspaceId: "ws-menu", menuId: "menu-footer" }]);
  assert.deepEqual(targets, [[{ kind: "entryRef", entryId: "entry-eight" }, { workspaceId: "ws-menu" }]]);
});

test("menu read failures propagate and a later call uses recovered data", async () => {
  let fail = true;
  const resolver = createMenuResolver({ navMenuReadModel: { getMenu: async (p) => { assert.deepEqual(p, { workspaceId: "ws-menu", menuId: "missing" }); if (fail) throw new Error("menu storage failed"); return null; } } as NavMenuReadModel });
  const instances = [{ id: "w", widgetType: "menu", config: { menuRef: "missing" } }];
  const context = { workspaceId: "ws-menu", preview: false };
  await assert.rejects(resolver.resolveMany(instances, context), { message: "menu storage failed" });
  fail = false;
  assert.deepEqual((await resolver.resolveMany(instances, context)).get("w"), { ok: false, reason: "target-disabled" });
});
