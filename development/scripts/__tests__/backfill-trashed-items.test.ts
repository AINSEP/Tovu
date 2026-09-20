/**
 * @file `backfill-trashed-items.ts` — the local admin Trash's phase-1 backfill (design §6).
 *
 * Runs against a REAL migrated SQLite file, not a mock, because every claim worth testing here is a
 * claim about SQL: which marker literal each domain actually uses, whether the redirect predicate
 * can tell a deleted rule from a switched-off one, and whether `INSERT OR IGNORE` really makes a
 * re-run free.
 */
import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { backfillTrashedItems } from "../backfill-trashed-items.js";

const WORKSPACE_ID = "ws-backfill";
const NOW = "2026-09-20T00:00:00.000Z";
/** NOW + 60 days. The point of the assertion below is that it is derived from NOW, not from the
 *  marker's own (much older) timestamp. */
const EXPECTED_PURGE_AFTER = "2026-11-19T00:00:00.000Z";
const LONG_AGO = "2026-01-01T00:00:00.000Z";

interface Row {
  entity_type: string;
  entity_id: string;
  trashed_at: string;
  purge_after: string;
  display_title: string;
  display_subtitle: string | null;
  entity_version: number;
  actor_principal_id: string;
}

function openMigratedDb(): Database.Database {
  const client = new Database(":memory:");
  migrate(drizzle(client), { migrationsFolder: "apps/website/src/platform/db/drizzle" });
  client
    .prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)")
    .run(WORKSPACE_ID, "Backfill", "backfill", LONG_AGO);
  return client;
}

function seedPost(client: Database.Database, id: string, deletedAt: string | null, title = `Title ${id}`): void {
  client
    .prepare(
      `INSERT INTO posts (id, workspace_id, title, slug, body_json, status, kind, body_format, updated_at, version, ext, deleted_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'draft', 'post', 'doc', ?, 4, '{}', ?, ?)`
    )
    .run(id, WORKSPACE_ID, title, `slug-${id}`, "{not even json", LONG_AGO, deletedAt, LONG_AGO);
}

function seedMedia(client: Database.Database, id: string, status: string): void {
  client
    .prepare(
      `INSERT INTO media (id, workspace_id, title, alt, caption, credit, source_sha256, status, created_at, updated_at, version, slug)
       VALUES (?, ?, ?, '', '', '', 'sha-${id}', ?, ?, ?, 7, ?)`
    )
    .run(id, WORKSPACE_ID, `Asset ${id}`, status, LONG_AGO, LONG_AGO, `media-${id}`);
}

function seedRedirect(client: Database.Database, id: string, status: string, tombstonedLatest: boolean | null): void {
  client
    .prepare(
      `INSERT INTO redirects (id, workspace_id, match_type, from_pattern, to_target, status_code, status, override, priority, source, created_by_principal, created_at, updated_at, version)
       VALUES (?, ?, 'exact', ?, ?, 301, ?, 0, 0, 'manual', 'actor', ?, ?, 2)`
    )
    .run(id, WORKSPACE_ID, `/from-${id}`, `/to-${id}`, status, LONG_AGO, LONG_AGO);
  if (tombstonedLatest === null) return;
  const insertRevision = client.prepare(
    `INSERT INTO redirect_revisions (redirect_id, workspace_id, seq, state_json, tombstoned, actor_id, recorded_at)
     VALUES (?, ?, ?, '{}', ?, 'actor', ?)`
  );
  // seq 1 is always a live revision, so the discriminator is genuinely "the LATEST one", not "any".
  insertRevision.run(id, WORKSPACE_ID, 1, 0, LONG_AGO);
  insertRevision.run(id, WORKSPACE_ID, 2, tombstonedLatest ? 1 : 0, LONG_AGO);
}

function createCommentsTable(client: Database.Database): void {
  client.exec(
    `CREATE TABLE "p_comments__comments" (
       id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, entry_id TEXT NOT NULL, parent_id TEXT,
       thread_root_id TEXT NOT NULL, depth INTEGER NOT NULL, status TEXT NOT NULL,
       author_principal_id TEXT, author_name TEXT NOT NULL, author_email TEXT, author_url TEXT,
       author_ip_hash TEXT, body_text TEXT NOT NULL, spam_score REAL, spam_provider TEXT,
       created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL)`
  );
}

function seedComment(client: Database.Database, id: string, status: string, bodyText: string): void {
  client
    .prepare(
      `INSERT INTO "p_comments__comments" (id, workspace_id, entry_id, thread_root_id, depth, status, author_name, body_text, created_at, updated_at, version)
       VALUES (?, ?, 'entry-9', ?, 0, ?, 'Visitor', ?, ?, ?, 3)`
    )
    .run(id, WORKSPACE_ID, id, status, bodyText, LONG_AGO, LONG_AGO);
}

function listIndexed(client: Database.Database): Row[] {
  return client.prepare("SELECT * FROM trashed_items ORDER BY entity_type, entity_id").all() as Row[];
}

function rowsByType(results: { entityType: string; rows: number; skipped: boolean }[], entityType: string) {
  const found = results.find((result) => result.entityType === entityType);
  assert.ok(found, `no result reported for '${entityType}'`);
  return found;
}

