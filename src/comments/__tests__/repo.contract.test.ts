import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { declareDataModule } from "../../features/plugins/data-module";
import { InMemoryCommentRepo } from "../repo.memory";
import { SqliteCommentRepo } from "../repo.sqlite";
import { COMMENTS_DATA_MODULE } from "../types";
import type { CommentRepoPort } from "../ports";
import type { CommentRecord } from "../types";

/**
 * @file SPEC-033 — shared contract-test suite for `CommentRepoPort`, run against BOTH
 * `InMemoryCommentRepo` and `SqliteCommentRepo` (ADR-006 rule-of-two).
 */

const WORKSPACE_ID = "workspace-1";

function makeComment(overrides: Partial<CommentRecord> = {}): CommentRecord {
  return {
    id: "comment-1",
    workspaceId: WORKSPACE_ID,
    entryId: "entry-1",
    parentId: null,
    threadRootId: "comment-1",
    depth: 0,
    status: "pending",
    authorPrincipalId: null,
    authorName: "Visitor",
    authorEmail: "visitor@example.com",
    authorUrl: null,
    authorIpHash: "hash-1",
    bodyText: "Hello world",
    spamScore: null,
    spamProvider: null,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    version: 0,
    ...overrides,
  };
}

async function makeSqliteRepo(): Promise<CommentRepoPort> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-comments-"));
  const dbPath = path.join(dir, "content.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  const result = await declareDataModule(db, dbPath, COMMENTS_DATA_MODULE);
  if (!result.ok) throw new Error(`declareDataModule failed: ${JSON.stringify(result.error)}`);
  return new SqliteCommentRepo(db);
}

