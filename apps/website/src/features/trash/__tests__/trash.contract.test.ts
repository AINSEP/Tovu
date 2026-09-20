import assert from "node:assert/strict";
import test from "node:test";
import type Database from "better-sqlite3";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { parseWidgetInstancePayload } from "#src/features/widgets/entry-payload";

import { createPostTrashAdapter, POST_ENTITY_TYPE } from "../adapters/post.js";
import { createRedirectTrashAdapter, REDIRECT_ENTITY_TYPE } from "../adapters/redirect.js";
import { createContentDbTransactionRunner, SqliteTrashRepo } from "../repo.sqlite.js";
import { bindRemoveEntity, createTrashService, TrashAdapterMissingError } from "../write-service.js";
import type { TrashAdapter, TrashPort } from "../ports.js";

/**
 * @file The two contract clauses the trash design (§2.1) names, plus the atomicity clause the owner
 * added, exercised against real SQLite.
 *
 * Clause 1 — **a trash operation must never round-trip the entity payload.** The first test below
 * shows the failure mode is real and still live in this codebase (`parseWidgetInstancePayload`
 * throws on the exact bytes), then shows the new adapter path moving a marker on a row carrying
 * those same bytes and leaving them byte-identical.
 *
 * Clause 2 — **listing must degrade.** A `trashed_items` row whose entity row was deleted out from
 * under it still lists from its snapshot and is still selectable for purge.
 *
 * Clause 3 (the owner's correction to the design) — **both writes or neither.** There must be no
 * seam that hides an entity without indexing it, or indexes it without hiding it.
 */

const WS = "workspace-1";
const ACTOR = { principalId: "principal-1" };
const AT = "2026-09-20T12:00:00.000Z";

/** Deliberately unparseable — the shape `widgets_trash_instance` chokes on today. */
const MALFORMED_PAYLOAD = '{"fields":{"ext":{"widgets":{"payload":"{not json"';

/**
 * `purgeSelected`'s per-row gate is REQUIRED, so every call site has to say something. The tests
 * that are not about authorization say this, which keeps the gate visible rather than defaulted.
 */
const ALLOW_ALL = async () => true;

interface Harness {
  client: Database.Database;
  repo: SqliteTrashRepo;
  trash: TrashPort;
  adapters: Map<string, TrashAdapter>;
  ids: { next(): string };
}

function harness(): Harness {
  const db = openContentDb(":memory:");
  const client = (db as unknown as { $client: Database.Database }).$client;
  client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(WS, WS, WS, "2026-01-01T00:00:00.000Z");

  const adapters = new Map<string, TrashAdapter>([
    [POST_ENTITY_TYPE, createPostTrashAdapter(client)],
    [REDIRECT_ENTITY_TYPE, createRedirectTrashAdapter(client)],
  ]);
  const repo = new SqliteTrashRepo(client);
  let seq = 0;
  const ids = { next: () => `trash-${(seq += 1)}` };

  return {
    client,
    repo,
    adapters,
    ids,
    trash: createTrashService({ repo, adapters, idGen: ids, transaction: createContentDbTransactionRunner(client) }),
  };
}

function seedPost(client: Database.Database, id: string, bodyJson: string, version = 1): void {
  client
    .prepare(
      `INSERT INTO posts (id, workspace_id, title, slug, body_json, status, kind, body_format, updated_at, version)
       VALUES (?, ?, ?, ?, ?, 'published', 'post', 'doc', ?, ?)`
    )
    .run(id, WS, `Title ${id}`, `slug-${id}`, bodyJson, "2026-09-01T00:00:00.000Z", version);
}

function readBodyJson(client: Database.Database, id: string): string | null {
  const row = client.prepare(`SELECT body_json FROM posts WHERE id = ?`).get(id) as { body_json: string | null } | undefined;
  return row ? row.body_json : null;
}

// ---------------------------------------------------------------------------
// Clause 1 — no payload round-trip
// ---------------------------------------------------------------------------

test("RED reference: the existing widget trash primitive still throws on a payload like this", () => {
  // `trashWidgetInstance` parses the payload to flip a status, so it fails on exactly the rows a
  // user most wants gone. The adapters below must not be able to fail this way — hence the next test.
  assert.throws(() => parseWidgetInstancePayload({ ext: { widget: { payload: "{not json" } } }), SyntaxError);
  assert.throws(() => parseWidgetInstancePayload(MALFORMED_PAYLOAD), /malformed fieldsJson \(expected an object\)/);
});

