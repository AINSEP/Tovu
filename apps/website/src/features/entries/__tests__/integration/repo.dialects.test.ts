import assert from "node:assert/strict";
import { test } from "node:test";

import { sql } from "kysely";

import type { ContentTypeFieldDef } from "#src/features/content-types/index";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { createEntry, publishEntry, updateEntry } from "../../index.js";
import type { EntryRecord } from "../../index.js";
import type { CollectionListQuery } from "../../public-list.js";
import { entryRepoFor, type SqlEntryRepo } from "../../repo.js";

/**
 * @file The entry repo contract, by the same assertions on EVERY dialect (SQLite and PGlite): one
 * Kysely query body (`repo.ts`) serves both. Covers workspace scoping, the revision trail, the
 * transaction rollback, the Trash, the slug conflict, and `listPublishedForDisplay`'s `where` /
 * `sort` on numeric, boolean, text and missing fields.
 */

interface Fixture {
  repo: SqlEntryRepo;
  kernel: ContentKernel;
}

const ALLOW = async () => ({ allowed: true, reason: "ok" });

function lookup(workspaceId: string, key: string, fields: ContentTypeFieldDef[] = []) {
  return {
    findByKey: async (params: { workspaceId: string; key: string }) =>
      params.workspaceId === workspaceId && params.key === key ? { workspaceId, key, status: "active" as const, fields } : null,
  };
}

function depsFor(repo: SqlEntryRepo, idSeed: string, workspaceId = "ws-1", type = "recipe", fields: ContentTypeFieldDef[] = []) {
  return {
    entryRepo: repo,
    contentTypeRepo: lookup(workspaceId, type, fields),
    clock: { nowIso: () => "2026-09-23T00:00:00.000Z" },
    ids: { newId: () => idSeed },
    authorize: ALLOW,
    outbox: { enqueue: async () => {} },
  };
}

const RECIPE_FIELDS: ContentTypeFieldDef[] = [
  { name: "chef", kind: "text", required: false, queryable: false },
  { name: "prepTime", kind: "integer", required: false, queryable: false },
  { name: "vegetarian", kind: "boolean", required: false, queryable: false },
];

async function createPublished(params: {
  repo: SqlEntryRepo;
  idSeed: string;
  slug: string;
  title?: string;
  type?: string;
  fields?: ContentTypeFieldDef[];
  siteFields: Record<string, unknown>;
  workspaceId?: string;
}): Promise<EntryRecord> {
  const type = params.type ?? "recipe";
  const workspaceId = params.workspaceId ?? "ws-1";
  const deps = depsFor(params.repo, params.idSeed, workspaceId, type, params.fields ?? RECIPE_FIELDS);
  const created = await createEntry({
    deps,
    input: {
      actorId: "user-1",
      workspaceId,
      type,
      slug: params.slug,
      title: params.title ?? params.slug,
      fieldsJson: { ext: { site: params.siteFields } },
    },
  });
  assert.equal(created.ok, true, `createEntry failed for "${params.slug}"`);
  if (!created.ok) throw new Error("unreachable");
  const published = await publishEntry({
    deps,
    input: { actorId: "user-1", workspaceId, id: created.value.entry.id, expectedVersion: created.value.entry.version },
  });
  assert.equal(published.ok, true, `publishEntry failed for "${params.slug}"`);
  if (!published.ok) throw new Error("unreachable");
  return published.value.entry;
}

/** The Trash marker is set by the Trash, not by any chokepoint here, so the test sets it directly. */
function trash(kernel: ContentKernel, id: string): Promise<void> {
  return kernel.execute(sql`UPDATE entries SET deleted_at = '2026-09-23T01:00:00.000Z' WHERE id = ${id}`);
}

const slugs = (rows: EntryRecord[]) => rows.map((row) => row.slug);

const listQuery = (overrides: Partial<CollectionListQuery>): CollectionListQuery => ({
  type: "recipe",
  where: [],
  sort: { by: "title", dir: "asc" },
  limit: 10,
  ...overrides,
});

