import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";
import { runtimeSchemaVersion } from "#src/platform/site-dir/schema-guard";
import { SqliteDatabaseIntrospectionAdapter } from "../database-introspection-adapter.sqlite.js";

/**
 * @file ADR-041 §3 — integration tests for `SqliteDatabaseIntrospectionAdapter`, the real backing
 * adapter for `database_get_health`/`database_get_schema_state`/`database_list_pending_migrations`.
 * Mirrors `db/sqlite/__tests__/database-journal.integration.test.ts`'s pattern: real temp-file
 * `better-sqlite3` databases, no mocks. Relocated from
 * `features/database/__tests__/integration/adapter.sqlite.integration.test.ts` (2026-08-17,
 * architecture SCC cut) alongside the adapter it exercises; the port it exercises against
 * (`DatabaseIntrospectionPort`) stays at `features/database/adapter.sqlite.ts`.
 *
 * Two fixture strategies, deliberately both used:
 *  - "real content.db" tests open an actual `content.db` via `openContentDb` (so `__drizzle_migrations`
 *    is populated by drizzle-orm's own real migrator, against this repo's real bundled
 *    `db/drizzle/meta/_journal.json`) — proof the adapter works against production wiring, not
 *    just a synthetic double.
 *  - "synthetic journal" tests build their own tiny migrations folder + journal and run the SAME
 *    real `drizzle-orm` migrator against it, then hand the adapter a DELIBERATELY DIFFERENT journal
 *    (via its testing-only `journalPath` override) — the only way to exercise 'ahead'/'behind'
 *    classifications and a genuinely pending migration, since this repo's real bundled journal's
 *    tags are unique per index (RT-005), making 'ahead'/'behind' structurally unreachable against
 *    the real journal (see `drift.ts`'s own doc comment: tag identity is decisive).
 */

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeSiteMeta(dir: string, snapshot: { schemaVersion: number; schemaTag: string } | Record<string, unknown>): void {
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify(snapshot));
}

// ---------------------------------------------------------------------------
// Real content.db fixtures (production wiring)
// ---------------------------------------------------------------------------

function openRealContentDb(): { dir: string; dbPath: string; db: ContentDb } {
  const dir = tmpDir("database-adapter-real-");
  const dbPath = path.join(dir, "content.db");
  const db = openContentDb(dbPath);
  return { dir, dbPath, db };
}

