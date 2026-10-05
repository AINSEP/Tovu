import assert from "node:assert/strict";
import test from "node:test";

import type { ContentTypeFieldDef, ContentTypeRecord } from "#src/features/content-types/index";
import type { EntryRecord } from "#src/features/entries/index";
import { TrashAwareInMemoryEntryRepo } from "#src/features/entries/trash-aware-memory-repo";
import { SYSTEM_CONTENT_TYPES, type CollectionListQuery, type EntryDisplayListPort } from "#src/features/entries/public-list";
import { createRecentEntriesResolver, type ContentTypeLookup } from "../../resolvers/recent-entries.js";
import type { WidgetInstanceView, WidgetResolveContext } from "../../types.js";

/**
 * @file `recent-entries` widget resolver — SPEC-043 REQ-24/REQ-25's bounded-query contract, plus
 * collections plan R1 ("Recent Entries" becomes "Collection list"). Two independent read paths:
 * no `collection` in config keeps today's cross-type `listByWorkspace` behaviour (D7 — the only
 * visible change is the dead entry link becoming plain text, proven in `render.test.ts`, not here);
 * `collection` set switches to C1's `parseCollectionListConfig` + C2's `listPublishedForDisplay`,
 * the same parser/query the `{"type":"collection"}` marker already uses (`pages.ts`'s
 * `resolveOneCollectionMarker`).
 */

const WORKSPACE_ID = "ws-1";
const CTX: WidgetResolveContext = { workspaceId: WORKSPACE_ID, preview: false };

function instance(id: string, config: Record<string, unknown> = {}): WidgetInstanceView {
  return { id, widgetType: "recent-entries", config: config as WidgetInstanceView["config"] };
}

/** No content type ever registered — used by every test on the legacy (no-`collection`) path,
 * which never calls this port at all. */
function noContentTypes(): ContentTypeLookup {
  return {
    async findByKey() {
      return null;
    },
  };
}

/** A fixed `ContentTypeLookup` double over an in-memory map of key -> declared fields, mirroring
 * `repo.sqlite.integration.test.ts`'s own `fixedContentTypeLookup` precedent for the same port
 * shape (that file's C2 tests; this one is the widget's C1 consumer). */
function fixedContentTypeLookup(types: Readonly<Record<string, ContentTypeFieldDef[]>>): ContentTypeLookup {
  return {
    async findByKey(params: { workspaceId: string; key: string }): Promise<ContentTypeRecord | null> {
      const fields = types[params.key];
      if (!fields) return null;
      return { workspaceId: params.workspaceId, key: params.key, label: params.key, fields, status: "active", version: 1 };
    },
  };
}

function field(name: string, kind: ContentTypeFieldDef["kind"] = "text"): ContentTypeFieldDef {
  return { name, kind, required: false, queryable: false };
}

