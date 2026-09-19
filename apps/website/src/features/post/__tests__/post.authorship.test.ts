import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { createPost, updatePost, type PostRecord, type PostRepoPort } from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { SqlitePostRepo } from "../repo.sqlite.js";

/**
 * @file Authorship attribution (2026-09-18) — `posts.created_by_principal_id`/`created_at`
 * (migration `0065_mature_forge`).
 *
 * Three requirements, proven against BOTH `PostRepoPort` adapters (rule-of-two, same discipline
 * `repo.save-if-version.test.ts` already applies to `saveIfVersion`):
 *  1. `createPost` stamps both fields from the same `actorId`/clock `createPost` already threads
 *     for the revision ledger — no second way to learn who the caller is.
 *  2. An `actorId`-less `createPost` call stores `NULL`, never a fabricated value (unlike
 *     `post_revisions.actor_id`, which fabricates `SYSTEM_ACTOR_ID` for the same omission — see
 *     `posts.created_by_principal_id`'s own schema doc for why this column does not).
 *  3. `updatePost` never touches either field, no matter what `actorId` the update call itself
 *     carries — attribution is write-once, set only at creation.
 */

function openTempSqliteRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "post-authorship-sqlite-"));
  const db = openContentDb(path.join(tmpDir, "content.db"));
  return { repo: new SqlitePostRepo(db), cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }) };
}

/** Runs the same behavioral contract against both `PostRepoPort` adapters. */
function runAuthorshipContract(
  name: string,
  withRepo: () => Promise<{ repo: PostRepoPort; teardown: () => void }>
) {
  test(`createPost stamps createdByPrincipalId/createdAt from actorId + clock (${name})`, async () => {
    const { repo, teardown } = await withRepo();
    try {
      const clock = { nowIso: () => "2026-09-18T00:00:00.000Z" };
      const result = await createPost({
        deps: { repo, clock },
        input: { workspaceId: "ws-1", id: "post-1", title: "Hello", actorId: "principal-1" },
      });

      assert.equal(result.post.createdByPrincipalId, "principal-1");
      assert.equal(result.post.createdAt, "2026-09-18T00:00:00.000Z");

      const stored = await repo.findById({ workspaceId: "ws-1", id: "post-1" });
      assert.equal(stored?.createdByPrincipalId, "principal-1");
      assert.equal(stored?.createdAt, "2026-09-18T00:00:00.000Z");
    } finally {
      teardown();
    }
  });

  test(`createPost stores NULL createdByPrincipalId when actorId is omitted — never a fabricated value (${name})`, async () => {
    const { repo, teardown } = await withRepo();
    try {
      const clock = { nowIso: () => "2026-09-18T00:00:00.000Z" };
      const result = await createPost({
        deps: { repo, clock },
        input: { workspaceId: "ws-1", id: "post-2", title: "No known author" },
      });

      assert.equal(result.post.createdByPrincipalId, null);
      assert.notEqual(result.post.createdByPrincipalId, "system");

      const stored = await repo.findById({ workspaceId: "ws-1", id: "post-2" });
      assert.equal(stored?.createdByPrincipalId, null);
    } finally {
      teardown();
    }
  });

  test(`updatePost never changes createdByPrincipalId or createdAt (${name})`, async () => {
    const { repo, teardown } = await withRepo();
    try {
      const createClock = { nowIso: () => "2026-09-18T00:00:00.000Z" };
      await createPost({
        deps: { repo, clock: createClock },
        input: { workspaceId: "ws-1", id: "post-3", title: "Original", actorId: "principal-1" },
      });

      const updateClock = { nowIso: () => "2026-09-19T00:00:00.000Z" };
      const noopOutbox = {
        enqueue: async () => {},
        claimPending: async () => [],
        markDelivered: async () => {},
        markFailed: async () => {},
      };
      const result = await updatePost({
        deps: { repo, clock: updateClock, outbox: noopOutbox },
        input: {
          workspaceId: "ws-1",
          id: "post-3",
          title: "Edited by someone else",
          slug: "post-3",
          bodyJson: { type: "doc", content: [] },
          status: "draft",
          // A different actor updates the post — this must attribute the REVISION, never re-stamp
          // who created the row.
          actorId: "principal-2",
        },
      });

      assert.equal(result.post.createdByPrincipalId, "principal-1");
      assert.equal(result.post.createdAt, "2026-09-18T00:00:00.000Z");

      const stored = await repo.findById({ workspaceId: "ws-1", id: "post-3" });
      assert.equal(stored?.createdByPrincipalId, "principal-1");
      assert.equal(stored?.createdAt, "2026-09-18T00:00:00.000Z");
    } finally {
      teardown();
    }
  });
}

runAuthorshipContract("InMemoryPostRepo", async () => ({
  repo: new InMemoryPostRepo([]),
  teardown: () => {},
}));

runAuthorshipContract("SqlitePostRepo", async () => {
  const { repo, cleanup } = openTempSqliteRepo();
  return { repo, teardown: cleanup };
});
