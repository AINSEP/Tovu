import { parseCollectionListConfig, entryPublicHref, humanizeFieldName, isCollectionListLayout, SYSTEM_CONTENT_TYPES } from "#src/features/entries/public-list";
import { resolveMenuDoc } from "@jini-ai/cms/navigation";
import assert from "node:assert/strict";
import test from "node:test";

import { TrashAwareInMemoryEntryRepo } from "#src/features/entries/trash-aware-memory-repo";
import { InMemoryFormDefinitionRepo } from "@jini-ai/cms/forms";
import type { NavMenuEntry, NavMenuReadModel } from "#src/features/navigation/index";
import { createCoreResolvers } from "@jini-ai/cms/widgets/resolvers";
import type { CoreResolverDeps } from "@jini-ai/cms/widgets/resolvers";
type ContentTypeLookup = CoreResolverDeps["contentTypes"];

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

function noContentTypes(): ContentTypeLookup {
  return {
    async findByKey() {
      return null;
    },
  };
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

test("createCoreResolvers: returns exactly the 3 v1 dynamic resolver type keys, each with a callable resolveMany", () => {
  const resolvers = createCoreResolvers({ menus: { resolveMenuDoc }, collectionList: { parseCollectionListConfig, entryPublicHref, humanizeFieldName, isCollectionListLayout, systemContentTypes: SYSTEM_CONTENT_TYPES },
    entryList: new TrashAwareInMemoryEntryRepo(),
    navMenuReadModel: fakeMenuReadModel(null),
    formDefinitionRepo: new InMemoryFormDefinitionRepo(),
    contentTypes: noContentTypes(),
  });

  assert.deepEqual(Object.keys(resolvers).sort(), ["contact-form", "menu", "recent-entries"]);
  assert.equal(typeof resolvers["recent-entries"]?.resolveMany, "function");
  assert.equal(typeof resolvers.menu?.resolveMany, "function");
  assert.equal(typeof resolvers["contact-form"]?.resolveMany, "function");
});

test("createCoreResolvers: each assembled resolver is wired to the deps it was given, not a shared/global default", async () => {
  const entryList = new TrashAwareInMemoryEntryRepo();
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

    const menu: NavMenuEntry = {
      id: "assembled-menu",
      workspaceId: "ws-1",
      slug: "assembled-menu",
      title: "Injected assembly menu",
      status: "published",
      doc: { type: "menu", version: 1, items: [
        { id: "assembled-item", label: "Assembly docs", target: { kind: "url", href: "https://example.test/assembly" } },
      ] },
      locations: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
      version: 1,
    };
    const formDefinitionRepo = new InMemoryFormDefinitionRepo();
    const fields = [{ id: "assembly-email", label: "Assembly email", type: "email" as const, required: true }];
    await formDefinitionRepo.create({
      id: "assembled-form",
      workspaceId: "ws-1",
      name: "Injected assembly form",
      slug: "assembly-contact",
      fields,
      notify: { enabled: false, recipients: [] },
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      version: 1,
    });
    const resolvers = createCoreResolvers({ menus: { resolveMenuDoc }, collectionList: { parseCollectionListConfig, entryPublicHref, humanizeFieldName, isCollectionListLayout, systemContentTypes: SYSTEM_CONTENT_TYPES },
      entryList,
      navMenuReadModel: fakeMenuReadModel(menu),
      formDefinitionRepo,
      contentTypes: noContentTypes(),
    });

  const results = await resolvers["recent-entries"]!.resolveMany(
    [{ id: "w-1", widgetType: "recent-entries", config: {} }],
    { workspaceId: "ws-1", preview: false },
  );
  const result = results.get("w-1");
  assert.ok(result?.ok, "must resolve against the real entryList it was constructed with");
  if (!result.ok) return;
    assert.equal(result.ir.children?.length, 1);
    assert.equal(result.ir.children?.[0]?.props.title, "Post 1");

    const context = { workspaceId: "ws-1", preview: false };
    const menuResult = (await resolvers.menu!.resolveMany(
      [{ id: "menu-widget", widgetType: "menu", config: { menuRef: "assembled-menu" } }],
      context,
    )).get("menu-widget");
    assert.ok(menuResult?.ok);
    if (!menuResult.ok) return;
    assert.equal(menuResult.ir.componentId, "menu");
    assert.equal(menuResult.ir.props.title, "Injected assembly menu");
    const items = menuResult.ir.props.items as unknown as Array<{ label: string; href: string; available: boolean }>;
    assert.equal(items.length, 1);
    assert.equal(items[0].label, "Assembly docs");
    assert.equal(items[0].href, "https://example.test/assembly");
    assert.equal(items[0].available, true);
    assert.deepEqual(menuResult.dependencyKeys, ["assembled-menu"]);

    const formResult = (await resolvers["contact-form"]!.resolveMany(
      [{ id: "form-widget", widgetType: "contact-form", config: { formDefinitionId: "assembled-form" } }],
      context,
    )).get("form-widget");
    assert.ok(formResult?.ok);
    if (!formResult.ok) return;
    assert.equal(formResult.ir.componentId, "contact-form");
    assert.equal(formResult.ir.props.formDefinitionId, "assembled-form");
    assert.equal(formResult.ir.props.slug, "assembly-contact");
    assert.deepEqual(formResult.ir.props.fields, fields);
    assert.deepEqual(formResult.dependencyKeys, ["assembled-form"]);
  });
