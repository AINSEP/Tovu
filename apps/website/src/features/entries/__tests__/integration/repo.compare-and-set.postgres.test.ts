import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { sql } from "kysely";

import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { openPostgresKernel, type StorageKernel } from "#src/platform/db/kernel/index";
import { migrateContentDatabase } from "#src/platform/db/migrations/index";
import { freshPostgresDatabase } from "#src/platform/db/__tests__/postgres-database";
import { importEntry, VersionConflictError } from "../../index.js";
import type { EntryRecord } from "../../index.js";
import { SqlEntryRepo } from "../../repo.js";

/**
 * @file Entry compare-and-set (wm S3) on a REAL Postgres server, two pooled kernels = two
 * connections: writer A's conditional UPDATE holds the row lock inside an open transaction, writer B's
 * UPDATE on the same base version blocks on it, and once A commits, B re-checks its WHERE against A's
 * row and matches nothing — so B gets the version conflict instead of overwriting A. The same holds
 * for two import-as-creates of one id: B's INSERT waits on A's uncommitted one, then inserts nothing.
 * PGlite's single connection cannot show this. Fails (never skips) when the local server is down.
 */

const DATABASE = "tovu_entry_cas_pg_fixture";

let first: ContentKernel;
let second: ContentKernel;

before(async () => {
  const url = freshPostgresDatabase(DATABASE);
  first = openPostgresKernel<ContentDatabase>({ connectionString: url });
  second = openPostgresKernel<ContentDatabase>({ connectionString: url });
  await migrateContentDatabase(first as unknown as StorageKernel<unknown>);
});

after(async () => {
  await first?.close();
  await second?.close();
});

function entry(overrides: Partial<EntryRecord> = {}): EntryRecord {
  return { id: "entry-1", workspaceId: "ws-1", type: "recipe", slug: "chili", status: "draft", title: "Chili", fieldsJson: { ext: { site: {} } }, bodyJson: null, publishedAt: null, createdAt: "2026-10-04T00:00:00.000Z", updatedAt: "2026-10-04T00:00:00.000Z", version: 1, ...overrides };
}

/** Polls until some other session in this database waits on a lock (writer B is blocked). */
async function untilALockWaits(kernel: ContentKernel): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rows = await kernel.query(
      sql<{ waiting: string | number }>`SELECT count(*) AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`
    );
    if (Number(rows[0]?.waiting) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("writer B never blocked on writer A's row lock");
}

test("postgres: two writers on the same base version, B blocked on A's row lock — A lands, B gets the version conflict", async () => {
  const repoA = new SqlEntryRepo(first);
  const repoB = new SqlEntryRepo(second);
  await repoA.save(entry());

  let releaseA!: () => void;
  const aMayCommit = new Promise<void>((resolve) => (releaseA = resolve));
  let aUpdated!: () => void;
  const aHoldsLock = new Promise<void>((resolve) => (aUpdated = resolve));
  const writerA = first.transaction(async () => {
    await repoA.save(entry({ title: "Writer A", version: 2 }), { expectedVersion: 1 });
    aUpdated();
    await aMayCommit;
  });

  await aHoldsLock;
  const writerB = repoB.save(entry({ title: "Writer B", version: 2 }), { expectedVersion: 1 });
  writerB.catch(() => {});
  await untilALockWaits(first);
  releaseA();
  await writerA;

  await assert.rejects(
    writerB,
    (error: unknown) =>
      error instanceof VersionConflictError &&
      error.message === "expected version 1 for entry 'entry-1', found 2"
  );
  const stored = await repoB.findById({ workspaceId: "ws-1", id: "entry-1" });
  assert.deepEqual([stored?.title, stored?.version], ["Writer A", 2]);
});

test("postgres: two import-as-creates of one id, B blocked on A's uncommitted insert — one row, one revision, one event; B is a version conflict", async () => {
  const events: string[] = [];
  const base = { contentTypeRepo: { findByKey: async () => ({ workspaceId: "ws-1", key: "recipe", status: "active" as const, fields: [] }) }, clock: { nowMs: () => Date.parse("2026-10-04T00:00:00.000Z") }, authorize: async () => ({ allowed: true, reason: "ok" }), outbox: { enqueue: async (event: { name: string }) => void events.push(event.name) } };
  const input = (title: string) => ({ workspaceId: "ws-1", actorId: "user-1", id: "created-1", type: "recipe", slug: "created", title, status: "draft" as const, fieldsJson: { ext: { site: {} } }, publishedAt: null, expectedVersion: undefined });

  let releaseA!: () => void;
  const aMayCommit = new Promise<void>((resolve) => (releaseA = resolve));
  let aInserted!: () => void;
  const aHoldsInsert = new Promise<void>((resolve) => (aInserted = resolve));
  const writerA = importEntry({ deps: { ...base, entryRepo: new SqlEntryRepo(first), onWritten: async () => { aInserted(); await aMayCommit; } }, input: input("Writer A") });

  await Promise.race([aHoldsInsert, writerA.then((result) => Promise.reject(new Error(`writer A ended before holding its insert: ${JSON.stringify(result)}`)))]);
  const writerB = importEntry({ deps: { ...base, entryRepo: new SqlEntryRepo(second) }, input: input("Writer B") });
  try {
    await untilALockWaits(first);
  } finally {
    releaseA(); // a failed wait must not leave A's transaction (and the pool) open forever
  }
  const [a, b] = await Promise.all([writerA, writerB]);

  assert.equal(a.ok, true);
  assert.ok(!b.ok && b.error instanceof VersionConflictError && b.error.message === "expected no entry 'created-1', found 1");
  const rows = await first.run((db) => db.selectFrom("entries").select(["title", "version"]).where("id", "=", "created-1").execute());
  assert.deepEqual(rows, [{ title: "Writer A", version: 1 }]);
  const revisions = await first.run((db) => db.selectFrom("entry_revisions").select("op").where("entry_id", "=", "created-1").execute());
  assert.deepEqual(revisions, [{ op: "create" }]);
  assert.deepEqual(events, ["entry.imported"]);
});