function runSuite(label: string, makeRepo: () => CommentRepoPort | Promise<CommentRepoPort>) {
  test(`[${label}] create() then findById() round-trips`, async () => {
    const repo = await makeRepo();
    await repo.create(makeComment());
    const found = await repo.findById({ workspaceId: WORKSPACE_ID, id: "comment-1" });
    assert.deepEqual(found, makeComment());
  });

  test(`[${label}] listThreadForEntry builds nested replies, approved-only by default`, async () => {
    const repo = await makeRepo();
    await repo.create(makeComment({ id: "root", status: "approved" }));
    await repo.create(makeComment({ id: "reply-1", parentId: "root", threadRootId: "root", depth: 1, status: "approved" }));
    await repo.create(makeComment({ id: "pending-reply", parentId: "root", threadRootId: "root", depth: 1, status: "pending" }));

    const thread = await repo.listThreadForEntry({ workspaceId: WORKSPACE_ID, entryId: "entry-1" });
    assert.equal(thread.length, 1);
    assert.equal(thread[0].comment.id, "root");
    assert.equal(thread[0].replies.length, 1, "the pending reply is excluded (approved-only default)");
    assert.equal(thread[0].replies[0].comment.id, "reply-1");
  });

  test(`[${label}] listThreadForEntry honors includeStatuses`, async () => {
    const repo = await makeRepo();
    await repo.create(makeComment({ id: "root", status: "pending" }));
    const thread = await repo.listThreadForEntry({ workspaceId: WORKSPACE_ID, entryId: "entry-1", includeStatuses: ["pending"] });
    assert.equal(thread.length, 1);
  });

  test(`[${label}] listModerationQueue is scoped by status and keyset-paginated`, async () => {
    const repo = await makeRepo();
    for (let i = 0; i < 5; i += 1) {
      await repo.create(makeComment({ id: `c-${i}`, createdAt: `2026-07-16T00:0${i}:00.000Z`, updatedAt: `2026-07-16T00:0${i}:00.000Z` }));
    }
    await repo.create(makeComment({ id: "approved-1", status: "approved" }));

    const page1 = await repo.listModerationQueue({ workspaceId: WORKSPACE_ID, status: "pending", limit: 2 });
    assert.equal(page1.items.length, 2);
    assert.deepEqual(page1.items.map((c) => c.id), ["c-0", "c-1"]);
    assert.ok(page1.nextCursor);

    const page2 = await repo.listModerationQueue({ workspaceId: WORKSPACE_ID, status: "pending", limit: 2, cursor: page1.nextCursor });
    assert.deepEqual(page2.items.map((c) => c.id), ["c-2", "c-3"]);

    const page3 = await repo.listModerationQueue({ workspaceId: WORKSPACE_ID, status: "pending", limit: 2, cursor: page2.nextCursor });
    assert.deepEqual(page3.items.map((c) => c.id), ["c-4"]);
    assert.equal(page3.nextCursor, null);
  });

  test(`[${label}] countByStatus scopes by workspace, status, and optionally entryId`, async () => {
    const repo = await makeRepo();
    await repo.create(makeComment({ id: "a", entryId: "entry-1" }));
    await repo.create(makeComment({ id: "b", entryId: "entry-2" }));
    await repo.create(makeComment({ id: "c", entryId: "entry-1", status: "approved" }));

    assert.equal(await repo.countByStatus({ workspaceId: WORKSPACE_ID, status: "pending" }), 2);
    assert.equal(await repo.countByStatus({ workspaceId: WORKSPACE_ID, status: "pending", entryId: "entry-1" }), 1);
  });

  test(`[${label}] applyModeration flips status and appends a moderation_log entry atomically`, async () => {
    const repo = await makeRepo();
    await repo.create(makeComment());
    const result = await repo.applyModeration({
      workspaceId: WORKSPACE_ID,
      id: "comment-1",
      expectedVersion: 0,
      action: "approve",
      toStatus: "approved",
      actorPrincipalId: "principal-1",
      note: null,
      at: "2026-07-16T01:00:00.000Z",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.record.status, "approved");
      assert.equal(result.record.version, 1);
      assert.equal(result.log.action, "approve");
      assert.equal(result.log.fromStatus, "pending");
      assert.equal(result.log.toStatus, "approved");
    }

    const found = await repo.findById({ workspaceId: WORKSPACE_ID, id: "comment-1" });
    assert.equal(found?.status, "approved");
  });

  test(`[${label}] applyModeration returns a conflict on a stale expectedVersion — never throws`, async () => {
    const repo = await makeRepo();
    await repo.create(makeComment());
    const result = await repo.applyModeration({
      workspaceId: WORKSPACE_ID,
      id: "comment-1",
      expectedVersion: 99,
      action: "approve",
      toStatus: "approved",
      actorPrincipalId: "principal-1",
      note: null,
      at: "2026-07-16T01:00:00.000Z",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "conflict");
      assert.equal(result.currentVersion, 0);
    }
    // Unchanged — the conflict must not have mutated anything.
    const found = await repo.findById({ workspaceId: WORKSPACE_ID, id: "comment-1" });
    assert.equal(found?.status, "pending");
    assert.equal(found?.version, 0);
  });

  test(`[${label}] applyModeration returns not-found for a nonexistent comment`, async () => {
    const repo = await makeRepo();
    const result = await repo.applyModeration({
      workspaceId: WORKSPACE_ID,
      id: "does-not-exist",
      expectedVersion: 0,
      action: "approve",
      toStatus: "approved",
      actorPrincipalId: "principal-1",
      note: null,
      at: "2026-07-16T01:00:00.000Z",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not-found");
  });

  test(`[${label}] purge() removes the row and returns a log entry; the comment is truly gone`, async () => {
    const repo = await makeRepo();
    await repo.create(makeComment());
    const result = await repo.purge({ workspaceId: WORKSPACE_ID, id: "comment-1", actorPrincipalId: "principal-1", note: "spam cleanup", at: "2026-07-16T02:00:00.000Z" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.log.action, "purge");
      assert.equal(result.log.commentId, "comment-1");
    }
    assert.equal(await repo.findById({ workspaceId: WORKSPACE_ID, id: "comment-1" }), null);
  });

  test(`[${label}] purge() returns not-found for a nonexistent comment`, async () => {
    const repo = await makeRepo();
    const result = await repo.purge({ workspaceId: WORKSPACE_ID, id: "does-not-exist", actorPrincipalId: "principal-1", note: null, at: "2026-07-16T02:00:00.000Z" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not-found");
  });

  // OQ-3 resolution (SPEC-035): create()'s optional submitLog co-persistence + listModerationLog().
  test(`[${label}] create() without a submitLog leaves the moderation log empty`, async () => {
    const repo = await makeRepo();
    await repo.create(makeComment());
    const log = await repo.listModerationLog({ workspaceId: WORKSPACE_ID, commentId: "comment-1" });
    assert.deepEqual(log, []);
  });

  test(`[${label}] create() with a submitLog persists both atomically; listModerationLog returns it`, async () => {
    const repo = await makeRepo();
    await repo.create(makeComment(), {
      id: "modlog-1",
      workspaceId: WORKSPACE_ID,
      commentId: "comment-1",
      actorPrincipalId: "system-comments-ingress",
      action: "submit",
      fromStatus: null,
      toStatus: "pending",
      at: "2026-07-16T00:00:00.000Z",
      note: null,
    });

    const found = await repo.findById({ workspaceId: WORKSPACE_ID, id: "comment-1" });
    assert.ok(found, "the comment row must exist");

    const log = await repo.listModerationLog({ workspaceId: WORKSPACE_ID, commentId: "comment-1" });
    assert.equal(log.length, 1);
    assert.equal(log[0].action, "submit");
    assert.equal(log[0].fromStatus, null);
    assert.equal(log[0].toStatus, "pending");
    assert.equal(log[0].actorPrincipalId, "system-comments-ingress");
  });
}

runSuite("memory", () => new InMemoryCommentRepo());
runSuite("sqlite", () => makeSqliteRepo());
