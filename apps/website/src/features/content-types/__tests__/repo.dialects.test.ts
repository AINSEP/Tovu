import assert from "node:assert/strict";
import { test } from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentTypeListPort, ContentTypeRecord, ContentTypeRepoPort } from "../index.js";
import { contentTypeRepoFor } from "../repo.js";

/**
 * @file The content-type repo on every dialect through the kernel's matrix (`describeEachDialect`
 * + ONE factory: one query body serves every dialect).
 */

const WS = "ws-dialects";

function contentType(key: string, overrides: Partial<ContentTypeRecord> = {}): ContentTypeRecord {
  return {
    workspaceId: WS,
    key,
    label: `Label ${key}`,
    fields: [{ name: "servings", kind: "integer", required: false, queryable: true }],
    status: "active",
    version: 1,
    tombstonedAt: null,
    ...overrides,
  };
}

type Repo = ContentTypeRepoPort & ContentTypeListPort;

describeEachDialect<Repo>(
  "content-type repo",
  {
    tables: ["content_types", "content_type_revisions"],
    make: contentTypeRepoFor,
  },
  (makeRepo) => {
    test("save inserts, then a second save fully replaces the row", async () => {
      const repo = makeRepo();
      await repo.save(contentType("recipe"));
      assert.deepEqual(await repo.findByKey({ workspaceId: WS, key: "recipe" }), contentType("recipe"));
      const replaced = contentType("recipe", { label: "Changed", fields: [], version: 2, tombstonedAt: "2026-09-28T00:00:00.000Z" });
      await repo.save(replaced);
      assert.deepEqual(await repo.findByKey({ workspaceId: WS, key: "recipe" }), replaced);
      assert.equal((await repo.listByWorkspace({ workspaceId: WS })).length, 1);
    });

    test("findByKey misses an unknown key and another workspace's row", async () => {
      const repo = makeRepo();
      await repo.save(contentType("recipe"));
      assert.equal(await repo.findByKey({ workspaceId: WS, key: "nope" }), null);
      assert.equal(await repo.findByKey({ workspaceId: "other-ws", key: "recipe" }), null);
    });

    test("listByWorkspace returns only that workspace's rows", async () => {
      const repo = makeRepo();
      await repo.save(contentType("a"));
      await repo.save(contentType("b"));
      await repo.save(contentType("a", { workspaceId: "other-ws" }));
      const keys = (await repo.listByWorkspace({ workspaceId: WS })).map((row) => row.key).sort();
      assert.deepEqual(keys, ["a", "b"]);
      assert.deepEqual(await repo.listByWorkspace({ workspaceId: "empty-ws" }), []);
    });

    test("appendRevision writes without error, repeatedly", async () => {
      const repo = makeRepo();
      const revision = {
        contentTypeKey: "recipe",
        workspaceId: WS,
        op: "create",
        stateJson: contentType("recipe"),
        actorId: "a",
        principalKind: null,
        delegatedByWorkspaceId: null,
        delegatedById: null,
        recordedAt: "2026-09-28T00:00:00.000Z",
      } as unknown as Parameters<Repo["appendRevision"]>[0];
      await repo.appendRevision(revision);
      await repo.appendRevision({ ...revision, op: "update" });
    });

    test("a transaction's save + appendRevision roll back together; a nested one joins", async () => {
      const repo = makeRepo();
      await assert.rejects(
        repo.transaction(async () => {
          await repo.save(contentType("t1"));
          await repo.transaction(async () => {
            await repo.appendRevision({
              contentTypeKey: "t1",
              workspaceId: WS,
              op: "create",
              stateJson: contentType("t1"),
              actorId: "a",
              principalKind: null,
              delegatedByWorkspaceId: null,
              delegatedById: null,
              recordedAt: "2026-09-28T00:00:00.000Z",
            } as unknown as Parameters<Repo["appendRevision"]>[0]);
          });
          throw new Error("boom");
        }),
        /boom/
      );
      assert.equal(await repo.findByKey({ workspaceId: WS, key: "t1" }), null);
    });
  }
);
