import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteWorkspaceRepo } from "../../repo.sqlite.js";

/**
 * @file Real SQLite persistence for `features/workspace` (this dispatch — closes a gap confirmed
 * by an exhaustive import-path search: `SqliteWorkspaceRepo` was, until now, imported by exactly
 * two files in the whole tree outside this feature's own `index.ts`/`repo.sqlite.ts` — the
 * composition root's `deps.ts` and `capability-inventory.ts` — zero test files anywhere. The one
 * route test that exercises workspace HTTP behavior (`admin-http/routes/workspace/__tests__/
 * create.test.ts`) substitutes `InMemoryWorkspaceRepo`; `get`/`list`/`update`/`delete` have no
 * route test at all. Mirrors `features/content-types/__tests__/integration/
 * repo.sqlite.integration.test.ts`'s pattern: a real temp-file `better-sqlite3` database, not
 * `:memory:`.
 */

function openTempContentDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-sqlite-"));
  const filePath = path.join(tmpDir, "content.db");
  const db = openContentDb(filePath);
  return { db, filePath, tmpDir };
}

test("insert -> restart-simulated (fresh repo instance against the same file) -> data still there", async () => {
  const { db, filePath, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteWorkspaceRepo(db);
    await repo.insert({ id: "ws-1", name: "Acme", slug: "acme", createdAt: "2026-07-15T00:00:00.000Z" });

    const dbAfterRestart = openContentDb(filePath);
    const repoAfterRestart = new SqliteWorkspaceRepo(dbAfterRestart);
    const found = await repoAfterRestart.findById("ws-1");
    assert.ok(found);
    assert.equal(found?.name, "Acme");
    assert.equal(found?.slug, "acme");
    assert.equal(found?.createdAt, "2026-07-15T00:00:00.000Z");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("findBySlug finds by slug, not by id, and returns null for an unknown slug", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteWorkspaceRepo(db);
    await repo.insert({ id: "ws-1", name: "Acme", slug: "acme", createdAt: "2026-07-15T00:00:00.000Z" });

    const bySlug = await repo.findBySlug("acme");
    assert.ok(bySlug);
    assert.equal(bySlug?.id, "ws-1");

    // The mutation this proves: if `findBySlug` ever matched on `id` instead of `slug` (a
    // copy-paste of `findById`'s condition), searching the row's OWN id as if it were a slug would
    // wrongly resolve.
    assert.equal(await repo.findBySlug("ws-1"), null, "the row's id must not also resolve as a slug");
    assert.equal(await repo.findBySlug("no-such-slug"), null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("list() returns every workspace row", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteWorkspaceRepo(db);
    await repo.insert({ id: "ws-1", name: "Acme", slug: "acme", createdAt: "2026-07-15T00:00:00.000Z" });
    await repo.insert({ id: "ws-2", name: "Globex", slug: "globex", createdAt: "2026-07-15T00:00:01.000Z" });

    const all = await repo.list();
    assert.equal(all.length, 2);
    assert.deepEqual(
      all.map((w) => w.slug).sort(),
      ["acme", "globex"]
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("update() changes only the targeted row's name/slug, leaving a sibling row untouched", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteWorkspaceRepo(db);
    await repo.insert({ id: "ws-1", name: "Acme", slug: "acme", createdAt: "2026-07-15T00:00:00.000Z" });
    await repo.insert({ id: "ws-2", name: "Globex", slug: "globex", createdAt: "2026-07-15T00:00:01.000Z" });

    // The mutation this proves: if `update`'s `.where(eq(workspaces.id, record.id))` were ever
    // dropped or mistargeted, this would rename every row (or the wrong row) instead of just ws-1.
    await repo.update({ id: "ws-1", name: "Acme Renamed", slug: "acme-renamed", createdAt: "2026-07-15T00:00:00.000Z" });

    const renamed = await repo.findById("ws-1");
    assert.equal(renamed?.name, "Acme Renamed");
    assert.equal(renamed?.slug, "acme-renamed");

    const sibling = await repo.findById("ws-2");
    assert.equal(sibling?.name, "Globex", "an update targeting ws-1 must not touch ws-2's row");
    assert.equal(sibling?.slug, "globex");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("delete() removes only the targeted row from real SQLite, leaving a sibling row untouched", async () => {
  const { db, filePath, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteWorkspaceRepo(db);
    await repo.insert({ id: "ws-1", name: "Acme", slug: "acme", createdAt: "2026-07-15T00:00:00.000Z" });
    await repo.insert({ id: "ws-2", name: "Globex", slug: "globex", createdAt: "2026-07-15T00:00:01.000Z" });

    await repo.delete("ws-1");

    // Query a FRESH handle against the same file — proves the row is actually gone from disk, not
    // merely absent from an in-process cache.
    const dbAfterRestart = openContentDb(filePath);
    const repoAfterRestart = new SqliteWorkspaceRepo(dbAfterRestart);
    assert.equal(await repoAfterRestart.findById("ws-1"), null, "the deleted row must not survive a restart");
    const sibling = await repoAfterRestart.findById("ws-2");
    assert.ok(sibling, "a delete targeting ws-1 must not remove ws-2's row");
    assert.equal(sibling?.name, "Globex");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("the schema's real UNIQUE constraint on slug is enforced by SQLite itself, not just application-level checking", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteWorkspaceRepo(db);
    await repo.insert({ id: "ws-1", name: "Acme", slug: "acme", createdAt: "2026-07-15T00:00:00.000Z" });

    // `createWorkspace` (the Jini package's write-service) checks `findBySlug` before inserting to
    // produce a friendly `WorkspaceConflictError` — this proves the DATABASE's own guarantee holds
    // independently, so a caller that skipped or raced that pre-check still cannot create two
    // workspace rows sharing one slug.
    await assert.rejects(
      repo.insert({ id: "ws-2", name: "Acme Two", slug: "acme", createdAt: "2026-07-15T00:00:01.000Z" }),
      /UNIQUE constraint failed/
    );

    const all = await repo.list();
    assert.equal(all.length, 1, "the rejected duplicate-slug insert must not leave a partial row behind");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
