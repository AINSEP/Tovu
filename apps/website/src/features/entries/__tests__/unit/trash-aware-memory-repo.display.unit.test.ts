import assert from "node:assert/strict";
import test from "node:test";

import type { ContentTypeFieldDef } from "#src/features/content-types/index";

import { createEntry, publishEntry, EntrySlugConflictError } from "../../index.js";
import type { EntryRecord } from "../../index.js";
import { TrashAwareInMemoryEntryRepo } from "../../trash-aware-memory-repo.js";

/**
 * @file Memory-twin parity suite for C2's `listPublishedForDisplay` (plan lines 149-167,
 * "Plus a memory-twin parity test ... running the same cases"). Mirrors
 * `repo.sqlite.integration.test.ts`'s where/sort/limit/exclusion cases exactly, against
 * `TrashAwareInMemoryEntryRepo` instead of the real SQLite adapter — proves both adapters agree
 * on filtering/sorting/limiting semantics (`server/runtime/composition/app.ts`'s hermetic
 * composition root has no `content.db`, so it depends on this twin behaving identically). The two
 * SQL-parameterization-specific cases (apostrophe-in-value round-trip, injection-shaped field
 * name) are NOT mirrored here: there is no SQL text in this adapter to inject into, so those
 * cases have no in-memory analogue.
 */

/** Same fixed `ContentTypeLookupPort` double `repo.sqlite.integration.test.ts` uses, with the
 * same optional `fields` widening. */
function fixedContentTypeLookup(workspaceId: string, key: string, fields: ContentTypeFieldDef[] = []) {
  return {
    findByKey: async (params: { workspaceId: string; key: string }) =>
      params.workspaceId === workspaceId && params.key === key
        ? { workspaceId, key, status: "active" as const, fields }
        : null,
  };
}

/** Same `createEntry` + `publishEntry` chokepoint helper as the SQLite suite, so both suites
 * exercise identical production write behavior against their own adapter. */
async function createPublishedEntry(params: {
  repo: TrashAwareInMemoryEntryRepo;
  workspaceId: string;
  type: string;
  contentTypeFields: ContentTypeFieldDef[];
  idSeed: string;
  slug: string;
  title: string;
  siteFields: Record<string, unknown>;
}): Promise<EntryRecord> {
  const deps = {
    entryRepo: params.repo,
    contentTypeRepo: fixedContentTypeLookup(params.workspaceId, params.type, params.contentTypeFields),
    clock: { nowIso: () => "2026-09-23T00:00:00.000Z", nowMs: () => Date.parse("2026-09-23T00:00:00.000Z") },
    ids: { newId: () => params.idSeed },
    authorize: async () => ({ allowed: true, reason: "ok" }),
    outbox: { enqueue: async () => {} },
  };
  const created = await createEntry({
    deps,
    input: {
      actorId: "user-1",
      workspaceId: params.workspaceId,
      type: params.type,
      slug: params.slug,
      title: params.title,
      fieldsJson: { ext: { site: params.siteFields } },
    },
  });
  assert.equal(created.ok, true, `createEntry failed for slug "${params.slug}"`);
  if (!created.ok) throw new Error("unreachable — asserted above");

  const published = await publishEntry({
    deps,
    input: { actorId: "user-1", workspaceId: params.workspaceId, id: created.value.entry.id, expectedVersion: created.value.entry.version },
  });
  assert.equal(published.ok, true, `publishEntry failed for slug "${params.slug}"`);
  if (!published.ok) throw new Error("unreachable — asserted above");
  return published.value.entry;
}

const RECIPE_FIELDS: ContentTypeFieldDef[] = [
  { name: "chef", kind: "text", required: false, queryable: false },
  { name: "prepTime", kind: "integer", required: false, queryable: false },
  { name: "vegetarian", kind: "boolean", required: false, queryable: false },
];

