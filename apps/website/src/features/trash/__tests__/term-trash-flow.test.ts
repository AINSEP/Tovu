import assert from "node:assert/strict";
import test from "node:test";

import type { OutboxPort } from "@jini-ai/cms/core";
import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";
import * as schema from "#src/platform/db/schema";
import {
  SqliteEntryTermRepo,
  SqliteTaxonomyRepo,
  SqliteTaxonomyRevisionRepo,
  SqliteTermRepo,
} from "#src/features/taxonomy/repo.sqlite";
import { createTaxonomyPurgeFollowUp, createTermPurgeFollowUp, type TaxonomyEventOutboxPort } from "#src/features/taxonomy/taxonomy-trash-follow-ups";
import { SqlitePostRepo } from "#src/features/post/repo.sqlite";
import { updatePost, type PostRecord } from "#src/features/post/index";

import { createSqliteTrashDb } from "../db-port.sqlite.js";
import { withFollowUps } from "../follow-ups.js";
import { moveToTrash, type MoveToTrashOutcome } from "../move-to-trash.js";
import { buildTrashRegistry, type TrashRegistry } from "../registry.js";
import { createTableTrashAdapter, type TrashedItemsRef } from "../table-adapter.js";
import { createContentDbTransactionRunner, SqliteTrashRepo } from "../repo.sqlite.js";
import { createTrashService } from "../write-service.js";
import type { TrashAdapter, TrashEntityType, TrashPort } from "../index.js";

/**
 * @file A tag/category (`term`) and its owning taxonomy moved to the Trash through the generic path
 * (`moveToTrash`) — plan §2 T6, owner decision 5. Real SQLite, real taxonomy repos, the real
 * `updatePost` save path: nothing here is a double of the thing under test. Modeled directly on
 * `form-trash-flow.test.ts` — does not depend on the composition lock (`deps.ts`/`app.ts`) at all;
 * this harness wires the same purge follow-ups (`taxonomy-trash-follow-ups.ts`) `deps.ts` wires,
 * built here so the test proves the WIRING end to end, not just the hooks' own already-certified
 * pure-fake unit tests (`taxonomy-trash-follow-ups.test.ts`).
 */

const WS = "workspace-1";
const AT = "2026-09-21T12:00:00.000Z";
const ACTOR = { principalId: "admin-1", pluginId: null };

interface Harness {
  db: ContentDb;
  registry: TrashRegistry;
  trash: TrashPort;
  taxonomies: SqliteTaxonomyRepo;
  terms: SqliteTermRepo;
  entryTerms: SqliteEntryTermRepo;
  posts: SqlitePostRepo;
  outbox: TaxonomyEventOutboxPort & { events: Record<string, unknown>[] };
}

function recordingOutbox(): TaxonomyEventOutboxPort & { events: Record<string, unknown>[] } {
  const events: Record<string, unknown>[] = [];
  return { events, enqueue: async (event) => void events.push(event) };
}