test("backfill indexes every pre-existing marker, from columns only, with no payload parse", () => {
  const client = openMigratedDb();
  // `body_json` on both posts is deliberately unparseable: a backfill that hydrated an entity would
  // throw here, which is the whole reason it is pure SQL.
  seedPost(client, "post-trashed", LONG_AGO);
  seedPost(client, "post-live", null);
  seedMedia(client, "media-trashed", "trashed");
  seedMedia(client, "media-live", "active");
  createCommentsTable(client);
  seedComment(client, "comment-trashed", "trash", "x".repeat(200));
  seedComment(client, "comment-approved", "approved", "fine");

  const applied = backfillTrashedItems({ client, now: NOW, apply: true });

  assert.equal(rowsByType(applied, "post").rows, 1);
  assert.equal(rowsByType(applied, "media").rows, 1);
  assert.equal(rowsByType(applied, "comment").rows, 1);

  const indexed = listIndexed(client);
  assert.deepEqual(
    indexed.map((row) => `${row.entity_type}:${row.entity_id}`),
    ["comment:comment-trashed", "media:media-trashed", "post:post-trashed"]
  );

  const post = indexed.find((row) => row.entity_type === "post")!;
  assert.equal(post.display_title, "Title post-trashed");
  assert.equal(post.display_subtitle, "slug-post-trashed");
  assert.equal(post.entity_version, 4);
  assert.equal(post.actor_principal_id, "system-trash-backfill");

  const media = indexed.find((row) => row.entity_type === "media")!;
  assert.equal(media.display_title, "Asset media-trashed");
  assert.equal(media.display_subtitle, "media-media-trashed");

  const comment = indexed.find((row) => row.entity_type === "comment")!;
  assert.equal(comment.display_title, "Comment on entry-9");
  assert.equal(comment.display_subtitle?.length, 120, "the comment excerpt must be capped at 120 characters");
});

test("purge_after starts at the BACKFILL time, not retroactively from the original marker", () => {
  const client = openMigratedDb();
  seedPost(client, "post-ancient", LONG_AGO);

  backfillTrashedItems({ client, now: NOW, apply: true });

  const [row] = listIndexed(client);
  // The true original timestamp is kept, so the screen can say "deleted 8 months ago" honestly...
  assert.equal(row.trashed_at, LONG_AGO);
  // ...while the countdown starts today. Retroactive retention would purge this on the day the
  // feature shipped, destroying data nobody agreed to lose.
  assert.equal(row.purge_after, EXPECTED_PURGE_AFTER);
});

test("a redirect an operator merely switched OFF is not swept into the Trash", () => {
  const client = openMigratedDb();
  seedRedirect(client, "redirect-deleted", "disabled", true);
  seedRedirect(client, "redirect-switched-off", "disabled", false);
  seedRedirect(client, "redirect-never-revised", "disabled", null);
  seedRedirect(client, "redirect-live", "active", false);

  const applied = backfillTrashedItems({ client, now: NOW, apply: true });

  assert.equal(rowsByType(applied, "redirect").rows, 1);
  const indexed = listIndexed(client);
  assert.deepEqual(
    indexed.map((row) => row.entity_id),
    ["redirect-deleted"],
    "'disabled' alone is ambiguous — only the latest revision's tombstone tells a delete from a switch-off"
  );
  assert.equal(indexed[0].display_title, "/from-redirect-deleted");
  assert.equal(indexed[0].display_subtitle, "/to-redirect-deleted");
});

test("re-running the backfill is free — no duplicate rows, and the second run reports zero", () => {
  const client = openMigratedDb();
  seedPost(client, "post-trashed", LONG_AGO);
  seedMedia(client, "media-trashed", "trashed");

  backfillTrashedItems({ client, now: NOW, apply: true });
  const second = backfillTrashedItems({ client, now: "2026-09-21T00:00:00.000Z", apply: true });

  assert.equal(rowsByType(second, "post").rows, 0);
  assert.equal(rowsByType(second, "media").rows, 0);
  assert.equal(listIndexed(client).length, 2);
  // The first run's clock stands: a re-run must not silently extend everyone's retention.
  assert.equal(listIndexed(client)[0].purge_after, EXPECTED_PURGE_AFTER);
});

test("a dry run counts exactly what an apply would write, and writes nothing", () => {
  const client = openMigratedDb();
  seedPost(client, "post-a", LONG_AGO);
  seedPost(client, "post-b", LONG_AGO);
  seedMedia(client, "media-trashed", "trashed");

  const planned = backfillTrashedItems({ client, now: NOW, apply: false });
  assert.equal(rowsByType(planned, "post").rows, 2);
  assert.equal(rowsByType(planned, "media").rows, 1);
  assert.equal(listIndexed(client).length, 0, "a dry run must not write");

  const applied = backfillTrashedItems({ client, now: NOW, apply: true });
  assert.equal(rowsByType(applied, "post").rows, 2);
  assert.equal(rowsByType(applied, "media").rows, 1);

  // And a dry run AFTER the apply reports nothing left to do, rather than re-counting the same rows.
  const afterwards = backfillTrashedItems({ client, now: NOW, apply: false });
  assert.equal(rowsByType(afterwards, "post").rows, 0);
  assert.equal(rowsByType(afterwards, "media").rows, 0);
});

test("a database with no comments plugin installed is skipped, not failed", () => {
  const client = openMigratedDb();
  seedPost(client, "post-trashed", LONG_AGO);

  const applied = backfillTrashedItems({ client, now: NOW, apply: true });

  assert.equal(rowsByType(applied, "comment").skipped, true);
  assert.equal(rowsByType(applied, "comment").rows, 0);
  assert.equal(rowsByType(applied, "post").rows, 1, "the other domains still run");
});