test("listPublishedForDisplay (memory twin): where equality filters match string, number, and boolean field values", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  await createPublishedEntry({
    repo,
    workspaceId: "ws-1",
    type: "recipe",
    contentTypeFields: RECIPE_FIELDS,
    idSeed: "recipe-ada",
    slug: "ada-bread",
    title: "Ada's Bread",
    siteFields: { chef: "Ada", prepTime: 10, vegetarian: true },
  });
  await createPublishedEntry({
    repo,
    workspaceId: "ws-1",
    type: "recipe",
    contentTypeFields: RECIPE_FIELDS,
    idSeed: "recipe-bo",
    slug: "bo-stew",
    title: "Bo's Stew",
    siteFields: { chef: "Bo", prepTime: 20, vegetarian: false },
  });

  const byString = await repo.listPublishedForDisplay({
    workspaceId: "ws-1",
    query: { type: "recipe", where: [{ field: "chef", value: "Ada" }], sort: { by: "title", dir: "asc" }, limit: 10 },
  });
  assert.deepEqual(byString.map((e) => e.slug), ["ada-bread"]);

  const byNumber = await repo.listPublishedForDisplay({
    workspaceId: "ws-1",
    query: { type: "recipe", where: [{ field: "prepTime", value: 20 }], sort: { by: "title", dir: "asc" }, limit: 10 },
  });
  assert.deepEqual(byNumber.map((e) => e.slug), ["bo-stew"]);

  const byBoolean = await repo.listPublishedForDisplay({
    workspaceId: "ws-1",
    query: { type: "recipe", where: [{ field: "vegetarian", value: true }], sort: { by: "title", dir: "asc" }, limit: 10 },
  });
  assert.deepEqual(byBoolean.map((e) => e.slug), ["ada-bread"]);
});

test("listPublishedForDisplay (memory twin): sorts by a declared field asc/desc, numerically (9 before 10), not lexically", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  for (const [idSeed, slug, prepTime] of [
    ["recipe-2min", "two-minute-noodles", 2],
    ["recipe-9min", "nine-minute-eggs", 9],
    ["recipe-10min", "ten-minute-pasta", 10],
  ] as const) {
    await createPublishedEntry({
      repo,
      workspaceId: "ws-1",
      type: "recipe",
      contentTypeFields: RECIPE_FIELDS,
      idSeed,
      slug,
      title: slug,
      siteFields: { chef: "Ada", prepTime, vegetarian: true },
    });
  }

  const ascending = await repo.listPublishedForDisplay({
    workspaceId: "ws-1",
    query: { type: "recipe", where: [], sort: { by: { field: "prepTime" }, dir: "asc" }, limit: 10 },
  });
  assert.deepEqual(
    ascending.map((e) => e.slug),
    ["two-minute-noodles", "nine-minute-eggs", "ten-minute-pasta"],
    "9 must sort before 10 — lexical string order would put 10 first"
  );

  const descending = await repo.listPublishedForDisplay({
    workspaceId: "ws-1",
    query: { type: "recipe", where: [], sort: { by: { field: "prepTime" }, dir: "desc" }, limit: 10 },
  });
  assert.deepEqual(descending.map((e) => e.slug), ["ten-minute-pasta", "nine-minute-eggs", "two-minute-noodles"]);
});

test("listPublishedForDisplay (memory twin): limit bounds the result count", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  for (const idSeed of ["r3", "r5", "r1", "r4", "r2"]) {
    await createPublishedEntry({
      repo,
      workspaceId: "ws-1",
      type: "recipe",
      contentTypeFields: RECIPE_FIELDS,
      idSeed,
      slug: `${idSeed}-slug`,
      title: idSeed,
      siteFields: { chef: "Ada", prepTime: 1, vegetarian: true },
    });
  }

  const limited = await repo.listPublishedForDisplay({
    workspaceId: "ws-1",
    query: { type: "recipe", where: [], sort: { by: "title", dir: "asc" }, limit: 2 },
  });
  assert.equal(limited.length, 2);
  assert.deepEqual(limited.map((row) => row.id), ["r1", "r2"]);
});

