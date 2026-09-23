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

test("REQ-25: the legacy-path query itself is bounded/sorted/filtered — not a full unbounded scan truncated in memory afterward", async () => {
  const calls: unknown[] = [];
  const spyEntryList = {
    async listByWorkspace(params: unknown) {
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
    status: "published",
    orderBy: "updatedAt",
    orderDirection: "desc",
    limit: 20,
  });
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
  assert.equal((result.ir.children?.[0]?.props as { href: unknown }).href, null);
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
