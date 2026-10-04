import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ContentTypeFieldDef } from "#src/features/content-types/index";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteEntryRepo } from "../../repo.sqlite.js";
import { createEntry } from "../../index.js";

/**
 * @file Real SQLite persistence for `features/entries` (this dispatch). Mirrors
 * `features/content-types/__tests__/integration/repo.sqlite.integration.test.ts`'s pattern and
 * rationale — see that file's header. Only the restart-against-a-real-file case lives here; the
 * repo contract (both dialects) is `repo.dialects.test.ts`.
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
 * `[]`. */
function fixedContentTypeLookup(workspaceId: string, key: string, fields: ContentTypeFieldDef[] = []) {
  return {
    findByKey: async (params: { workspaceId: string; key: string }) =>
      params.workspaceId === workspaceId && params.key === key
        ? { workspaceId, key, status: "active" as const, fields }
        : null,
  };
}

test("create -> restart-simulated (fresh repo instance against the same file) -> data still there", async () => {
  const { db, filePath, tmpDir } = openTempContentDb();
  try {
    const repo = new SqliteEntryRepo(db);
    const clock = { nowMs: () => Date.parse("2026-07-15T00:00:00.000Z") };
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