test("listPublishedForDisplay (memory twin): excludes drafts, trashed rows, and rows of other content types", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  await createPublishedEntry({ repo, workspaceId: "ws-2", type: "recipe", contentTypeFields: RECIPE_FIELDS, idSeed: "recipe-other", slug: "other-workspace", title: "Other workspace", siteFields: {} });
  const otherRows = await repo.listPublishedForDisplay({ workspaceId: "ws-2", query: { type: "recipe", where: [], sort: { by: "title", dir: "asc" }, limit: 10 } });
  assert.deepEqual(otherRows.map((row) => row.slug), ["other-workspace"]);

  const published = await createPublishedEntry({
    repo,
    workspaceId: "ws-1",
    type: "recipe",
    contentTypeFields: RECIPE_FIELDS,
    idSeed: "recipe-live",
    slug: "live-recipe",
    title: "Live Recipe",
    siteFields: { chef: "Ada", prepTime: 5, vegetarian: true },
  });

  // A draft: created but never published — must stay excluded.
  await createEntry({
    deps: {
      entryRepo: repo,
      contentTypeRepo: fixedContentTypeLookup("ws-1", "recipe", RECIPE_FIELDS),
      clock: { nowIso: () => "2026-09-23T00:00:00.000Z", nowMs: () => Date.parse("2026-09-23T00:00:00.000Z") },
      ids: { newId: () => "recipe-draft" },
      authorize: async () => ({ allowed: true, reason: "ok" }),
      outbox: { enqueue: async () => {} },
    },
    input: {
      actorId: "user-1",
      workspaceId: "ws-1",
      type: "recipe",
      slug: "draft-recipe",
      title: "Draft Recipe",
      fieldsJson: { ext: { site: { chef: "Ada", prepTime: 5, vegetarian: true } } },
    },
  });

  // A published-then-trashed row, via the same `findAnyById`/`saveAny` Trash seam this adapter's
  // header documents (`trash-aware-memory-repo.ts`) — the real Trash record-store adapter flips
  // `deletedAt` through this exact seam.
  const trashed = await createPublishedEntry({
    repo,
    workspaceId: "ws-1",
    type: "recipe",
    contentTypeFields: RECIPE_FIELDS,
    idSeed: "recipe-trashed",
    slug: "trashed-recipe",
    title: "Trashed Recipe",
    siteFields: { chef: "Ada", prepTime: 5, vegetarian: true },
  });
  const trashedAny = await repo.findAnyById({ workspaceId: "ws-1", id: trashed.id });
  assert.ok(trashedAny);
  await repo.saveAny({ ...trashedAny, deletedAt: "2026-09-23T01:00:00.000Z" });

  // A different content type — must never appear in a `type: "recipe"` query.
  await createPublishedEntry({
    repo,
    workspaceId: "ws-1",
    type: "article",
    contentTypeFields: [{ name: "byline", kind: "text", required: false, queryable: false }],
    idSeed: "article-live",
    slug: "live-article",
    title: "Live Article",
    siteFields: { byline: "Ada" },
  });

  const result = await repo.listPublishedForDisplay({
    workspaceId: "ws-1",
    query: { type: "recipe", where: [], sort: { by: "title", dir: "asc" }, limit: 10 },
  });
  assert.deepEqual(result.map((e) => e.slug), [published.slug], "only the live, published recipe must be returned");
});


function seed(repo: TrashAwareInMemoryEntryRepo, id: string, siteFields: Record<string, unknown> = {}, title = id) {
  return createPublishedEntry({ repo, workspaceId: "ws-1", type: "recipe", contentTypeFields: RECIPE_FIELDS, idSeed: id, slug: `${id}-slug`, title, siteFields });
}

test("memory display sorting puts missing numeric fields first asc and last desc", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  await seed(repo, "ten", { prepTime: 10 });
  await seed(repo, "two", { prepTime: 2 });
  await seed(repo, "nine", { prepTime: 9 });
  await seed(repo, "none");
  for (const [dir, expected] of [["asc", ["none", "two", "nine", "ten"]], ["desc", ["ten", "nine", "two", "none"]]] as const) {
    const rows = await repo.listPublishedForDisplay({ workspaceId: "ws-1", query: { type: "recipe", where: [], sort: { by: { field: "prepTime" }, dir }, limit: 10 } });
    assert.deepEqual(rows.map((row) => row.id), [...expected]);
  }
});

test("memory display boolean sorting distinguishes false from true in both directions", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  await seed(repo, "yes", { vegetarian: true });
  await seed(repo, "no", { vegetarian: false });
  for (const [dir, expected] of [["asc", ["no", "yes"]], ["desc", ["yes", "no"]]] as const) {
    const rows = await repo.listPublishedForDisplay({ workspaceId: "ws-1", query: { type: "recipe", where: [], sort: { by: { field: "vegetarian" }, dir }, limit: 10 } });
    assert.deepEqual(rows.map((row) => row.id), [...expected]);
  }
});

