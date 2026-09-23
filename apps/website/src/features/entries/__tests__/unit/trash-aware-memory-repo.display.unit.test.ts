import assert from "node:assert/strict";
import test from "node:test";

import type { ContentTypeFieldDef } from "#src/features/content-types/index";

import { createEntry, publishEntry } from "../../index.js";
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
    clock: { nowIso: () => "2026-09-23T00:00:00.000Z" },
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
  for (const idSeed of ["r1", "r2", "r3", "r4", "r5"]) {
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
});

test("listPublishedForDisplay (memory twin): excludes drafts, trashed rows, and rows of other content types", async () => {
  const repo = new TrashAwareInMemoryEntryRepo();

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
      clock: { nowIso: () => "2026-09-23T00:00:00.000Z" },
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
