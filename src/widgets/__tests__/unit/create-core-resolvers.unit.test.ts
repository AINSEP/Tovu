import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRepo } from "#src/features/entries/index";
import { InMemoryFormDefinitionRepo } from "#src/features/forms/repo.memory";
import type { NavMenuEntry, NavMenuReadModel } from "#src/navigation/index";
import { createCoreResolvers } from "../../resolvers/create-core-resolvers.js";

/**
 * @file `createCoreResolvers` — the pure assembly step `resolvers/index.ts`'s `wireCoreResolvers`
 * calls to turn injected infrastructure deps into the closed `CORE_RESOLVERS` map. This is real,
 * live wiring: `server/app.ts` and `server/deps.ts` both call `wireCoreResolvers` at boot (the
 * "future boot-wiring pass" `resolvers/index.ts`'s own file header once described as not-yet-landed
 * is landed). Each individual resolver factory (`createRecentEntriesResolver`/`createMenuResolver`/
 * `createContactFormResolver`) already has its own dedicated test exercising its resolution logic —
 * this file only asserts the assembly step itself: given the three deps, all three widget types are
 * present in the returned map with a real, callable `resolveMany`, keyed by the exact type keys
 * `resolveWidgetType`'s dispatch (`CORE_RESOLVERS[registration.resolverId]`) looks up.
 */

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

test("createCoreResolvers: returns exactly the 3 v1 dynamic resolver type keys, each with a callable resolveMany", () => {
  const resolvers = createCoreResolvers({
    entryList: new InMemoryEntryRepo(),
    navMenuReadModel: fakeMenuReadModel(null),
    formDefinitionRepo: new InMemoryFormDefinitionRepo(),
  });

  assert.deepEqual(Object.keys(resolvers).sort(), ["contact-form", "menu", "recent-entries"]);
  assert.equal(typeof resolvers["recent-entries"]?.resolveMany, "function");
  assert.equal(typeof resolvers.menu?.resolveMany, "function");
  assert.equal(typeof resolvers["contact-form"]?.resolveMany, "function");
});

test("createCoreResolvers: each assembled resolver is wired to the deps it was given, not a shared/global default", async () => {
  const entryList = new InMemoryEntryRepo();
  await entryList.save({
    id: "entry-1",
    workspaceId: "ws-1",
    type: "post",
    slug: "post-1",
    status: "published",
    title: "Post 1",
    bodyJson: null,
    fieldsJson: { ext: { site: {} } },
    publishedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:01.000Z",
    version: 1,
  });

  const resolvers = createCoreResolvers({
    entryList,
    navMenuReadModel: fakeMenuReadModel(null),
    formDefinitionRepo: new InMemoryFormDefinitionRepo(),
  });

  const results = await resolvers["recent-entries"]!.resolveMany(
    [{ id: "w-1", widgetType: "recent-entries", config: {} }],
    { workspaceId: "ws-1", preview: false },
  );
  const result = results.get("w-1");
  assert.ok(result?.ok, "must resolve against the real entryList it was constructed with");
  if (!result.ok) return;
  assert.equal(result.ir.children?.length, 1);
});