test("memory display ties use ascending id before applying the limit, even for descending sorts", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  for (const id of ["r3", "r1", "r2"]) await seed(repo, id, {}, "Same");
  for (const dir of ["asc", "desc"] as const) {
    const rows = await repo.listPublishedForDisplay({ workspaceId: "ws-1", query: { type: "recipe", where: [], sort: { by: "title", dir }, limit: 2 } });
    assert.deepEqual(rows.map((row) => row.id), ["r1", "r2"]);
  }
});

test("memory display built-in title/published/updated sorts choose conflicting exact orders", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  for (const row of [
    { id: "r-c", title: "Alpha", publishedAt: "2026-09-22T00:00:00.000Z", updatedAt: "2026-09-24T00:00:00.000Z" },
    { id: "r-a", title: "Middle", publishedAt: "2026-09-24T00:00:00.000Z", updatedAt: "2026-09-23T00:00:00.000Z" },
    { id: "r-b", title: "Zulu", publishedAt: "2026-09-23T00:00:00.000Z", updatedAt: "2026-09-22T00:00:00.000Z" },
  ]) {
    const entry = await seed(repo, row.id, {}, row.title);
    await repo.save({ ...entry, publishedAt: row.publishedAt, updatedAt: row.updatedAt });
  }
  for (const [by, asc] of [["title", ["r-c", "r-a", "r-b"]], ["published", ["r-c", "r-b", "r-a"]], ["updated", ["r-b", "r-a", "r-c"]]] as const) {
    for (const dir of ["asc", "desc"] as const) {
      const rows = await repo.listPublishedForDisplay({ workspaceId: "ws-1", query: { type: "recipe", where: [], sort: { by, dir }, limit: 2 } });
      assert.deepEqual(rows.map((row) => row.id), (dir === "asc" ? [...asc] : [...asc].reverse()).slice(0, 2), `${by} ${dir}`);
    }
  }
});

test("memory repo hides trashed holders, refuses slug reuse and ignores stale saves", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  const stale = await seed(repo, "holder");
  const trashed = { ...stale, deletedAt: "2026-09-24T00:00:00.000Z" };
  await repo.saveAny(trashed);
  assert.equal(await repo.findById({ workspaceId: "ws-1", id: stale.id }), null);
  assert.equal(await repo.findBySlug({ workspaceId: "ws-1", type: "recipe", slug: stale.slug }), null);
  await repo.save({ ...stale, title: "stale overwrite", version: stale.version + 1 });
  assert.deepEqual(await repo.findAnyById({ workspaceId: "ws-1", id: stale.id }), trashed);
  await assert.rejects(() => repo.save({ ...stale, id: "replacement" }), EntrySlugConflictError);
  assert.equal(await repo.findAnyById({ workspaceId: "ws-1", id: "replacement" }), null);
  assert.deepEqual(await repo.findAnyBySlug({ workspaceId: "ws-1", type: "recipe", slug: stale.slug }), trashed);
});

test("memory repo excludes types, trash, status and other workspaces before applying a bounded list", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();
  const widget = await seed(repo, "widget");
  await repo.save({ ...widget, type: "widget", updatedAt: "2026-09-29T00:00:00.000Z" });
  const trashed = await seed(repo, "trash");
  await repo.saveAny({ ...trashed, deletedAt: "2026-09-24T00:00:00.000Z", updatedAt: "2026-09-28T00:00:00.000Z" });
  const foreign = await seed(repo, "foreign");
  await repo.save({ ...foreign, id: "foreign-ws2", workspaceId: "ws-2", updatedAt: "2026-09-27T00:00:00.000Z" });
  const draft = await seed(repo, "draft");
  await repo.save({ ...draft, status: "draft", updatedAt: "2026-09-26T00:00:00.000Z" });
  const live = await seed(repo, "live");
  await repo.save({ ...live, updatedAt: "2026-09-25T00:00:00.000Z" });
  const rows = await repo.listByWorkspaceExcludingTypes({ workspaceId: "ws-1", excludeTypes: ["widget"], status: "published", orderBy: "updatedAt", orderDirection: "desc", limit: 1 });
  assert.deepEqual(rows.map((row) => row.id), ["live"]);
  const unrestricted = await repo.listByWorkspaceExcludingTypes({ workspaceId: "ws-1", excludeTypes: [] });
  assert.deepEqual(unrestricted.map((row) => row.id).sort(), ["draft", "foreign", "live", "widget"]);
});