test("hide then unhide a post whose body_json is unparseable — both succeed, bytes are byte-identical", async () => {
  const h = harness();
  seedPost(h.client, "post-broken", MALFORMED_PAYLOAD);
  const before = readBodyJson(h.client, "post-broken");

  const trashed = await h.trash.trash({
    workspaceId: WS,
    entityType: POST_ENTITY_TYPE,
    entityId: "post-broken",
    actor: ACTOR,
    display: { title: "Title post-broken", subtitle: "slug-post-broken" },
    at: AT,
    expectedVersion: 1,
  });
  assert.deepEqual(trashed, { ok: true, version: 2 });
  assert.equal(readBodyJson(h.client, "post-broken"), before, "trash must not rewrite the payload");

  const restored = await h.trash.restore({ workspaceId: WS, entityType: POST_ENTITY_TYPE, entityId: "post-broken", at: AT });
  assert.equal(restored, "restored");
  assert.equal(readBodyJson(h.client, "post-broken"), before, "restore must not rewrite the payload either");

  const row = h.client.prepare(`SELECT deleted_at, version FROM posts WHERE id = ?`).get("post-broken") as {
    deleted_at: string | null;
    version: number;
  };
  assert.equal(row.deleted_at, null);
  assert.equal(row.version, 3);
});

// ---------------------------------------------------------------------------
// Clause 2 — listing degrades
// ---------------------------------------------------------------------------

test("a trashed_items row whose entity row vanished still lists from its snapshot and is still purgeable", async () => {
  const h = harness();
  seedPost(h.client, "post-gone", '{"type":"doc"}');
  await h.trash.trash({
    workspaceId: WS,
    entityType: POST_ENTITY_TYPE,
    entityId: "post-gone",
    actor: ACTOR,
    display: { title: "Title post-gone", subtitle: "slug-post-gone" },
    at: AT,
    expectedVersion: 1,
  });

  // Something else removed the row — a migration, a manual fix, a future domain purge.
  h.client.prepare(`DELETE FROM posts WHERE id = ?`).run("post-gone");

  const page = await h.trash.list({ workspaceId: WS, now: AT, limit: 10 });
  assert.equal(page.items.length, 1, "the list must not read the entity, so it cannot notice it is gone");
  assert.equal(page.items[0]?.displayTitle, "Title post-gone");

  const report = await h.trash.purgeSelected({
    workspaceId: WS,
    ids: [page.items[0]!.id],
    actor: ACTOR,
    authorizeItem: ALLOW_ALL,
  });
  assert.deepEqual(report.results, [{ id: "trash-1", outcome: "already-gone" }]);
  assert.equal((await h.trash.list({ workspaceId: WS, now: AT, limit: 10 })).items.length, 0);
});

test("an entity type with no registered adapter still LISTS, and degrades honestly on restore and purge", async () => {
  const h = harness();
  await h.repo.insert({
    id: "orphan",
    workspaceId: WS,
    entityType: "widget",
    entityId: "widget-1",
    trashedAt: AT,
    purgeAfter: "2026-11-19T12:00:00.000Z",
    actorPrincipalId: "principal-1",
    actorPluginId: null,
    displayTitle: "A widget",
    displaySubtitle: null,
    entityVersion: 4,
  });

  assert.equal((await h.trash.list({ workspaceId: WS, now: AT, limit: 10 })).items.length, 1);
  assert.equal(
    await h.trash.restore({ workspaceId: WS, entityType: "widget", entityId: "widget-1", at: AT }),
    "adapter-unavailable"
  );
  assert.deepEqual((await h.trash.purgeSelected({ workspaceId: WS, ids: ["orphan"], actor: ACTOR, authorizeItem: ALLOW_ALL })).results, [
    { id: "orphan", outcome: "adapter-unavailable" },
  ]);
});

// ---------------------------------------------------------------------------
// Clause 3 — both writes, or neither
// ---------------------------------------------------------------------------

test("if the index insert fails, the marker flip rolls back — never hidden-but-not-in-trash", async () => {
  const h = harness();
  seedPost(h.client, "post-1", '{"type":"doc"}');

  const exploding = createTrashService({
    repo: Object.assign(Object.create(Object.getPrototypeOf(h.repo) as object) as SqliteTrashRepo, h.repo, {
      insert: async () => {
        throw new Error("disk full");
      },
    }),
    adapters: h.adapters,
    idGen: h.ids,
    transaction: createContentDbTransactionRunner(h.client),
  });

  await assert.rejects(
    exploding.trash({
      workspaceId: WS,
      entityType: POST_ENTITY_TYPE,
      entityId: "post-1",
      actor: ACTOR,
      display: { title: "Title post-1" },
      at: AT,
      expectedVersion: 1,
    }),
    /disk full/
  );

  const row = h.client.prepare(`SELECT deleted_at, version FROM posts WHERE id = ?`).get("post-1") as {
    deleted_at: string | null;
    version: number;
  };
  assert.equal(row.deleted_at, null, "the post must still be live");
  assert.equal(row.version, 1, "and its version must be untouched");
});