function harness(): Harness {
  const db = openContentDb(":memory:");
  db.$client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(WS, WS, WS, "2026-01-01T00:00:00.000Z");

  const registry = buildTrashRegistry({ schema });
  const trashDb = createSqliteTrashDb({ db });
  const trashedItems: TrashedItemsRef = {
    table: schema.trashedItems,
    workspaceId: schema.trashedItems.workspaceId,
    entityType: schema.trashedItems.entityType,
    entityId: schema.trashedItems.entityId,
  };

  const taxonomyRepo = new SqliteTaxonomyRepo({ db, workspaceId: WS });
  const termRepo = new SqliteTermRepo({ db, workspaceId: WS });
  const entryTermRepo = new SqliteEntryTermRepo({ db, workspaceId: WS });
  const revisions = new SqliteTaxonomyRevisionRepo({ db, workspaceId: WS });
  const outbox = recordingOutbox();
  const trashRepo = new SqliteTrashRepo(db.$client);
  const clock = { nowIso: () => AT };

  // Same wiring `deps.ts` performs for `term`/`taxonomy` (T6 item 5): the generic table adapter is
  // wrapped with the purge-only follow-ups so a purge also writes the `taxonomy_revisions` row and
  // the outbox event `deleteTerm`/`deleteTaxonomy` used to write alongside their own hard delete.
  const adapters = new Map<string, TrashAdapter>(
    [...registry.values()].map((entry) => {
      const base = createTableTrashAdapter({ entry, db: trashDb, trashedItems });
      if (entry.entityType === "term") {
        return [
          entry.entityType,
          withFollowUps({
            adapter: base,
            hooks: createTermPurgeFollowUp({ termRepo, trash: trashRepo, revisions, outbox, clock }),
          }),
        ];
      }
      if (entry.entityType === "taxonomy") {
        return [
          entry.entityType,
          withFollowUps({
            adapter: base,
            hooks: createTaxonomyPurgeFollowUp({ termRepo, trash: trashRepo, revisions, outbox, clock }),
          }),
        ];
      }
      return [entry.entityType, base];
    })
  );

  let seq = 0;
  const trash = createTrashService({
    repo: trashRepo,
    adapters,
    idGen: { next: () => `trash-${(seq += 1)}` },
    transaction: createContentDbTransactionRunner(db.$client),
  });

  return {
    db,
    registry,
    trash,
    taxonomies: taxonomyRepo,
    terms: termRepo,
    entryTerms: entryTermRepo,
    posts: new SqlitePostRepo(db),
    outbox,
  };
}

async function seedTaxonomy(h: Harness, id: string, name: string, hierarchical = false): Promise<void> {
  await h.taxonomies.insert({ id, name, hierarchical, status: "active", updatedAt: AT, version: 1 });
}

async function seedTerm(h: Harness, id: string, taxonomyId: string, name: string, parentId: string | null = null): Promise<void> {
  await h.terms.insert({ id, taxonomyId, parentId, name, status: "active", updatedAt: AT, version: 1 });
}

async function assignTerm(h: Harness, termId: string, contentId: string): Promise<void> {
  await h.entryTerms.upsert({ contentType: "post", contentId, termId, addedAt: AT });
}

/** A minimal but real `posts` row, saved through the real `SqlitePostRepo` — the exact set of
 *  columns `posts.ts:1195` NOT NULLs, confirmed against `post.revisions.test.ts`'s own SqlitePostRepo
 *  seed shape rather than assumed. */
async function seedPost(h: Harness, id: string): Promise<void> {
  const record: PostRecord = {
    id,
    workspaceId: WS,
    title: `Post ${id}`,
    slug: `slug-${id}`,
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "draft",
    kind: "post",
    updatedAt: AT,
    version: 1,
  };
  await h.posts.save(record);
}

function entryTermCount(h: Harness, termId: string, contentId: string): number {
  return (
    h.db.$client
      .prepare(`SELECT COUNT(*) AS n FROM entry_terms WHERE term_id = ? AND content_id = ?`)
      .get(termId, contentId) as { n: number }
  ).n;
}

function termRowCount(h: Harness, termId: string): number {
  return (h.db.$client.prepare(`SELECT COUNT(*) AS n FROM terms WHERE id = ?`).get(termId) as { n: number }).n;
}

function taxonomyRevisionCount(h: Harness, taxonomyId: string): number {
  return (
    h.db.$client
      .prepare(`SELECT COUNT(*) AS n FROM taxonomy_revisions WHERE taxonomy_id = ?`)
      .get(taxonomyId) as { n: number }
  ).n;
}

const noopOutbox: OutboxPort = {
  enqueue: async () => {},
  claimPending: async () => [],
  markDelivered: async () => {},
  markFailed: async () => {},
};

