import assert from "node:assert/strict";
import { test } from "node:test";

import { describeEachDialect, type ContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentTypeListPort, ContentTypeRecord, ContentTypeRepoPort, ContentTypeRevisionInput } from "../index.js";
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

describeEachDialect<{ repo: Repo; kernel: ContentKernel }>(
  "content-type repo",
  {
    tables: ["content_types", "content_type_revisions"],
    make: (kernel) => ({ repo: contentTypeRepoFor(kernel), kernel }),
  },
  (makeRepo) => {
    test("save inserts, then a second save fully replaces the row", async () => {
      const { repo } = makeRepo();
      await repo.save(contentType("recipe"));
      assert.deepEqual(await repo.findByKey({ workspaceId: WS, key: "recipe" }), contentType("recipe"));
      const replaced = contentType("recipe", { label: "Changed", fields: [], version: 2, tombstonedAt: "2026-09-28T00:00:00.000Z" });
      await repo.save(replaced);
      assert.deepEqual(await repo.findByKey({ workspaceId: WS, key: "recipe" }), replaced);
      assert.equal((await repo.listByWorkspace({ workspaceId: WS })).length, 1);
    });

    test("findByKey misses an unknown key and another workspace's row", async () => {
      const { repo } = makeRepo();
      await repo.save(contentType("recipe"));
      assert.equal(await repo.findByKey({ workspaceId: WS, key: "nope" }), null);
      assert.equal(await repo.findByKey({ workspaceId: "other-ws", key: "recipe" }), null);
    });

    test("listByWorkspace returns only that workspace's rows", async () => {
      const { repo } = makeRepo();
      await repo.save(contentType("a"));
      await repo.save(contentType("b"));
      await repo.save(contentType("a", { workspaceId: "other-ws" }));
      const keys = (await repo.listByWorkspace({ workspaceId: WS })).map((row) => row.key).sort();
      assert.deepEqual(keys, ["a", "b"]);
      assert.deepEqual(await repo.listByWorkspace({ workspaceId: "empty-ws" }), []);
    });

    test("appendRevision persists both complete payloads", async () => {
      const { repo, kernel } = makeRepo();
      const revision: ContentTypeRevisionInput = {
        contentTypeKey: "recipe",
        workspaceId: WS,
        op: "register",
        stateJson: contentType("recipe"),
        actorId: "a",
        principalKind: null,
        delegatedByWorkspaceId: null,
        delegatedById: null,
        recordedAt: "2026-09-28T00:00:00.000Z",
      };
      await repo.appendRevision(revision);
      const changed: ContentTypeRevisionInput = { ...revision, op: "field-change", stateJson: contentType("recipe", { fields: [], version: 2 }), actorId: "b", principalKind: "agent" as const, delegatedByWorkspaceId: "delegate-ws", delegatedById: "delegate-actor", recordedAt: "2026-09-29T00:00:00.000Z" };
      await repo.appendRevision(changed);
      const rows = await kernel.run((db) => db.selectFrom("content_type_revisions").selectAll().orderBy("seq").execute());
      assert.deepEqual(rows.map((row) => ({
        contentTypeKey: row.content_type_key,
        workspaceId: row.workspace_id,
        op: row.op,
        stateJson: JSON.parse(row.state_json),
        actorId: row.actor_id,
        principalKind: row.principal_kind,
        delegatedByWorkspaceId: row.delegated_by_workspace_id,
        delegatedById: row.delegated_by_id,
        recordedAt: row.recorded_at,
      })), [revision, changed]);
    });

    test("the widget types read back carrying their envelope owner; every other type carries none", async () => {
      // `content_types` has no owner column: the owner of a code-registered type is a code fact
      // (`declared-owners.ts`), so the repo restores it on every read. Without it the entries
      // chokepoint would validate widget payloads under `ext.site` again.
      const { repo } = makeRepo();
      await repo.save(contentType("widget", { owner: "widget" }));
      await repo.save(contentType("widget_area", { owner: "widgets" }));
      await repo.save(contentType("recipe"));
      assert.equal((await repo.findByKey({ workspaceId: WS, key: "widget" }))?.owner, "widget");
      assert.equal((await repo.findByKey({ workspaceId: WS, key: "widget_area" }))?.owner, "widgets");
      const recipe = await repo.findByKey({ workspaceId: WS, key: "recipe" });
      assert.deepEqual(recipe, contentType("recipe"), "a type with no declared owner reads back with no owner key at all");
      const listed = await repo.listByWorkspace({ workspaceId: WS });
      assert.equal(listed.find((row) => row.key === "widget")?.owner, "widget");
    });

    test("saving an owner the schema cannot hold is refused, never silently dropped", async () => {
      const { repo } = makeRepo();
      await assert.rejects(
        repo.save(contentType("recipe", { owner: "widget" })),
        { message: "content type 'recipe' declares owner 'widget', but only these code-declared owners can be stored: widget=widget, widget_area=widgets" }
      );
      assert.equal(await repo.findByKey({ workspaceId: WS, key: "recipe" }), null);
    });

    test("a transaction's save + appendRevision roll back together; a nested one joins", async () => {
      const { repo, kernel } = makeRepo();
      await assert.rejects(
        repo.transaction({ fn: async () => {
          await repo.save(contentType("t1"));
          await repo.transaction({ fn: async () => {
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
          } });
          throw new Error("boom");
        } }),
        /boom/
      );
      assert.equal(await repo.findByKey({ workspaceId: WS, key: "t1" }), null);
      assert.deepEqual(await kernel.run((db) => db.selectFrom("content_type_revisions").selectAll().execute()), []);
    });
  }
);
