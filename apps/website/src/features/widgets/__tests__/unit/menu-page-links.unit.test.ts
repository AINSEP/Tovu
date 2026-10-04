import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryMenuRepo, InMemoryNavLocationBindingRepo, createNavMenuReadModel } from "#src/features/navigation/index";
import { InMemoryPostRepo } from "#src/features/post/repo.memory";
import { seededPosts } from "#src/server/runtime/configuration/seed";
import { createMenuPageTargetResolver } from "#src/features/navigation/page-target-resolver";
import { createCoreResolvers } from "../../resolvers/create-core-resolvers.js";
import type { CoreResolverDeps } from "../../resolvers/create-core-resolvers.js";
import type { JsonValue } from "@jini-ai/core/primitives";

test("public dynamic menu widgets resolve renamed pages and omit unpublished page leaves", async () => {
  const page = { ...seededPosts[0]!, id: "about", workspaceId: "ws", kind: "page" as const, slug: "our-story", status: "published" as const, deletedAt: null };
  const posts = new InMemoryPostRepo([page]);
  const menuRepo = new InMemoryMenuRepo({});
  await menuRepo.save({ id: "footer", workspaceId: "ws", slug: "footer-nav", title: "Footer", status: "published", locations: [], updatedAt: "2026-10-04", version: 1,
    doc: { type: "menu", version: 1, items: [{ id: "about", label: "About", target: { kind: "entryRef", entryId: "about" } }] },
  });
  // Only the menu resolver executes; other domain ports are explicit unused dependencies.
  const resolvers = createCoreResolvers({
    navMenuReadModel: createNavMenuReadModel({ menuRepo, bindingRepo: new InMemoryNavLocationBindingRepo({}) }),
    resolveMenuTargetHref: createMenuPageTargetResolver({ postRepo: posts }),
    entryList: {} as CoreResolverDeps["entryList"], formDefinitionRepo: {} as CoreResolverDeps["formDefinitionRepo"], contentTypes: {} as CoreResolverDeps["contentTypes"],
  });
  const resolve = () => resolvers.menu!.resolveMany([{ id: "widget", widgetType: "menu", config: { menuRef: "footer" } }], { workspaceId: "ws", preview: false });
  const first = (await resolve()).get("widget");
  assert.ok(first?.ok);
  assert.equal((first.ir.props.items as unknown as Array<{ href: string }>)[0].href, "/our-story");
  await posts.save({ ...page, status: "draft" });
  const second = (await resolve()).get("widget");
  assert.ok(second?.ok);
  assert.deepEqual(second.ir.props.items as JsonValue, []);
});
