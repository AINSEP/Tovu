import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { PostRecord } from "#src/features/post/post";
import { PgPostRepo } from "#src/features/post/repo.pg";
import { SqlitePostRepo } from "#src/features/post/repo.sqlite";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { openPgliteContentStore } from "../content-store.js";

/**
 * @file The PGlite content store's own guarantees, beyond the post-repo contract suites: a real
 * transaction that repo calls join (and roll back with), the one-time import from `content.db` that
 * leaves `content.db` untouched, and data that survives closing and reopening the data dir.
 */

const WS = "ws-1";

function post(id: string, overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id,
    workspaceId: WS,
    title: `Title ${id}`,
    slug: id,
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "draft",
    kind: "post",
    updatedAt: "2026-09-28T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

test("a repo call inside transaction() joins it instead of waiting on PGlite's lock, and a throw rolls both writes back", async () => {
  const store = openPgliteContentStore({});
  try {
    const repo = new PgPostRepo(store);
    await repo.transaction(async () => {
      await repo.save(post("kept"));
      await repo.appendRevision({ postId: "kept", workspaceId: WS, seq: 1, op: "create", stateJson: post("kept"), actorId: "a", recordedAt: "2026-09-28T00:00:00.000Z" });
    });
    await assert.rejects(
      repo.transaction(async () => {
        await repo.save(post("rolled-back"));
        throw new Error("boom");
      }),
      /boom/
    );
    assert.deepEqual((await repo.list({ workspaceId: WS })).map((p) => p.id), ["kept"]);
    assert.equal((await repo.listRevisions({ workspaceId: WS, postId: "kept" })).length, 1);
  } finally {
    await store.close();
  }
});

test("first boot imports content.db's posts; edits land only in PGlite and survive a reopen", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pglite-content-store-"));
  const sqlite = openContentDb(path.join(tmp, "content.db"));
  try {
    const sqliteRepo = new SqlitePostRepo(sqlite);
    await sqliteRepo.save(post("from-sqlite", { title: "Imported" }));
    const dataDir = path.join(tmp, "pglite", "content");

    const first = openPgliteContentStore({ dataDir, importFrom: sqlite });
    const firstRepo = new PgPostRepo(first);
    assert.equal((await firstRepo.findById({ workspaceId: WS, id: "from-sqlite" }))?.title, "Imported");
    await firstRepo.save(post("made-on-pglite"));
    await first.close();

    const second = openPgliteContentStore({ dataDir, importFrom: sqlite });
    const ids = (await new PgPostRepo(second).list({ workspaceId: WS })).map((p) => p.id).sort();
    await second.close();

    assert.deepEqual(ids, ["from-sqlite", "made-on-pglite"], "reopened data dir keeps both rows, imported once");
    assert.deepEqual((await sqliteRepo.list({ workspaceId: WS })).map((p) => p.id), ["from-sqlite"], "content.db is never written");
  } finally {
    sqlite.$client.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
