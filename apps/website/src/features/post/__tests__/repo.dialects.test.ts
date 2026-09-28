import assert from "node:assert/strict";
import { test } from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { PostRecord, PostRepoPort } from "../post.js";
import { postRepoFor } from "../repo.js";

/**
 * @file The post repo on every dialect through the kernel's matrix — the pattern a converted repo's
 * suite copies (`describeEachDialect` + ONE factory: one query body serves every dialect). The rule-of-two suites
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
    make: postRepoFor,
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

    test("booleans, JSON and autosave round-trip through the one body", async () => {
      const repo = makeRepo();
      const record = post("p3", { overridesThemePage: false, ext: { plugin: { on: true } }, seoExtJson: '{"t":1}' });
      await repo.save(record);
      const read = await repo.findById({ workspaceId: WS, id: "p3" });
      assert.equal(read?.overridesThemePage, false);
      assert.deepEqual(read?.ext, { plugin: { on: true } });
      assert.deepEqual(JSON.parse(read!.seoExtJson!), { t: 1 });
      await repo.save({ ...record, overridesThemePage: undefined, version: 2 });
      assert.equal((await repo.findById({ workspaceId: WS, id: "p3" }))?.overridesThemePage, null);
      const snapshot = { baseVersion: 2, title: "draft" } as unknown as Parameters<PostRepoPort["writeAutosave"]>[0]["snapshot"];
      assert.deepEqual(await repo.writeAutosave({ workspaceId: WS, id: "p3", snapshot }), { applied: true });
      assert.deepEqual(await repo.readAutosave({ workspaceId: WS, id: "p3" }), snapshot);
    });

    test("appendRevision chains previousId and listRevisions reads them back in order", async () => {
      const repo = makeRepo();
      const append = (seq: number) =>
        repo.appendRevision({
          postId: "p4",
          workspaceId: WS,
          seq,
          op: seq === 1 ? "create" : "update",
          stateJson: post("p4", { version: seq }),
          actorId: "a",
          recordedAt: "2026-09-28T00:00:00.000Z",
        });
      const first = await append(1);
      const second = await append(2);
      assert.equal(first.previousId, null);
      assert.equal(second.previousId, first.id);
      const revisions = await repo.listRevisions({ workspaceId: WS, postId: "p4" });
      assert.deepEqual(revisions.map((revision) => revision.seq), [1, 2]);
      assert.equal(revisions[1]?.stateJson.version, 2);
    });
  }
);
