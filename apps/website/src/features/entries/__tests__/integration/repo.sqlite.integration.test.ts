import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ContentTypeFieldDef } from "#src/features/content-types/index";
import { eq } from "drizzle-orm";

import { entries } from "#src/platform/db/schema.sqlite";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import type { CollectionListQuery } from "../../public-list.js";
import { SqliteEntryRepo } from "../../repo.sqlite.js";
import { createEntry, publishEntry, updateEntry } from "../../index.js";
import type { EntryRecord } from "../../index.js";

/**
 * @file Real SQLite persistence for `features/entries` (this dispatch). Mirrors
 * `features/content-types/__tests__/integration/repo.sqlite.integration.test.ts`'s pattern and
 * rationale — see that file's header.
 */

function alwaysAllow() {
  return async () => ({ allowed: true, reason: "ok" });
}

function openTempContentDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "entries-sqlite-"));
  const filePath = path.join(tmpDir, "content.db");
  const db = openContentDb(filePath);
  return { db, filePath, tmpDir };
}

/** A fixed `ContentTypeLookupPort` double, standing in for `features/content-types`' real repo
 * (this test exercises `entries`' own persistence in isolation, per that package's own "no
 * runtime dependency on content-types' write path" architectural boundary). `fields` defaults to
 * `[]` for the pre-existing tests above; C2's `listPublishedForDisplay` tests below pass declared
 * fields so `createEntry`'s field-validation accepts a non-empty `fieldsJson.ext.site`. */
function fixedContentTypeLookup(workspaceId: string, key: string, fields: ContentTypeFieldDef[] = []) {
  return {
    findByKey: async (params: { workspaceId: string; key: string }) =>
      params.workspaceId === workspaceId && params.key === key
        ? { workspaceId, key, status: "active" as const, fields }
        : null,
  };
}

/**
 * C2 test helper: creates and publishes one entry through the real `createEntry`/`publishEntry`
 * chokepoints (never a direct `repo.save()`), so every `listPublishedForDisplay` test below
 * exercises the same write path production code uses. Each call needs its own unique `id` (via
 * `idSeed`) since a fresh `deps.ids.newId` closure is built per call.
 * @complexity O(1) plus one `createEntry` and one `publishEntry` call.
 */
