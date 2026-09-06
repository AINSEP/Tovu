import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqlitePresentationSettingsRepo } from "../../repo.sqlite.js";

/**
 * @file Real SQLite persistence for `features/presentation` (this dispatch — closes a gap
 * confirmed by an exhaustive import-path search: `SqlitePresentationSettingsRepo` was, until now,
 * imported by exactly two files in the whole tree, `index.ts` and the composition root's
 * `deps.ts`/`capability-inventory.ts` — zero test files anywhere. Every route that touches
 * `presentation` (`get.ts`, `patch-active-theme.ts`, `pages.route.test.ts`) substitutes
 * `InMemoryPresentationSettingsRepo` instead, so the real Drizzle upsert/mapping logic below had
 * never actually run under a test. Mirrors `features/content-types/__tests__/integration/
 * repo.sqlite.integration.test.ts`'s pattern: a real temp-file `better-sqlite3` database, not
 * `:memory:`.
 */

function openTempContentDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "presentation-sqlite-"));
  const filePath = path.join(tmpDir, "content.db");
  const db = openContentDb(filePath);
  return { db, filePath, tmpDir };
}

test("save (insert) -> restart-simulated (fresh repo instance against the same file) -> data still there", async () => {
  const { db, filePath, tmpDir } = openTempContentDb();
  try {
    const repo = new SqlitePresentationSettingsRepo(db);
    await repo.save({ workspaceId: "ws-1", activeThemeId: "paper", updatedAt: "2026-07-15T00:00:00.000Z" });

    const dbAfterRestart = openContentDb(filePath);
    const repoAfterRestart = new SqlitePresentationSettingsRepo(dbAfterRestart);
    const found = await repoAfterRestart.findByWorkspaceId("ws-1");
    assert.ok(found);
    assert.equal(found?.activeThemeId, "paper");
    assert.equal(found?.updatedAt, "2026-07-15T00:00:00.000Z");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("findByWorkspaceId returns null for a workspace with no presentation-settings row", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const repo = new SqlitePresentationSettingsRepo(db);
    assert.equal(await repo.findByWorkspaceId("no-such-workspace"), null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("save() on an existing workspaceId upserts in place — one real UPDATE, not a duplicate row", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const repo = new SqlitePresentationSettingsRepo(db);
    await repo.save({ workspaceId: "ws-1", activeThemeId: "paper", updatedAt: "2026-07-15T00:00:00.000Z" });
    await repo.save({ workspaceId: "ws-1", activeThemeId: "atlas", updatedAt: "2026-07-16T00:00:00.000Z" });

    const found = await repo.findByWorkspaceId("ws-1");
    assert.equal(found?.activeThemeId, "atlas", "the second save must overwrite the first, not sit alongside it");
    assert.equal(found?.updatedAt, "2026-07-16T00:00:00.000Z");

    // The mutation this proves: if `onConflictDoUpdate`'s target/set were ever dropped or
    // mistargeted, this second insert would either throw (real UNIQUE PK violation on
    // `workspace_id`) or silently create a second row — `listAll()` would report 2, not 1.
    const all = await repo.listAll();
    assert.equal(all.length, 1, "one save-then-resave for the same workspace must leave exactly one row");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("workspace-scoping: findByWorkspaceId for ws-2 does not see ws-1's row, and listAll reports both", async () => {
  const { db, tmpDir } = openTempContentDb();
  try {
    const repo = new SqlitePresentationSettingsRepo(db);
    await repo.save({ workspaceId: "ws-1", activeThemeId: "paper", updatedAt: "2026-07-15T00:00:00.000Z" });
    await repo.save({ workspaceId: "ws-2", activeThemeId: "glassmorphic", updatedAt: "2026-07-15T00:00:01.000Z" });

    const ws1 = await repo.findByWorkspaceId("ws-1");
    const ws2 = await repo.findByWorkspaceId("ws-2");
    assert.equal(ws1?.activeThemeId, "paper");
    assert.equal(ws2?.activeThemeId, "glassmorphic");

    const all = await repo.listAll();
    assert.equal(all.length, 2);
    assert.deepEqual(
      all.map((r) => r.workspaceId).sort(),
      ["ws-1", "ws-2"]
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
