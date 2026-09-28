import assert from "node:assert/strict";
import { test } from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { PostRecord, PostRepoPort } from "../post.js";
import { PgPostRepo } from "../repo.pg.js";
import { SqlitePostRepo } from "../repo.sqlite.js";

/**
 * @file The post repo on every dialect through the kernel's matrix — the pattern a converted repo's
 * suite copies (`describeEachDialect` + one factory per dialect). The rule-of-two suites
 * (`post.*.test.ts`) cover the rest of `PostRepoPort` on memory, SQLite and PGlite.
 */

const WS = "ws-dialects";

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

describeEachDialect<PostRepoPort>(
  "post repo",
  {
    tables: ["posts", "post_revisions"],
    sqlite: (kernel) => new SqlitePostRepo(kernel),
    postgres: (kernel) => new PgPostRepo(kernel),
  },
  (makeRepo) => {
    test("a transaction's save + appendRevision roll back together; a nested one joins", async () => {
      const repo = makeRepo();
      await assert.rejects(
        repo.transaction(async () => {
          await repo.save(post("p1"));
          await repo.transaction(async () => {
            await repo.appendRevision({
              postId: "p1",
              workspaceId: WS,
              seq: 1,
              op: "create",
              stateJson: post("p1"),
              actorId: "a",
              recordedAt: "2026-09-28T00:00:00.000Z",
            });
          });
          throw new Error("boom");
        }),
        /boom/
      );
      assert.equal(await repo.findById({ workspaceId: WS, id: "p1" }), null);
      assert.deepEqual(await repo.listRevisions({ workspaceId: WS, postId: "p1" }), []);
    });

    test("saveIfVersion lands only on the expected version", async () => {
      const repo = makeRepo();
      await repo.save(post("p2"));
      assert.deepEqual(await repo.saveIfVersion({ record: post("p2", { title: "stale", version: 2 }), ifVersion: 9 }), {
        applied: false,
      });
      assert.deepEqual(await repo.saveIfVersion({ record: post("p2", { title: "new", version: 2 }), ifVersion: 1 }), {
        applied: true,
      });
      assert.equal((await repo.findById({ workspaceId: WS, id: "p2" }))?.title, "new");
    });
  }
);