async function createPublishedEntry(params: {
  repo: SqliteEntryRepo;
  workspaceId: string;
  type: string;
  contentTypeFields: ContentTypeFieldDef[];
  idSeed: string;
  slug: string;
  title: string;
  siteFields: Record<string, unknown>;
  nowIso?: string;
}): Promise<EntryRecord> {
  const deps = {
    entryRepo: params.repo,
    contentTypeRepo: fixedContentTypeLookup(params.workspaceId, params.type, params.contentTypeFields),
    clock: { nowIso: () => params.nowIso ?? "2026-09-23T00:00:00.000Z" },
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

/** The `recipe` content type's declared fields shared by every `listPublishedForDisplay` test
 * below: one of each scalar kind the `where`/`sort` tests need. */
const RECIPE_FIELDS: ContentTypeFieldDef[] = [
  { name: "chef", kind: "text", required: false, queryable: false },
  { name: "prepTime", kind: "integer", required: false, queryable: false },
  { name: "vegetarian", kind: "boolean", required: false, queryable: false },
];

test("create -> restart-simulated (fresh repo instance against the same file) -> data still there", async () => {
  const { db, filePath, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteEntryRepo(db);
    const clock = { nowIso: () => "2026-07-15T00:00:00.000Z" };
    let idCounter = 0;

    const created = await createEntry({
      deps: {
        entryRepo: repo,
        contentTypeRepo: fixedContentTypeLookup("ws-1", "recipe"),
        clock,
        ids: { newId: () => `entry-${++idCounter}` },
        authorize: alwaysAllow(),
        outbox: { enqueue: async () => {} },
      },
      input: { actorId: "user-1", workspaceId: "ws-1", type: "recipe", slug: "banana-bread", title: "Banana Bread", fieldsJson: { ext: { site: {} } } },
    });
    assert.equal(created.ok, true);

    const dbAfterRestart = openContentDb(filePath);
    const repoAfterRestart = new SqliteEntryRepo(dbAfterRestart);
    const found = await repoAfterRestart.findBySlug({ workspaceId: "ws-1", type: "recipe", slug: "banana-bread" });
    assert.ok(found);
    assert.equal(found?.title, "Banana Bread");
    assert.equal(found?.status, "draft");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("workspace-scoping boundary: an entry created in ws-1 is invisible to ws-2's lookups", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteEntryRepo(db);
    const clock = { nowIso: () => "2026-07-15T00:00:00.000Z" };
    const deps = {
      entryRepo: repo,
      contentTypeRepo: fixedContentTypeLookup("ws-1", "recipe"),
      clock,
      ids: { newId: () => "entry-1" },
      authorize: alwaysAllow(),
      outbox: { enqueue: async () => {} },
    };

    const created = await createEntry({ deps, input: { actorId: "user-1", workspaceId: "ws-1", type: "recipe", slug: "banana-bread", title: "Banana Bread", fieldsJson: { ext: { site: {} } } } });
    assert.equal(created.ok, true);
    const entryId = created.ok ? created.value.entry.id : "";

    const crossWorkspace = await repo.findById({ workspaceId: "ws-2", id: entryId });
    assert.equal(crossWorkspace, null, "the same entry id in a different workspace must not resolve");

    const ws1List = await repo.listByWorkspace({ workspaceId: "ws-1" });
    const ws2List = await repo.listByWorkspace({ workspaceId: "ws-2" });
    assert.equal(ws1List.length, 1);
    assert.equal(ws2List.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("revision/audit trail actually persists: create + update + publish each append a real entry_revisions row", async () => {
  const { db, filePath, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteEntryRepo(db);
    const clock = { nowIso: () => "2026-07-15T00:00:00.000Z" };
    const deps = {
      entryRepo: repo,
      contentTypeRepo: fixedContentTypeLookup("ws-1", "recipe"),
      clock,
      ids: { newId: () => "entry-1" },
      authorize: alwaysAllow(),
      outbox: { enqueue: async () => {} },
    };

    const created = await createEntry({ deps, input: { actorId: "user-1", workspaceId: "ws-1", type: "recipe", slug: "banana-bread", title: "Banana Bread", fieldsJson: { ext: { site: {} } } } });
    assert.equal(created.ok, true);
    const entryId = created.ok ? created.value.entry.id : "";

    await updateEntry({ deps, input: { actorId: "user-1", workspaceId: "ws-1", id: entryId, title: "Banana Bread v2", expectedVersion: 1 } });
    await publishEntry({ deps, input: { actorId: "user-1", workspaceId: "ws-1", id: entryId, expectedVersion: 2 } });

    const dbAfterRestart = openContentDb(filePath);
    const rows = dbAfterRestart.$client.prepare("SELECT op, entry_id, workspace_id FROM entry_revisions ORDER BY seq ASC").all() as Array<{
      op: string;
      entry_id: string;
      workspace_id: string;
    }>;
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((r) => r.op),
      ["create", "update", "publish"]
    );
    assert.ok(rows.every((r) => r.entry_id === entryId && r.workspace_id === "ws-1"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Fable adversarial-review fix (2026-07-21, Finding C/P10a): a throwing onWritten hook rolls back the ENTIRE transaction, not just itself — SqliteEntryRepo's real BEGIN IMMEDIATE/COMMIT/ROLLBACK, not the in-memory adapter's no-op transaction() passthrough", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteEntryRepo(db);
    const clock = { nowIso: () => "2026-07-21T00:00:00.000Z" };
    const baseDeps = {
      entryRepo: repo,
      contentTypeRepo: fixedContentTypeLookup("ws-1", "recipe"),
      clock,
      authorize: alwaysAllow(),
      outbox: { enqueue: async () => {} },
    };

    const created = await createEntry({
      deps: { ...baseDeps, ids: { newId: () => "entry-1" } },
      input: { actorId: "user-1", workspaceId: "ws-1", type: "recipe", slug: "banana-bread", title: "Banana Bread", fieldsJson: { ext: { site: {} } } },
    });
    assert.equal(created.ok, true);
    const entryId = created.ok ? created.value.entry.id : "";

    await assert.rejects(
      updateEntry({
        deps: {
          ...baseDeps,
          onWritten: async () => {
            throw new Error("simulated onWritten failure — mirrors widgets' entry_refs extraction hook throwing mid-transaction");
          },
        },
        input: { actorId: "user-1", workspaceId: "ws-1", id: entryId, title: "Should Never Persist", expectedVersion: 1 },
      }),
      /simulated onWritten failure/
    );

    const after = await repo.findById({ workspaceId: "ws-1", id: entryId });
    assert.equal(after?.title, "Banana Bread", "the title change must be rolled back along with the failed onWritten hook — same transaction, not swallowed");
    assert.equal(after?.version, 1, "version must not have advanced — proves save() itself was rolled back, not just skipped going forward");

    const revisionRows = db.$client.prepare("SELECT op FROM entry_revisions WHERE entry_id = ?").all(entryId) as Array<{ op: string }>;
    assert.deepEqual(revisionRows.map((r) => r.op), ["create"], "the update's revision row must also be rolled back, not left as a dangling audit entry for a write that never took effect");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------------------------------------
 * C2: `listPublishedForDisplay` (plan lines 149-167)
 * ------------------------------------------------------------------------------------------------ */

test("listPublishedForDisplay: where equality filters match string, number, and boolean field values", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteEntryRepo(db);
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
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("listPublishedForDisplay: sorts by a declared field asc/desc, numerically (9 before 10), not lexically", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteEntryRepo(db);
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
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("listPublishedForDisplay: limit bounds the result count", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteEntryRepo(db);
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
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("listPublishedForDisplay: excludes drafts, trashed rows, and rows of other content types", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteEntryRepo(db);

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

    // A published-then-trashed row: `deletedAt` is this package's own Trash marker (see
    // `repo.sqlite.ts`'s file header) — not exposed through any write chokepoint here, so the test
    // sets it directly, the same as `content_types`'/`widgets`' own Trash adapters would.
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
    db.update(entries).set({ deletedAt: "2026-09-23T01:00:00.000Z" }).where(eq(entries.id, trashed.id)).run();

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
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("listPublishedForDisplay: a where field's value binds as a SQL parameter — an apostrophe round-trips instead of breaking the query", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteEntryRepo(db);
    await createPublishedEntry({
      repo,
      workspaceId: "ws-1",
      type: "recipe",
      contentTypeFields: RECIPE_FIELDS,
      idSeed: "recipe-obrien",
      slug: "obrien-stew",
      title: "O'Brien's Stew",
      siteFields: { chef: "O'Brien", prepTime: 5, vegetarian: true },
    });

    const result = await repo.listPublishedForDisplay({
      workspaceId: "ws-1",
      query: { type: "recipe", where: [{ field: "chef", value: "O'Brien" }], sort: { by: "title", dir: "asc" }, limit: 10 },
    });
    assert.deepEqual(result.map((e) => e.slug), ["obrien-stew"]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("listPublishedForDisplay: an injection-shaped where field name is bound as a parameter, not string-interpolated into the SQL text", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteEntryRepo(db);
    await createPublishedEntry({
      repo,
      workspaceId: "ws-1",
      type: "recipe",
      contentTypeFields: RECIPE_FIELDS,
      idSeed: "recipe-ada2",
      slug: "ada-bread-2",
      title: "Ada's Bread",
      siteFields: { chef: "Ada", prepTime: 5, vegetarian: true },
    });

    // C1 already rejects a field name shaped like this before it ever reaches this repo. This
    // proves the defense-in-depth property at the SQL layer itself: even given a field name an
    // attacker fully controls, it is bound as one `json_extract` path parameter, so it is read as
    // a literal (non-matching) JSON pointer rather than altering the query. A naive
    // string-interpolation implementation would either throw a SQL syntax error here or, worse,
    // match every row.
    const query: CollectionListQuery = {
      type: "recipe",
      where: [{ field: "chef' OR '1'='1", value: "anything" }],
      sort: { by: "title", dir: "asc" },
      limit: 10,
    };
    const result = await repo.listPublishedForDisplay({ workspaceId: "ws-1", query });
    assert.deepEqual(result, [], "an injected field name must be a literal non-matching path, never concatenated into the query text");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