async function trashItem(h: Harness, entityType: TrashEntityType, entityId: string): Promise<MoveToTrashOutcome> {
  return moveToTrash(
    { workspaceId: WS, entityType, entityId, actor: ACTOR },
    {
      registry: h.registry,
      trash: h.trash,
      db: createSqliteTrashDb({ db: h.db }),
      authorize: async () => ({ allowed: true, reason: "matched" }),
      clock: { nowIso: () => AT },
    }
  );
}

async function trashItemId(h: Harness, entityId: string): Promise<string> {
  const page = await h.trash.list({ workspaceId: WS, now: AT, limit: 50 });
  const item = page.items.find((row) => row.entityId === entityId);
  assert.ok(item, `a Trash row for '${entityId}' must exist`);
  return item.id;
}

test("a trashed tag disappears from the taxonomy's term list and from a post's assigned-term read, but the assignment survives saving the post (decision 5's key regression)", async () => {
  const h = harness();
  await seedTaxonomy(h, "tax-1", "Tags");
  await seedTerm(h, "red", "tax-1", "Red");
  await seedTerm(h, "blue", "tax-1", "Blue");
  await seedPost(h, "post-1");
  await assignTerm(h, "red", "post-1");
  await assignTerm(h, "blue", "post-1");

  const outcome = await trashItem(h, "term", "red");
  assert.deepEqual(outcome, { ok: true, version: 2 });

  assert.deepEqual(
    (await h.terms.listByTaxonomy({ taxonomyId: "tax-1" })).map((t) => t.id),
    ["blue"],
    "a trashed term drops out of its taxonomy's own list"
  );
  assert.deepEqual(
    (await h.entryTerms.listForContent({ contentType: "post", contentId: "post-1" })).map((t) => t.termId),
    ["blue"],
    "the render-facing read hides the trashed term too"
  );
  assert.equal(entryTermCount(h, "red", "post-1"), 1, "the entry_terms row itself is untouched by trashing");

  // The regression this test exists to catch: `updatePost` must never touch `entry_terms`, so saving
  // the post while one of its terms is trashed must not drop that assignment.
  await updatePost({
    deps: { repo: h.posts, clock: { nowIso: () => "2026-09-21T13:00:00.000Z" }, outbox: noopOutbox },
    input: { workspaceId: WS, id: "post-1", title: "Post 1 (edited)", slug: "slug-post-1", bodyJson: { type: "doc", content: [] }, status: "draft" },
  });
  assert.equal(entryTermCount(h, "red", "post-1"), 1, "saving the post must not drop the trashed term's assignment");

  const restored = await h.trash.restore({ workspaceId: WS, entityType: "term", entityId: "red", at: AT });
  assert.equal(restored, "restored");
  assert.deepEqual(
    (await h.entryTerms.listForContent({ contentType: "post", contentId: "post-1" })).map((t) => t.termId).sort(),
    ["blue", "red"],
    "restore brings the term back onto the post's read"
  );
});

test("trashing a taxonomy hides every one of its member terms (hiddenWithParent), and restoring the taxonomy brings them all back", async () => {
  const h = harness();
  await seedTaxonomy(h, "tax-2", "Colors");
  await seedTerm(h, "cyan", "tax-2", "Cyan");
  await seedPost(h, "post-2");
  await assignTerm(h, "cyan", "post-2");

  const outcome = await trashItem(h, "taxonomy", "tax-2");
  assert.deepEqual(outcome, { ok: true, version: 2 });

  assert.deepEqual(await h.terms.listByTaxonomy({ taxonomyId: "tax-2" }), [], "member terms read as hidden with no second write on them");
  assert.deepEqual(await h.entryTerms.listForContent({ contentType: "post", contentId: "post-2" }), []);
  assert.equal(termRowCount(h, "cyan"), 1, "the member term's own row is never touched by trashing the taxonomy");

  const restored = await h.trash.restore({ workspaceId: WS, entityType: "taxonomy", entityId: "tax-2", at: AT });
  assert.equal(restored, "restored");
  assert.deepEqual(
    (await h.terms.listByTaxonomy({ taxonomyId: "tax-2" })).map((t) => t.id),
    ["cyan"]
  );
  assert.deepEqual(
    (await h.entryTerms.listForContent({ contentType: "post", contentId: "post-2" })).map((t) => t.termId),
    ["cyan"]
  );
});