test("the transaction runner is reentrant — a domain that already opened one can still call remove", async () => {
  const h = harness();
  seedPost(h.client, "post-1", '{"type":"doc"}');
  const remove = bindRemoveEntity(h.trash, POST_ENTITY_TYPE);

  // Exactly what `deletePost` does: its own BEGIN IMMEDIATE around marker + revision append.
  h.client.exec("BEGIN IMMEDIATE");
  const result = await remove({
    workspaceId: WS,
    id: "post-1",
    display: { title: "Title post-1" },
    at: AT,
    expectedVersion: 1,
    actor: ACTOR,
  });
  h.client.exec("COMMIT");

  assert.deepEqual(result, { ok: true, version: 2 });
  assert.equal((await h.trash.list({ workspaceId: WS, now: AT, limit: 10 })).items.length, 1);
});

// ---------------------------------------------------------------------------
// Call-time adapter resolution, and the restore-beats-purge race
// ---------------------------------------------------------------------------

test("adapters resolve at CALL time, not at registration time", async () => {
  const h = harness();
  h.adapters.delete(POST_ENTITY_TYPE);
  seedPost(h.client, "post-1", '{"type":"doc"}');

  await assert.rejects(
    h.trash.trash({
      workspaceId: WS,
      entityType: POST_ENTITY_TYPE,
      entityId: "post-1",
      actor: ACTOR,
      display: { title: "x" },
      at: AT,
      expectedVersion: 1,
    }),
    TrashAdapterMissingError
  );

  // Registered AFTER the service was built — a registration-time snapshot would miss this.
  h.adapters.set(POST_ENTITY_TYPE, createPostTrashAdapter(h.client));
  const result = await h.trash.trash({
    workspaceId: WS,
    entityType: POST_ENTITY_TYPE,
    entityId: "post-1",
    actor: ACTOR,
    display: { title: "x" },
    at: AT,
    expectedVersion: 1,
  });
  assert.deepEqual(result, { ok: true, version: 2 });
});

test("a restore racing a purge always leaves the item alive — the version moved, so the purge stands down", async () => {
  const h = harness();
  seedPost(h.client, "post-1", '{"type":"doc"}');
  await h.trash.trash({
    workspaceId: WS,
    entityType: POST_ENTITY_TYPE,
    entityId: "post-1",
    actor: ACTOR,
    display: { title: "Title post-1" },
    at: AT,
    expectedVersion: 1,
  });
  const listed = await h.trash.list({ workspaceId: WS, now: AT, limit: 10 });
  const trashId = listed.items[0]!.id;

  // The sweeper has the row in hand at entity_version 2; meanwhile someone edits the post.
  h.client.prepare(`UPDATE posts SET version = version + 1 WHERE id = ?`).run("post-1");

  const report = await h.trash.purgeSelected({ workspaceId: WS, ids: [trashId], actor: ACTOR, authorizeItem: ALLOW_ALL });
  assert.deepEqual(report.results, [{ id: trashId, outcome: "version-changed" }]);
  assert.equal(report.purged, 0);
  assert.notEqual(h.client.prepare(`SELECT id FROM posts WHERE id = ?`).get("post-1"), undefined, "the post survives");
  assert.equal((await h.trash.list({ workspaceId: WS, now: AT, limit: 10 })).items.length, 1, "and stays in the Trash");
});

test("purgeSelected reports per item — one bad id never aborts the rest of the selection", async () => {
  const h = harness();
  seedPost(h.client, "post-1", '{"type":"doc"}');
  seedPost(h.client, "post-2", '{"type":"doc"}');
  for (const id of ["post-1", "post-2"]) {
    await h.trash.trash({
      workspaceId: WS,
      entityType: POST_ENTITY_TYPE,
      entityId: id,
      actor: ACTOR,
      display: { title: id },
      at: AT,
      expectedVersion: 1,
    });
  }

  const report = await h.trash.purgeSelected({ workspaceId: WS, ids: ["trash-1", "nope", "trash-2"], actor: ACTOR, authorizeItem: ALLOW_ALL });
  assert.deepEqual(report.results, [
    { id: "trash-1", outcome: "purged" },
    { id: "nope", outcome: "not-found" },
    { id: "trash-2", outcome: "purged" },
  ]);
  assert.equal(report.purged, 2);
  assert.equal((h.client.prepare(`SELECT count(*) AS n FROM posts`).get() as { n: number }).n, 0);
});