function entryRow(overrides: Partial<EntryRecord> & Pick<EntryRecord, "id" | "type" | "slug" | "title">): EntryRecord {
  return {
    workspaceId: WORKSPACE_ID,
    status: "published",
    bodyJson: null,
    fieldsJson: { ext: { site: {} } },
    publishedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Legacy path: no `collection` in config — must keep today's behaviour (D7)
// ---------------------------------------------------------------------------

test("REQ-25: never returns more than the registered clamp, even with far more published entries than the clamp and no instance-level maxItems", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  for (let i = 0; i < 50; i++) {
    await repo.save(
      entryRow({
        id: `entry-${i}`,
        type: "post",
        slug: `post-${i}`,
        title: `Post ${i}`,
        updatedAt: `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
      })
    );
  }

  const resolver = createRecentEntriesResolver({ entryList: repo, contentTypes: noContentTypes() });
  const results = await resolver.resolveMany([instance("w-1")], CTX);

  const result = results.get("w-1");
  assert.ok(result?.ok);
  if (!result.ok) return;
  assert.equal(result.ir.children?.length, 20, "must be capped at the registered clamp (20), not the 50 available entries");
});

test("REQ-25/D7: newest-updated-first, draft excluded, and an old {maxItems:5} config yields the same entries in the same order as before", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  await repo.save(entryRow({ id: "draft-1", type: "post", slug: "draft", title: "Draft", status: "draft", updatedAt: "2026-01-01T00:00:05.000Z" }));
  await repo.save(entryRow({ id: "old-1", type: "post", slug: "old", title: "Old Post", updatedAt: "2026-01-01T00:00:01.000Z" }));
  await repo.save(entryRow({ id: "new-1", type: "post", slug: "new", title: "New Post", updatedAt: "2026-01-01T00:00:02.000Z" }));

  const resolver = createRecentEntriesResolver({ entryList: repo, contentTypes: noContentTypes() });
  const results = await resolver.resolveMany([instance("w-1", { maxItems: 5 })], CTX);

  const result = results.get("w-1");
  assert.ok(result?.ok);
  if (!result.ok) return;
  const titles = result.ir.children?.map((c) => (c.props as { title: string }).title);
  assert.deepEqual(titles, ["New Post", "Old Post"], "newest-updated-first, draft excluded entirely");
});

test("REQ-25: each legacy instance applies its own maxItems below the shared registry cap", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  for (let i = 0; i < 6; i++) {
    await repo.save(entryRow({ id: `entry-${i}`, type: "post", slug: `post-${i}`, title: `Post ${i}`, updatedAt: `2026-01-01T00:00:0${i}.000Z` }));
  }
  const resolver = createRecentEntriesResolver({ entryList: repo, contentTypes: noContentTypes() });
  const results = await resolver.resolveMany([instance("w-three", { maxItems: 3 }), instance("w-one", { maxItems: 1 })], CTX);
  for (const [id, titles] of [["w-three", ["Post 5", "Post 4", "Post 3"]], ["w-one", ["Post 5"]]] as const) {
    const result = results.get(id);
    assert.ok(result?.ok);
    if (!result.ok) continue;
    assert.deepEqual(result.ir.children?.map((child) => child.props.title), titles);
  }
});

test("D1/D7: every legacy-path item's href is null (entry pages are off) — never a dead entry link", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  await repo.save(entryRow({ id: "e-1", type: "post", slug: "post-1", title: "Post 1" }));

  const resolver = createRecentEntriesResolver({ entryList: repo, contentTypes: noContentTypes() });
  const results = await resolver.resolveMany([instance("w-1")], CTX);
  const result = results.get("w-1");
  assert.ok(result?.ok);
  if (!result.ok) return;
  const hrefs = result.ir.children?.map((c) => (c.props as { href: unknown }).href);
  assert.deepEqual(hrefs, [null]);
});

test("D8: system content types (widget/widget_area/nav-menu) never appear when no collection is set", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  await repo.save(entryRow({ id: "post-1", type: "post", slug: "post-1", title: "Real Post", updatedAt: "2026-01-01T00:00:03.000Z" }));
  let n = 0;
  for (const systemType of SYSTEM_CONTENT_TYPES) {
    n += 1;
    await repo.save(
      entryRow({ id: `sys-${n}`, type: systemType, slug: `sys-${n}`, title: `System ${systemType}`, updatedAt: "2026-01-01T00:00:04.000Z" })
    );
  }

  const resolver = createRecentEntriesResolver({ entryList: repo, contentTypes: noContentTypes() });
  const results = await resolver.resolveMany([instance("w-1")], CTX);
  const result = results.get("w-1");
  assert.ok(result?.ok);
  if (!result.ok) return;
  const titles = result.ir.children?.map((c) => (c.props as { title: string }).title);
  assert.deepEqual(titles, ["Real Post"], "every system-content-type entry must be dropped, not just clamped past");
});

test("REQ-25/3b: the legacy-path query itself is bounded/sorted/filtered — not a full unbounded scan truncated in memory afterward, and system types are excluded IN the query, not after its limit", async () => {
  const calls: unknown[] = [];
  const spyEntryList = {
    async listByWorkspace(): Promise<EntryRecord[]> {
      throw new Error("must not be called — the legacy path must use listByWorkspaceExcludingTypes so the limit never counts excluded rows");
    },
    async listByWorkspaceExcludingTypes(params: unknown) {
      calls.push(params);
      return [] as EntryRecord[];
    },
    async listPublishedForDisplay(): Promise<EntryRecord[]> {
      throw new Error("must not be called for a legacy (no-collection) instance");
    },
  };

  const resolver = createRecentEntriesResolver({ entryList: spyEntryList, contentTypes: noContentTypes() });
  await resolver.resolveMany([instance("w-1")], CTX);

  assert.equal(calls.length, 1, "exactly one query for the whole batch (REQ-24)");
  assert.deepEqual(calls[0], {
    workspaceId: WORKSPACE_ID,
    excludeTypes: SYSTEM_CONTENT_TYPES,
    status: "published",
    orderBy: "updatedAt",
    orderDirection: "desc",
    limit: 20,
  });
});

test("3b: 20+ newer system-type rows cannot crowd a real entry out of the legacy-path result (RED before the query-level exclusion fix)", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  await repo.save(entryRow({ id: "post-1", type: "post", slug: "post-1", title: "Real Post", updatedAt: "2026-01-01T00:00:00.000Z" }));
  for (let i = 0; i < 25; i++) {
    await repo.save(
      entryRow({ id: `sys-${i}`, type: "widget", slug: `sys-${i}`, title: `System widget ${i}`, updatedAt: "2026-01-02T00:00:00.000Z" })
    );
  }

  const resolver = createRecentEntriesResolver({ entryList: repo, contentTypes: noContentTypes() });
  const results = await resolver.resolveMany([instance("w-1")], CTX);
  const result = results.get("w-1");
  assert.ok(result?.ok);
  if (!result.ok) return;
  const titles = result.ir.children?.map((c) => (c.props as { title: string }).title);
  assert.deepEqual(
    titles,
    ["Real Post"],
    "the real entry must survive even though 25 system rows are newer than it and the clamp is only 20"
  );
});

// ---------------------------------------------------------------------------
// New "Collection list" path: `collection` set in config
// ---------------------------------------------------------------------------

test("collection filter: only entries of the named content type are returned, via listPublishedForDisplay", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  await repo.save(entryRow({ id: "r-1", type: "recipe", slug: "r-1", title: "Pasta", fieldsJson: { ext: { site: { cuisine: "Italian" } } } }));
  await repo.save(entryRow({ id: "r-2", type: "recipe", slug: "r-2", title: "Ramen", fieldsJson: { ext: { site: { cuisine: "Japanese" } } } }));
  await repo.save(entryRow({ id: "p-1", type: "post", slug: "p-1", title: "Unrelated Post" }));

  const contentTypes = fixedContentTypeLookup({ recipe: [field("cuisine")] });
  const resolver = createRecentEntriesResolver({ entryList: repo, contentTypes });
  const results = await resolver.resolveMany([instance("w-1", { maxItems: 10, collection: "recipe" })], CTX);

  const result = results.get("w-1");
  assert.ok(result?.ok);
  if (!result.ok) return;
  const children = result.ir.children ?? [];
  assert.equal(children.length, 2, "only recipe-type entries, the unrelated post is excluded");
  const cuisines = children.map((c) => (c.props as { fields: Array<{ name: string; value: unknown }> }).fields.find((f) => f.name === "cuisine")?.value);
  assert.deepEqual(new Set(cuisines), new Set(["Italian", "Japanese"]));
});

test("collection filter: valid where and newest sort return only ordered live published matches with dependency keys", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  const rows = [
    entryRow({ id: "old", type: "recipe", slug: "old", title: "Old Pasta", publishedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-10T00:00:00.000Z" }),
    entryRow({ id: "new", type: "recipe", slug: "new", title: "New Pasta", publishedAt: "2026-01-02T00:00:00.000Z" }),
    entryRow({ id: "draft", type: "recipe", slug: "draft", title: "Draft Pasta", status: "draft", publishedAt: "2026-01-03T00:00:00.000Z" }),
    entryRow({ id: "trash", type: "recipe", slug: "trash", title: "Trashed Pasta", publishedAt: "2026-01-04T00:00:00.000Z" }),
    entryRow({ id: "other-type", type: "post", slug: "other-type", title: "Post", publishedAt: "2026-01-05T00:00:00.000Z" }),
  ];
  for (const row of rows) {
    await repo.save({ ...row, fieldsJson: { ext: { site: { cuisine: "Italian" } } } });
  }
  await repo.save(entryRow({ id: "ramen", type: "recipe", slug: "ramen", title: "Ramen", publishedAt: "2026-01-06T00:00:00.000Z", fieldsJson: { ext: { site: { cuisine: "Japanese" } } } }));
  const trashed = await repo.findAnyById({ workspaceId: WORKSPACE_ID, id: "trash" });
  assert.ok(trashed);
  await repo.saveAny({ ...trashed, deletedAt: "2026-01-07T00:00:00.000Z" });

  const resolver = createRecentEntriesResolver({ entryList: repo, contentTypes: fixedContentTypeLookup({ recipe: [field("cuisine")] }) });
  // "newest" is the supported published-date descending keyword; "-published" names a custom field.
  const results = await resolver.resolveMany([instance("w-filtered", { collection: "recipe", maxItems: 10, where: { cuisine: "Italian" }, sort: "newest" })], CTX);
  const result = results.get("w-filtered");
  assert.ok(result?.ok);
  if (!result.ok) return;
  assert.deepEqual(result.ir.children?.map((child) => child.props.title), ["New Pasta", "Old Pasta"]);
  assert.deepEqual(result.dependencyKeys, ["new", "old"]);
});

test("D7: legacy columns clamp to 1..6 and dependency keys match the resolved entries", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  await repo.save(entryRow({ id: "e-1", type: "post", slug: "post-1", title: "Post 1" }));
  const resolver = createRecentEntriesResolver({ entryList: repo, contentTypes: noContentTypes() });
  const results = await resolver.resolveMany([instance("w-high", { columns: 99 }), instance("w-low", { columns: 0 })], CTX);
  for (const [id, columns] of [["w-high", 6], ["w-low", 1]] as const) {
    const result = results.get(id);
    assert.ok(result?.ok);
    if (!result.ok) continue;
    assert.equal(result.ir.props.columns, columns);
    assert.deepEqual(result.dependencyKeys, ["e-1"]);
  }
});

test("collection settings preserve filtering, title order and an explicit field subset", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  for (const row of [
    entryRow({ id: "zulu", type: "recipe", slug: "zulu", title: "Zulu", updatedAt: "2026-01-03T00:00:00.000Z", fieldsJson: { ext: { site: { cuisine: "Italian", rating: 9, notes: "omit zulu notes" } } } }),
    entryRow({ id: "alpha", type: "recipe", slug: "alpha", title: "Alpha", updatedAt: "2026-01-01T00:00:00.000Z", fieldsJson: { ext: { site: { cuisine: "Italian", rating: 3, notes: "omit alpha notes" } } } }),
    entryRow({ id: "ramen", type: "recipe", slug: "ramen", title: "Ramen", updatedAt: "2026-01-04T00:00:00.000Z", fieldsJson: { ext: { site: { cuisine: "Japanese", rating: 7, notes: "omit ramen notes" } } } }),
  ]) await repo.save(row);
  const resolver = createRecentEntriesResolver({
    entryList: repo,
    contentTypes: fixedContentTypeLookup({ recipe: [field("cuisine"), field("rating", "integer"), field("notes")] }),
  });
  const result = (await resolver.resolveMany([
    instance("selected-fields", { collection: "recipe", maxItems: 2, where: { cuisine: "Italian" }, sort: "title", fields: ["rating"] }),
  ], CTX)).get("selected-fields");
  assert.ok(result?.ok);
  if (!result.ok) return;
  assert.deepEqual(result.ir.children?.map((child) => ({
    title: child.props.title,
    fields: child.props.fields,
  })), [
    { title: "Alpha", fields: [{ name: "rating", label: "Rating", kind: "integer", value: 3 }] },
    { title: "Zulu", fields: [{ name: "rating", label: "Rating", kind: "integer", value: 9 }] },
  ]);
  assert.deepEqual(result.dependencyKeys, ["alpha", "zulu"]);
});

test("collection filter: an unknown content type key resolves as target-disabled, not a crash or an unfiltered list", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  const resolver = createRecentEntriesResolver({ entryList: repo, contentTypes: noContentTypes() });
  const results = await resolver.resolveMany([instance("w-1", { maxItems: 5, collection: "does-not-exist" })], CTX);
  assert.deepEqual(results.get("w-1"), { ok: false, reason: "target-disabled" });
});

test("collection filter: an invalid config (unknown where field) resolves as invalid-config, never an unfiltered fallback", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  await repo.save(entryRow({ id: "r-1", type: "recipe", slug: "r-1", title: "Pasta" }));
  const contentTypes = fixedContentTypeLookup({ recipe: [field("cuisine")] });
  const resolver = createRecentEntriesResolver({ entryList: repo, contentTypes });
  const results = await resolver.resolveMany(
    [instance("w-1", { maxItems: 5, collection: "recipe", where: { notARealField: "x" } })],
    CTX
  );
  assert.deepEqual(results.get("w-1"), { ok: false, reason: "invalid-config" });
});

test("D1: a collection-path item's href is also null (entry pages are off)", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  await repo.save(entryRow({ id: "r-1", type: "recipe", slug: "r-1", title: "Pasta" }));
  const contentTypes = fixedContentTypeLookup({ recipe: [] });
  const resolver = createRecentEntriesResolver({ entryList: repo, contentTypes });
  const results = await resolver.resolveMany([instance("w-1", { maxItems: 5, collection: "recipe" })], CTX);
  const result = results.get("w-1");
  assert.ok(result?.ok);
  if (!result.ok) return;
  assert.equal(result.ir.children?.[0]?.props.href, null, "an empty result must fail here too (undefined !== null)");
});

test("REQ-25: the registered clamp (20) still wins over a collection instance's own maxItems, defense in depth", async () => {
  const calls: CollectionListQuery[] = [];
  const spyEntryList: EntryDisplayListPort & { listByWorkspace: () => Promise<EntryRecord[]> } = {
    async listByWorkspace() {
      return [];
    },
    async listPublishedForDisplay(params) {
      calls.push(params.query);
      return [];
    },
  };
  const contentTypes = fixedContentTypeLookup({ recipe: [] });
  const resolver = createRecentEntriesResolver({ entryList: spyEntryList, contentTypes });
  // 24 is within parseCollectionListConfig's own 1-24 bound but above the registry's 20 clamp.
  await resolver.resolveMany([instance("w-1", { maxItems: 24, collection: "recipe" })], CTX);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].limit, 20, "must never exceed the registered clamp regardless of the instance's own (schema-legal) maxItems");
});

test("D7: a collection-configured instance with no `layout` key defaults to the widget's own \"list\" layout, not the collection marker's \"cards\" default", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  await repo.save(entryRow({ id: "r-1", type: "recipe", slug: "r-1", title: "Pasta" }));
  const contentTypes = fixedContentTypeLookup({ recipe: [field("cuisine")] });
  const resolver = createRecentEntriesResolver({ entryList: repo, contentTypes });
  const results = await resolver.resolveMany(
    [instance("w-default", { maxItems: 5, collection: "recipe" }), instance("w-cards", { maxItems: 5, collection: "recipe", layout: "cards" })],
    CTX
  );

  const defaulted = results.get("w-default");
  const cards = results.get("w-cards");
  assert.ok(defaulted?.ok && cards?.ok);
  if (!defaulted.ok || !cards.ok) return;
  assert.equal(defaulted.ir.props.layout, "list", "D7: absent layout means the widget's historical list layout");
  assert.equal(cards.ir.props.layout, "cards", "an explicit cards layout is still honoured");
});

test("AW-7: a collection instance carries any known layout and opt-in faq-page structured data; an unknown layout is the widget's list", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  await repo.save(entryRow({ id: "q-1", type: "recipe", slug: "q-1", title: "Can I freeze it?" }));
  const contentTypes = fixedContentTypeLookup({ recipe: [field("cuisine")] });
  const resolver = createRecentEntriesResolver({ entryList: repo, contentTypes });
  const results = await resolver.resolveMany(
    [
      instance("w-faq", { maxItems: 5, collection: "recipe", layout: "accordion", structuredData: "faq-page" }),
      instance("w-carousel", { maxItems: 5, collection: "recipe", layout: "carousel" }),
      instance("w-odd", { maxItems: 5, collection: "recipe", layout: "grid-of-doom" }),
      instance("w-legacy", { maxItems: 5, layout: "accordion", structuredData: "faq-page" }),
    ],
    CTX
  );
  const props = (id: string) => {
    const result = results.get(id);
    assert.ok(result?.ok);
    return result.ok ? result.ir.props : {};
  };
  assert.deepEqual(props("w-faq"), { layout: "accordion", columns: 3, typeKey: "recipe", structuredData: "faq-page" });
  assert.deepEqual(props("w-carousel"), { layout: "carousel", columns: 3, typeKey: "recipe" });
  assert.equal(props("w-odd").layout, "list");
  // The legacy (no `collection`) path lists mixed types, so it never claims to be an FAQ.
  assert.deepEqual(props("w-legacy"), { layout: "accordion", columns: 3, typeKey: "recent-entries" });
});