test("purging a trashed term removes its entry_terms assignments and the term row itself", async () => {
  const h = harness();
  await seedTaxonomy(h, "tax-3", "Tags");
  await seedTerm(h, "green", "tax-3", "Green");
  await seedPost(h, "post-3");
  await assignTerm(h, "green", "post-3");
  await trashItem(h, "term", "green");

  const purged = await h.trash.purgeSelected({
    workspaceId: WS,
    ids: [await trashItemId(h, "green")],
    actor: ACTOR,
    authorizeItem: async () => true,
  });
  assert.equal(purged.purged, 1);
  assert.equal(entryTermCount(h, "green", "post-3"), 0, "the entry_terms row must be gone");
  assert.equal(termRowCount(h, "green"), 0, "the term row itself must be gone");
});

test("a term with children is refused as TERM_HAS_CHILDREN with the child count, and is not trashed", async () => {
  const h = harness();
  await seedTaxonomy(h, "tax-4", "Categories", true);
  await seedTerm(h, "parent", "tax-4", "Parent");
  await seedTerm(h, "child-1", "tax-4", "Child 1", "parent");
  await seedTerm(h, "child-2", "tax-4", "Child 2", "parent");

  const outcome = await trashItem(h, "term", "parent");
  assert.deepEqual(outcome, { ok: false, reason: "blocked", code: "TERM_HAS_CHILDREN", count: 2 });
  assert.equal(termRowCount(h, "parent"), 1, "a blocked trash attempt must leave the term row untouched");
  assert.deepEqual(
    (await h.terms.listByTaxonomy({ taxonomyId: "tax-4" })).map((t) => t.id).sort(),
    ["child-1", "child-2", "parent"],
    "the term must still read as live"
  );
});

test("purging a trashed term writes exactly one taxonomy_revisions row and one taxonomy.term_deleted event", async () => {
  const h = harness();
  await seedTaxonomy(h, "tax-5", "Tags");
  await seedTerm(h, "t1", "tax-5", "Red");
  await trashItem(h, "term", "t1");

  const purged = await h.trash.purgeSelected({
    workspaceId: WS,
    ids: [await trashItemId(h, "t1")],
    actor: ACTOR,
    authorizeItem: async () => true,
  });
  assert.equal(purged.purged, 1);
  assert.equal(taxonomyRevisionCount(h, "tax-5"), 1);
  assert.equal(h.outbox.events.length, 1);
  assert.deepEqual(h.outbox.events[0], {
    name: "taxonomy.term_deleted",
    termId: "t1",
    taxonomyId: "tax-5",
    actorId: ACTOR.principalId,
    occurredAt: AT,
  });
});

test("purging a trashed taxonomy writes exactly one taxonomy_revisions row and one taxonomy.deleted event naming its member term ids", async () => {
  const h = harness();
  await seedTaxonomy(h, "tax-6", "Colors");
  await seedTerm(h, "c1", "tax-6", "Cyan");
  await trashItem(h, "taxonomy", "tax-6");

  const purged = await h.trash.purgeSelected({
    workspaceId: WS,
    ids: [await trashItemId(h, "tax-6")],
    actor: ACTOR,
    authorizeItem: async () => true,
  });
  assert.equal(purged.purged, 1);
  assert.equal(taxonomyRevisionCount(h, "tax-6"), 1);
  assert.equal(h.outbox.events.length, 1);
  assert.deepEqual(h.outbox.events[0], {
    name: "taxonomy.deleted",
    taxonomyId: "tax-6",
    deletedTermIds: ["c1"],
    actorId: ACTOR.principalId,
    occurredAt: AT,
  });
});