test("purgeSelected gates every row on the SERVER-SIDE row, and a denial neither purges nor drops the index row", async () => {
  const h = harness();
  seedPost(h.client, "post-1", '{"type":"doc"}');
  seedPost(h.client, "post-2", '{"type":"doc"}');
  for (const id of ["post-1", "post-2"]) {
    await h.trash.trash({
      workspaceId: WS,
      entityType: POST_ENTITY_TYPE,
      entityId: id,
      actor: ACTOR,
      display: { title: id },
      at: AT,
      expectedVersion: 1,
    });
  }

  // What the gate is HANDED is the point of the test: the caller names only ids, so if the gate saw
  // anything the caller supplied, a client could name a kind it may moderate for a row of a kind it
  // may not, and the check would pass on the wrong permission.
  const seen: { id: string; entityType: string; entityId: string }[] = [];
  const report = await h.trash.purgeSelected({
    workspaceId: WS,
    ids: ["trash-1", "trash-2"],
    actor: ACTOR,
    authorizeItem: async (item) => {
      seen.push({ id: item.id, entityType: item.entityType, entityId: item.entityId });
      return item.entityId === "post-2";
    },
  });

  assert.deepEqual(seen, [
    { id: "trash-1", entityType: POST_ENTITY_TYPE, entityId: "post-1" },
    { id: "trash-2", entityType: POST_ENTITY_TYPE, entityId: "post-2" },
  ]);
  assert.deepEqual(report.results, [
    { id: "trash-1", outcome: "forbidden" },
    { id: "trash-2", outcome: "purged" },
  ]);
  assert.equal(report.purged, 1);
  assert.notEqual(
    h.client.prepare(`SELECT id FROM posts WHERE id = ?`).get("post-1"),
    undefined,
    "the denied post survives"
  );
  const left = await h.trash.list({ workspaceId: WS, now: AT, limit: 10 });
  assert.deepEqual(
    left.items.map((item) => item.id),
    ["trash-1"],
    "and its index row is left in place, so the Trash still offers it"
  );
});

test("purging a post takes its revision ledger and search projection with it", async () => {
  const h = harness();
  seedPost(h.client, "post-1", '{"type":"doc"}');
  h.client
    .prepare(
      `INSERT INTO post_revisions (id, post_id, workspace_id, seq, op, state_json, content_hash, actor_id, recorded_at)
       VALUES ('rev-1', 'post-1', ?, 1, 'create', '{}', 'hash', 'actor', ?)`
    )
    .run(WS, AT);
  h.client
    .prepare(`INSERT INTO post_search_document (post_id, title, slug, body_text) VALUES ('post-1', 't', 's', 'b')`)
    .run();

  await h.trash.trash({
    workspaceId: WS,
    entityType: POST_ENTITY_TYPE,
    entityId: "post-1",
    actor: ACTOR,
    display: { title: "t" },
    at: AT,
    expectedVersion: 1,
  });
  const report = await h.trash.purgeSelected({ workspaceId: WS, ids: ["trash-1"], actor: ACTOR, authorizeItem: ALLOW_ALL });
  assert.equal(report.purged, 1);

  assert.equal((h.client.prepare(`SELECT count(*) AS n FROM post_revisions`).get() as { n: number }).n, 0);
  assert.equal((h.client.prepare(`SELECT count(*) AS n FROM post_search_document`).get() as { n: number }).n, 0);
});

test("redirects use status='disabled' as their marker, not the literal the design guessed", async () => {
  const h = harness();
  h.client
    .prepare(
      `INSERT INTO redirects (id, workspace_id, match_type, from_pattern, to_target, status_code, status, override,
                              priority, source, created_by_principal, created_at, updated_at, version)
       VALUES ('r-1', ?, 'exact', '/old', '/new', 301, 'active', 0, 100, 'manual', 'principal-1', ?, ?, 1)`
    )
    .run(WS, AT, AT);

  const result = await h.trash.trash({
    workspaceId: WS,
    entityType: REDIRECT_ENTITY_TYPE,
    entityId: "r-1",
    actor: ACTOR,
    display: { title: "/old", subtitle: "/new" },
    at: AT,
    expectedVersion: 1,
  });
  assert.deepEqual(result, { ok: true, version: 2 });
  assert.equal((h.client.prepare(`SELECT status FROM redirects WHERE id = 'r-1'`).get() as { status: string }).status, "disabled");

  assert.equal(await h.trash.restore({ workspaceId: WS, entityType: REDIRECT_ENTITY_TYPE, entityId: "r-1", at: AT }), "restored");
  assert.equal((h.client.prepare(`SELECT status FROM redirects WHERE id = 'r-1'`).get() as { status: string }).status, "active");
});
