import assert from "node:assert/strict";
import { test } from "node:test";

import { sql } from "kysely";

import { describeEachDialect, heldUntil } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { CommentRepoPort } from "../ports.js";
import { commentRepoFor } from "../repo.js";
import type { CommentRecord } from "../types.js";

/**
 * @file The comments repo on every dialect through the kernel's matrix. The two `p_comments__*`
 * tables are dataModule tables, absent from the migrated schema, and the real install
 * (`data-module-install.ts`) runs SQLite-only DDL — so `make` creates the same columns with
 * portable DDL on each dialect. Moving the install to the kernel is plan slice P1's job.
 */

const WS = "ws-dialects";

const CREATE_TABLES = [
  sql`DROP TABLE IF EXISTS p_comments__comments`,
  sql`DROP TABLE IF EXISTS p_comments__moderation_log`,
  sql`CREATE TABLE p_comments__comments (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, entry_id TEXT NOT NULL, parent_id TEXT,
    thread_root_id TEXT NOT NULL, depth INTEGER NOT NULL, status TEXT NOT NULL,
    author_principal_id TEXT, author_name TEXT NOT NULL, author_email TEXT, author_url TEXT,
    author_ip_hash TEXT, body_text TEXT NOT NULL, spam_score DOUBLE PRECISION, spam_provider TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL)`,
  sql`CREATE TABLE p_comments__moderation_log (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, comment_id TEXT NOT NULL,
    actor_principal_id TEXT NOT NULL, action TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL,
    at TEXT NOT NULL, note TEXT)`,
];

function comment(id: string, overrides: Partial<CommentRecord> = {}): CommentRecord {
  return {
    id,
    workspaceId: WS,
    entryId: "entry-1",
    parentId: null,
    threadRootId: id,
    depth: 0,
    status: "pending",
    authorPrincipalId: null,
    authorName: "Visitor",
    authorEmail: null,
    authorUrl: null,
    authorIpHash: null,
    bodyText: "Hello",
    spamScore: 0.25,
    spamProvider: null,
    createdAt: "2026-09-28T00:00:00.000Z",
    updatedAt: "2026-09-28T00:00:00.000Z",
    version: 0,
    ...overrides,
  };
}

describeEachDialect<CommentRepoPort>(
  "comments repo",
  {
    tables: [],
    make: (kernel) => {
      const pending = CREATE_TABLES.reduce((chain, statement) => chain.then(() => kernel.execute(statement)), Promise.resolve());
      pending.catch(() => {});
      return commentRepoFor(heldUntil(kernel, pending));
    },
  },
  (makeRepo) => {
    test("create round-trips, with nulls and a real spam score", async () => {
      const repo = makeRepo();
      await repo.create(comment("c1"));
      assert.deepEqual(await repo.findById({ workspaceId: WS, id: "c1" }), comment("c1"));
      assert.equal(await repo.findById({ workspaceId: "other", id: "c1" }), null);
    });

    test("create with a submit log is atomic: a duplicate log id rolls the comment back", async () => {
      const repo = makeRepo();
      const log = (commentId: string) => ({
        id: "log-dup",
        workspaceId: WS,
        commentId,
        actorPrincipalId: "visitor",
        action: "submit" as const,
        fromStatus: null,
        toStatus: "pending" as const,
        at: "2026-09-28T00:00:00.000Z",
        note: null,
      });
      await repo.create(comment("c1"), log("c1"));
      await assert.rejects(repo.create(comment("c2"), log("c2")));
      assert.equal(await repo.findById({ workspaceId: WS, id: "c2" }), null);
      assert.equal((await repo.listModerationLog({ workspaceId: WS, commentId: "c1" })).length, 1);
    });

    test("the moderation queue is keyset-paginated and countByStatus scopes by entry", async () => {
      const repo = makeRepo();
      for (let i = 0; i < 5; i += 1) {
        await repo.create(comment(`c${i}`, { entryId: i < 3 ? "e1" : "e2", createdAt: `2026-09-28T00:0${i}:00.000Z` }));
      }
      await repo.create(comment("same-time", { createdAt: "2026-09-28T00:04:00.000Z" }));
      const page1 = await repo.listModerationQueue({ workspaceId: WS, status: "pending", limit: 2 });
      assert.deepEqual(page1.items.map((c) => c.id), ["c0", "c1"]);
      const page2 = await repo.listModerationQueue({ workspaceId: WS, status: "pending", limit: 2, cursor: page1.nextCursor });
      assert.deepEqual(page2.items.map((c) => c.id), ["c2", "c3"]);
      const page3 = await repo.listModerationQueue({ workspaceId: WS, status: "pending", limit: 2, cursor: page2.nextCursor });
      assert.deepEqual(page3.items.map((c) => c.id), ["c4", "same-time"]);
      assert.equal(page3.nextCursor, null);
      assert.equal(await repo.countByStatus({ workspaceId: WS, status: "pending" }), 6);
      assert.equal(await repo.countByStatus({ workspaceId: WS, status: "pending", entryId: "e1" }), 3);
    });

    test("listThreadForEntry nests replies and an empty status list yields nothing", async () => {
      const repo = makeRepo();
      await repo.create(comment("root", { status: "approved" }));
      await repo.create(comment("reply", { parentId: "root", threadRootId: "root", depth: 1, status: "approved", createdAt: "2026-09-28T00:01:00.000Z" }));
      const thread = await repo.listThreadForEntry({ workspaceId: WS, entryId: "entry-1" });
      assert.deepEqual(thread.map((n) => [n.comment.id, n.replies.map((r) => r.comment.id)]), [["root", ["reply"]]]);
      assert.deepEqual(await repo.listThreadForEntry({ workspaceId: WS, entryId: "entry-1", includeStatuses: [] }), []);
    });

    test("applyModeration bumps the version once, logs it, and reports conflict and not-found", async () => {
      const repo = makeRepo();
      await repo.create(comment("c1"));
      const moderation = { workspaceId: WS, id: "c1", expectedVersion: 0, action: "approve" as const, toStatus: "approved" as const, actorPrincipalId: "admin", note: null, at: "2026-09-28T01:00:00.000Z" };
      const ok = await repo.applyModeration(moderation);
      assert.ok(ok.ok && ok.record.status === "approved" && ok.record.version === 1);
      assert.deepEqual(await repo.applyModeration(moderation), { ok: false, reason: "conflict", currentVersion: 1 });
      assert.deepEqual(await repo.applyModeration({ ...moderation, id: "missing" }), { ok: false, reason: "not-found" });
      const log = await repo.listModerationLog({ workspaceId: WS, commentId: "c1" });
      assert.deepEqual(log.map((entry) => [entry.action, entry.fromStatus, entry.toStatus]), [["approve", "pending", "approved"]]);
    });

    test("purge deletes the comment and keeps a purge log row", async () => {
      const repo = makeRepo();
      await repo.create(comment("c1"));
      const purged = await repo.purge({ workspaceId: WS, id: "c1", actorPrincipalId: "admin", note: "spam", at: "2026-09-28T02:00:00.000Z" });
      assert.ok(purged.ok);
      assert.equal(await repo.findById({ workspaceId: WS, id: "c1" }), null);
      assert.deepEqual((await repo.listModerationLog({ workspaceId: WS, commentId: "c1" })).map((e) => e.action), ["purge"]);
      assert.deepEqual(await repo.purge({ workspaceId: WS, id: "c1", actorPrincipalId: "admin", note: null, at: "2026-09-28T03:00:00.000Z" }), { ok: false, reason: "not-found" });
    });
  }
);