describeEachDialect<Fixture>(
  "EntryRepoPort",
  { tables: ["entries", "entry_revisions"], make: (kernel) => ({ repo: entryRepoFor(kernel), kernel }) },
  (make) => {
    test("workspace-scoping boundary: an entry created in ws-1 is invisible to ws-2's lookups", async () => {
      const { repo } = make();
      const created = await createEntry({
        deps: depsFor(repo, "entry-1"),
        input: { actorId: "user-1", workspaceId: "ws-1", type: "recipe", slug: "banana-bread", title: "Banana Bread", fieldsJson: { ext: { site: {} } } },
      });
      assert.equal(created.ok, true);
      assert.equal(await repo.findById({ workspaceId: "ws-2", id: "entry-1" }), null);
      assert.equal((await repo.listByWorkspace({ workspaceId: "ws-1" })).length, 1);
      assert.equal((await repo.listByWorkspace({ workspaceId: "ws-2" })).length, 0);
      const found = await repo.findBySlug({ workspaceId: "ws-1", type: "recipe", slug: "banana-bread" });
      assert.equal(found?.title, "Banana Bread");
      assert.equal(found?.status, "draft");
    });

    test("create + update + publish each append a real entry_revisions row", async () => {
      const { repo, kernel } = make();
      const deps = depsFor(repo, "entry-1");
      await createEntry({
        deps,
        input: { actorId: "user-1", workspaceId: "ws-1", type: "recipe", slug: "banana-bread", title: "Banana Bread", fieldsJson: { ext: { site: {} } } },
      });
      await updateEntry({ deps, input: { actorId: "user-1", workspaceId: "ws-1", id: "entry-1", title: "Banana Bread v2", expectedVersion: 1 } });
      await publishEntry({ deps, input: { actorId: "user-1", workspaceId: "ws-1", id: "entry-1", expectedVersion: 2 } });
      const rows = await kernel.query<{ op: string; entry_id: string; workspace_id: string }>(
        sql`SELECT op, entry_id, workspace_id FROM entry_revisions ORDER BY seq ASC`
      );
      assert.deepEqual(rows.map((row) => row.op), ["create", "update", "publish"]);
      assert.ok(rows.every((row) => row.entry_id === "entry-1" && row.workspace_id === "ws-1"));
    });

    test("a throwing onWritten hook rolls back the WHOLE transaction (row and revision), not just itself", async () => {
      const { repo, kernel } = make();
      const deps = depsFor(repo, "entry-1");
      await createEntry({
        deps,
        input: { actorId: "user-1", workspaceId: "ws-1", type: "recipe", slug: "banana-bread", title: "Banana Bread", fieldsJson: { ext: { site: {} } } },
      });
      await assert.rejects(
        updateEntry({
          deps: {
            ...deps,
            onWritten: async () => {
              throw new Error("simulated onWritten failure");
            },
          },
          input: { actorId: "user-1", workspaceId: "ws-1", id: "entry-1", title: "Should Never Persist", expectedVersion: 1 },
        }),
        /simulated onWritten failure/
      );
      const after = await repo.findById({ workspaceId: "ws-1", id: "entry-1" });
      assert.equal(after?.title, "Banana Bread");
      assert.equal(after?.version, 1);
      const rows = await kernel.query<{ op: string }>(sql`SELECT op FROM entry_revisions WHERE entry_id = 'entry-1'`);
      assert.deepEqual(rows.map((row) => row.op), ["create"]);
    });

    test("Trash: reads hide a trashed row, findAny* see it, save never revives it, its slug blocks a new entry", async () => {
      const { repo, kernel } = make();
      const entry = await createPublished({ repo, idSeed: "e-1", slug: "held", siteFields: {} });
      await trash(kernel, entry.id);

      assert.equal(await repo.findById({ workspaceId: "ws-1", id: entry.id }), null);
      assert.equal(await repo.findBySlug({ workspaceId: "ws-1", type: "recipe", slug: "held" }), null);
      assert.deepEqual(await repo.listByWorkspace({ workspaceId: "ws-1" }), []);
      assert.equal((await repo.findAnyById({ workspaceId: "ws-1", id: entry.id }))?.deletedAt, "2026-09-23T01:00:00.000Z");
      assert.equal((await repo.findAnyBySlug({ workspaceId: "ws-1", type: "recipe", slug: "held" }))?.id, entry.id);

      await repo.save({ ...entry, title: "Stale save" });
      assert.equal((await repo.findAnyById({ workspaceId: "ws-1", id: entry.id }))?.title, entry.title);

      await assert.rejects(repo.save({ ...entry, id: "e-2", title: "Other" }), /in the Trash/);
    });

    test("listByWorkspaceExcludingTypes filters the excluded types in SQL, before the limit", async () => {
      const { repo } = make();
      await createPublished({ repo, idSeed: "r-1", slug: "soup", siteFields: {} });
      await createPublished({ repo, idSeed: "w-1", slug: "widget-a", type: "widget", fields: [], siteFields: {} });
      await createPublished({ repo, idSeed: "w-2", slug: "widget-b", type: "widget", fields: [], siteFields: {} });
      const rows = await repo.listByWorkspaceExcludingTypes({ workspaceId: "ws-1", excludeTypes: ["widget"], limit: 1 });
      assert.deepEqual(slugs(rows), ["soup"]);
      assert.equal((await repo.listByWorkspaceExcludingTypes({ workspaceId: "ws-1", excludeTypes: [] })).length, 3);
    });

    test("listByWorkspace orders by updatedAt in both directions and honours status and limit", async () => {
      const { repo } = make();
      await createPublished({ repo, idSeed: "r-1", slug: "one", siteFields: {} });
      await createPublished({ repo, idSeed: "r-2", slug: "two", siteFields: {} });
      const early = await repo.findById({ workspaceId: "ws-1", id: "r-1" });
      await repo.save({ ...early!, updatedAt: "2026-09-24T00:00:00.000Z" });
      assert.deepEqual(slugs(await repo.listByWorkspace({ workspaceId: "ws-1", orderBy: "updatedAt", orderDirection: "desc" })), ["one", "two"]);
      assert.deepEqual(slugs(await repo.listByWorkspace({ workspaceId: "ws-1", orderBy: "updatedAt", orderDirection: "asc", limit: 1 })), ["two"]);
      assert.deepEqual(await repo.listByWorkspace({ workspaceId: "ws-1", status: "draft" }), []);
    });

    test("listPublishedForDisplay: where equality matches string, number and boolean field values", async () => {
      const { repo } = make();
      await createPublished({ repo, idSeed: "r-ada", slug: "ada-bread", siteFields: { chef: "Ada", prepTime: 10, vegetarian: true } });
      await createPublished({ repo, idSeed: "r-bo", slug: "bo-stew", siteFields: { chef: "Bo", prepTime: 20, vegetarian: false } });
      const list = (field: string, value: string | number | boolean) =>
        repo.listPublishedForDisplay({ workspaceId: "ws-1", query: listQuery({ where: [{ field, value }] }) });
      assert.deepEqual(slugs(await list("chef", "Ada")), ["ada-bread"]);
      assert.deepEqual(slugs(await list("prepTime", 20)), ["bo-stew"]);
      assert.deepEqual(slugs(await list("vegetarian", true)), ["ada-bread"]);
      assert.deepEqual(slugs(await list("vegetarian", false)), ["bo-stew"]);
    });

    test("listPublishedForDisplay: sorts a numeric field numerically (2, 9, 10), a missing field first asc / last desc", async () => {
      const { repo } = make();
      await createPublished({ repo, idSeed: "r-2", slug: "two", siteFields: { prepTime: 2 } });
      await createPublished({ repo, idSeed: "r-9", slug: "nine", siteFields: { prepTime: 9 } });
      await createPublished({ repo, idSeed: "r-10", slug: "ten", siteFields: { prepTime: 10 } });
      await createPublished({ repo, idSeed: "r-none", slug: "none", siteFields: {} });
      const sorted = (dir: "asc" | "desc") =>
        repo.listPublishedForDisplay({ workspaceId: "ws-1", query: listQuery({ sort: { by: { field: "prepTime" }, dir } }) });
      assert.deepEqual(slugs(await sorted("asc")), ["none", "two", "nine", "ten"]);
      assert.deepEqual(slugs(await sorted("desc")), ["ten", "nine", "two", "none"]);
    });

    test("listPublishedForDisplay: sorts a boolean field false before true", async () => {
      const { repo } = make();
      await createPublished({ repo, idSeed: "r-t", slug: "yes", siteFields: { vegetarian: true } });
      await createPublished({ repo, idSeed: "r-f", slug: "no", siteFields: { vegetarian: false } });
      const sorted = (dir: "asc" | "desc") =>
        repo.listPublishedForDisplay({ workspaceId: "ws-1", query: listQuery({ sort: { by: { field: "vegetarian" }, dir } }) });
      assert.deepEqual(slugs(await sorted("asc")), ["no", "yes"]);
      assert.deepEqual(slugs(await sorted("desc")), ["yes", "no"]);
    });

    test("listPublishedForDisplay: the built-in sort keys, ties broken by id, and the limit", async () => {
      const { repo } = make();
      for (const id of ["r3", "r1", "r2", "r4", "r5"]) {
        await createPublished({ repo, idSeed: id, slug: `${id}-slug`, title: "Same", siteFields: {} });
      }
      const rows = await repo.listPublishedForDisplay({ workspaceId: "ws-1", query: listQuery({ limit: 3 }) });
      assert.deepEqual(rows.map((row) => row.id), ["r1", "r2", "r3"]);
      const byPublished = await repo.listPublishedForDisplay({ workspaceId: "ws-1", query: listQuery({ sort: { by: "published", dir: "desc" }, limit: 2 }) });
      assert.equal(byPublished.length, 2);
      const byUpdated = await repo.listPublishedForDisplay({ workspaceId: "ws-1", query: listQuery({ sort: { by: "updated", dir: "asc" } }) });
      assert.equal(byUpdated.length, 5);
    });

    test("listPublishedForDisplay: built-in sort columns and directions choose exact conflicting orders", async () => {
      const { repo } = make();
      const rows = [
        { id: "r-c", title: "Alpha", publishedAt: "2026-09-22T00:00:00.000Z", updatedAt: "2026-09-24T00:00:00.000Z" },
        { id: "r-a", title: "Middle", publishedAt: "2026-09-24T00:00:00.000Z", updatedAt: "2026-09-23T00:00:00.000Z" },
        { id: "r-b", title: "Zulu", publishedAt: "2026-09-23T00:00:00.000Z", updatedAt: "2026-09-22T00:00:00.000Z" },
      ];
      for (const row of rows) {
        const entry = await createPublished({ repo, idSeed: row.id, slug: row.id, title: row.title, siteFields: {} });
        await repo.save({ ...entry, publishedAt: row.publishedAt, updatedAt: row.updatedAt });
      }
      for (const [by, asc] of [["title", ["r-c", "r-a", "r-b"]], ["published", ["r-c", "r-b", "r-a"]], ["updated", ["r-b", "r-a", "r-c"]]] as const) {
        for (const dir of ["asc", "desc"] as const) {
          const result = await repo.listPublishedForDisplay({ workspaceId: "ws-1", query: listQuery({ sort: { by, dir } }) });
          assert.deepEqual(result.map((row) => row.id), dir === "asc" ? [...asc] : [...asc].reverse(), `${by} ${dir}`);
        }
      }
      const limited = await repo.listPublishedForDisplay({ workspaceId: "ws-1", query: listQuery({ sort: { by: "published", dir: "desc" }, limit: 2 }) });
      assert.deepEqual(limited.map((row) => row.id), ["r-a", "r-b"]);
    });

    test("listPublishedForDisplay: excludes drafts, trashed rows and other content types", async () => {
      const { repo, kernel } = make();
      const live = await createPublished({ repo, idSeed: "recipe-live", slug: "live-recipe", siteFields: {} });
      await createPublished({ repo, workspaceId: "ws-2", idSeed: "recipe-other", slug: "other-workspace", siteFields: {} });
      await createEntry({
        deps: depsFor(repo, "recipe-draft", "ws-1", "recipe", RECIPE_FIELDS),
        input: { actorId: "user-1", workspaceId: "ws-1", type: "recipe", slug: "draft-recipe", title: "Draft", fieldsJson: { ext: { site: {} } } },
      });
      const trashed = await createPublished({ repo, idSeed: "recipe-trashed", slug: "trashed-recipe", siteFields: {} });
      await trash(kernel, trashed.id);
      await createPublished({ repo, idSeed: "article-live", slug: "live-article", type: "article", fields: [], siteFields: {} });
      const rows = await repo.listPublishedForDisplay({ workspaceId: "ws-1", query: listQuery({}) });
      assert.deepEqual(slugs(rows), [live.slug]);
      assert.deepEqual(slugs(await repo.listPublishedForDisplay({ workspaceId: "ws-2", query: listQuery({}) })), ["other-workspace"]);
    });

    test("listPublishedForDisplay: a where value binds as a parameter — an apostrophe round-trips", async () => {
      const { repo } = make();
      await createPublished({ repo, idSeed: "r-ob", slug: "obrien-stew", siteFields: { chef: "O'Brien" } });
      const rows = await repo.listPublishedForDisplay({ workspaceId: "ws-1", query: listQuery({ where: [{ field: "chef", value: "O'Brien" }] }) });
      assert.deepEqual(slugs(rows), ["obrien-stew"]);
    });

    test("listPublishedForDisplay: an injection-shaped field name matches nothing and sorts as nothing, without throwing", async () => {
      const { repo } = make();
      await createPublished({ repo, idSeed: "r-a", slug: "a", siteFields: { chef: "Ada" } });
      await createPublished({ repo, idSeed: "r-b", slug: "b", siteFields: { chef: "Bo" } });
      const evil = "chef' OR '1'='1";
      assert.deepEqual(await repo.listPublishedForDisplay({ workspaceId: "ws-1", query: listQuery({ where: [{ field: evil, value: "x" }] }) }), []);
      const sorted = await repo.listPublishedForDisplay({ workspaceId: "ws-1", query: listQuery({ sort: { by: { field: evil }, dir: "desc" } }) });
      assert.deepEqual(slugs(sorted), ["a", "b"], "no usable sort key: the id tiebreak decides");
    });
  }
);