test("real content.db: canOpenDb/migrationsTableReadable are true right after openContentDb", async () => {
  const { dir, dbPath, db } = openRealContentDb();
  try {
    const adapter = new SqliteDatabaseIntrospectionAdapter({ db, dbPath });
    const health = await adapter.getHealth();
    assert.equal(health.canOpenDb, true);
    assert.equal(health.migrationsTableReadable, true);
  } finally {
    db.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("real content.db: no .site-meta.json on disk -> schema state is 'unknown', never fabricated, health drift is 'unknown' too", async () => {
  const { dir, dbPath, db } = openRealContentDb();
  try {
    const adapter = new SqliteDatabaseIntrospectionAdapter({ db, dbPath });
    const state = await adapter.getSchemaState();
    assert.equal(state.status, "unknown");
    assert.equal(state.siteMeta, null);
    assert.ok(state.runtime, "the runtime side is readable from a freshly-migrated real content.db");

    const health = await adapter.getHealth();
    assert.equal(health.driftStatus, "unknown");
  } finally {
    db.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("real content.db: .site-meta.json stamped to match this runtime's real latest migration -> 'in-sync', and nothing is pending against this runtime's own bundled journal", async () => {
  const { dir, dbPath, db } = openRealContentDb();
  try {
    const runtime = runtimeSchemaVersion();
    writeSiteMeta(dir, { schemaVersion: runtime.index, schemaTag: runtime.tag });

    const adapter = new SqliteDatabaseIntrospectionAdapter({ db, dbPath });
    const state = await adapter.getSchemaState();
    assert.equal(state.status, "in-sync");
    assert.deepEqual(state.siteMeta, { version: runtime.index, tag: runtime.tag });
    assert.deepEqual(state.runtime, { version: runtime.index, tag: runtime.tag });

    const health = await adapter.getHealth();
    assert.equal(health.driftStatus, "in-sync");

    const pending = await adapter.listPendingMigrations();
    assert.deepEqual(pending.items, [], "a freshly-migrated real content.db has nothing pending against its own bundled journal");
  } finally {
    db.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("real content.db: a stale .site-meta.json tag classifies as 'diverged', per drift.ts's tag-decisive rule", async () => {
  const { dir, dbPath, db } = openRealContentDb();
  try {
    writeSiteMeta(dir, { schemaVersion: 0, schemaTag: "some-stale-tag-that-does-not-exist" });

    const adapter = new SqliteDatabaseIntrospectionAdapter({ db, dbPath });
    const state = await adapter.getSchemaState();
    assert.equal(state.status, "diverged");
  } finally {
    db.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("real content.db: a malformed .site-meta.json (bad JSON) is treated as absent, never thrown", async () => {
  const { dir, dbPath, db } = openRealContentDb();
  try {
    fs.writeFileSync(path.join(dir, ".site-meta.json"), "{ not valid json");

    const adapter = new SqliteDatabaseIntrospectionAdapter({ db, dbPath });
    const state = await adapter.getSchemaState();
    assert.equal(state.status, "unknown");
    assert.equal(state.siteMeta, null);
  } finally {
    db.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("real content.db: a .site-meta.json missing schemaVersion/schemaTag is treated as absent", async () => {
  const { dir, dbPath, db } = openRealContentDb();
  try {
    writeSiteMeta(dir, { siteId: "x", templateId: "starter" });

    const adapter = new SqliteDatabaseIntrospectionAdapter({ db, dbPath });
    const state = await adapter.getSchemaState();
    assert.equal(state.status, "unknown");
    assert.equal(state.siteMeta, null);
  } finally {
    db.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("real content.db: canOpenDb is false once the connection is closed", async () => {
  const { dir, dbPath, db } = openRealContentDb();
  const adapter = new SqliteDatabaseIntrospectionAdapter({ db, dbPath });
  db.$client.close();
  try {
    const health = await adapter.getHealth();
    assert.equal(health.canOpenDb, false);
    assert.equal(health.migrationsTableReadable, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Synthetic journal fixtures — real drizzle-orm migrator, a scratch migrations folder this test
// controls, and an adapter `journalPath` override so classifications unreachable against the real
// bundled journal (ahead/behind, a genuinely pending migration) are still exercised against a real
// SQLite file rather than a mock.
// ---------------------------------------------------------------------------

function buildSyntheticMigrationsFixture(entries: Array<{ idx: number; when: number; tag: string }>): {
  migrationsDir: string;
  journalPath: string;
} {
  const migrationsDir = tmpDir("database-adapter-migrations-");
  fs.mkdirSync(path.join(migrationsDir, "meta"), { recursive: true });
  for (const entry of entries) {
    fs.writeFileSync(path.join(migrationsDir, `${entry.tag}.sql`), `CREATE TABLE t_${entry.idx} (id integer);`);
  }
  fs.writeFileSync(
    path.join(migrationsDir, "meta", "_journal.json"),
    JSON.stringify({ version: "7", dialect: "sqlite", entries: entries.map((e) => ({ ...e, version: "6", breakpoints: true })) }),
  );
  return { migrationsDir, journalPath: path.join(migrationsDir, "meta", "_journal.json") };
}

/** Opens a fresh raw SQLite file and runs the REAL `drizzle-orm` migrator against `entries`
 * (a subset, in production order) so `__drizzle_migrations` is populated exactly the way
 * `content-db.ts`/`database-journal-db.ts` populate it — not a hand-rolled INSERT. */
function migrateRealDb(entries: Array<{ idx: number; when: number; tag: string }>): {
  dir: string;
  dbPath: string;
  db: ContentDb;
} {
  const dir = tmpDir("database-adapter-synthetic-");
  const dbPath = path.join(dir, "content.db");
  const { migrationsDir } = buildSyntheticMigrationsFixture(entries);

  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite) as unknown as ContentDb;
  migrate(db, { migrationsFolder: migrationsDir });
  fs.rmSync(migrationsDir, { recursive: true, force: true });

  return { dir, dbPath, db };
}

test("synthetic journal: 'ahead' — site-meta's version is higher than the applied migration's, same tag", async () => {
  const applied = [{ idx: 0, when: 1_000, tag: "aaa" }];
  const { dir, dbPath, db } = migrateRealDb(applied);
  try {
    // The FULL journal the adapter is handed carries the same single applied entry, unchanged — the
    // divergence this test proves comes entirely from .site-meta.json claiming a higher version
    // under the SAME tag, which `getDriftStatus` treats as 'ahead' regardless of index count.
    const { migrationsDir, journalPath } = buildSyntheticMigrationsFixture(applied);
    writeSiteMeta(dir, { schemaVersion: 6, schemaTag: "aaa" });

    const adapter = new SqliteDatabaseIntrospectionAdapter({ db, dbPath, journalPath });
    const state = await adapter.getSchemaState();
    assert.equal(state.status, "ahead");
    fs.rmSync(migrationsDir, { recursive: true, force: true });
  } finally {
    db.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("synthetic journal: 'behind' — site-meta's version is lower than the applied migration's, same tag", async () => {
  const applied = [{ idx: 5, when: 1_000, tag: "zzz" }];
  const { dir, dbPath, db } = migrateRealDb(applied);
  try {
    const { migrationsDir, journalPath } = buildSyntheticMigrationsFixture(applied);
    writeSiteMeta(dir, { schemaVersion: 1, schemaTag: "zzz" });

    const adapter = new SqliteDatabaseIntrospectionAdapter({ db, dbPath, journalPath });
    const state = await adapter.getSchemaState();
    assert.equal(state.status, "behind");
    fs.rmSync(migrationsDir, { recursive: true, force: true });
  } finally {
    db.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("synthetic journal: listPendingMigrations reports exactly the entries not yet reflected in __drizzle_migrations", async () => {
  const applied = [
    { idx: 0, when: 1_000, tag: "first" },
    { idx: 1, when: 2_000, tag: "second" },
  ];
  const { dir, dbPath, db } = migrateRealDb(applied);
  try {
    // The adapter is handed a journal with ONE extra, never-applied entry — its SQL file need not
    // even exist on disk, since listPendingMigrations only ever reads the journal JSON.
    const fullJournal = [...applied, { idx: 2, when: 3_000, tag: "third-not-applied" }];
    const { migrationsDir, journalPath } = buildSyntheticMigrationsFixture(fullJournal);

    const adapter = new SqliteDatabaseIntrospectionAdapter({ db, dbPath, journalPath });
    const pending = await adapter.listPendingMigrations();
    assert.deepEqual(pending.items, [{ index: 2, tag: "third-not-applied" }]);
    fs.rmSync(migrationsDir, { recursive: true, force: true });
  } finally {
    db.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("synthetic journal: listPendingMigrations is empty once every journal entry has a matching applied row", async () => {
  const applied = [
    { idx: 0, when: 1_000, tag: "first" },
    { idx: 1, when: 2_000, tag: "second" },
  ];
  const { dir, dbPath, db } = migrateRealDb(applied);
  try {
    const { migrationsDir, journalPath } = buildSyntheticMigrationsFixture(applied);

    const adapter = new SqliteDatabaseIntrospectionAdapter({ db, dbPath, journalPath });
    const pending = await adapter.listPendingMigrations();
    assert.deepEqual(pending.items, []);
    fs.rmSync(migrationsDir, { recursive: true, force: true });
  } finally {
    db.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a database with no __drizzle_migrations table at all (never migrated) reports migrationsTableReadable:false and schema state 'unknown'", async () => {
  const dir = tmpDir("database-adapter-nomigrations-");
  const dbPath = path.join(dir, "content.db");
  const sqlite = new Database(dbPath);
  const db = { $client: sqlite } as unknown as ContentDb;
  // A synthetic, non-empty journal so "no applied rows" is unambiguously the reason every entry
  // below is pending — using the real 21-entry bundled journal here would still pass (an unmigrated
  // db has nothing applied against ANY journal), but would make the assertion a brittle count
  // instead of a clear, self-contained fixture.
  const { migrationsDir, journalPath } = buildSyntheticMigrationsFixture([{ idx: 0, when: 1_000, tag: "never-applied" }]);
  try {
    const adapter = new SqliteDatabaseIntrospectionAdapter({ db, dbPath, journalPath });
    const health = await adapter.getHealth();
    assert.equal(health.canOpenDb, true);
    assert.equal(health.migrationsTableReadable, false);
    assert.equal(health.driftStatus, "unknown");

    const state = await adapter.getSchemaState();
    assert.equal(state.runtime, null);

    const pending = await adapter.listPendingMigrations();
    assert.deepEqual(pending.items, [{ index: 0, tag: "never-applied" }]);
  } finally {
    fs.rmSync(migrationsDir, { recursive: true, force: true });
    sqlite.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
