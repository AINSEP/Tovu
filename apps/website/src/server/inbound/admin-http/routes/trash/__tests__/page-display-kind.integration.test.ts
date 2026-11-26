import type { ContentKernel } from "#src/platform/db/content-kernel";
import { tableExists } from "@jini-ai/db/kernel";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import { createMediaAccessEvidence } from "@jini-ai/cms/media/site/access-evidence";
import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

import { bindRemoveEntity, createTrashService, type TrashItem } from "@jini-ai/cms/trash";
import type { OutboxPort } from "@jini-ai/core/contracts/events";
import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { createPost, deletePost, SqlitePostRepo } from "#src/features/post/index";
import { createPostTrashAdapter } from "@jini-ai/cms/trash/site/adapters/post";
import { createContentDbTransactionRunner, SqliteTrashRepo } from "#src/features/trash/repo.sqlite";
import { removeEntityWithoutBlocker } from "@jini-ai/cms/trash/site/remove-without-blocker";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import type { TrashRouteDeps } from "#src/server/runtime/composition/modules/trash";
import { registerAdminTrashListRoute } from "#src/server/runtime/composition/modules/trash";
import { TRASH_RETENTION_DAYS } from "#src/server/runtime/composition/trash-retention";

/** Production wiring (site-deps/trash-adapters.ts): the post adapter's table probe runs on the same kernel it stores through. */
function postTrashAdapterOn(store: ContentKernel) {
  return createPostTrashAdapter({ store, tableExists: ({ table }) => tableExists({ kernel: store, table }) });
}

const WS = "workspace-1";
const AT = "2026-11-01T12:00:00.000Z";
const clock = { nowMs: () => Date.parse(AT), nowIso: () => AT };
const outbox: OutboxPort = {
  enqueue: async () => {}, claimPending: async () => [], markDelivered: async () => {}, markFailed: async () => {},
};

function harness(t: { after(fn: () => Promise<void>): void }) {
  const routeErrors = createRouteIncidentReporter().errors;
  const db = openContentDb(":memory:");
  db.$client.prepare("INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)").run(WS, WS, WS, AT);
  const kernel = contentKernel({ store: db });
  t.after(() => kernel.close());
  const postRepo = new SqlitePostRepo({ store: db, mediaAccessEvidence: createMediaAccessEvidence() });
  const trashRepo = new SqliteTrashRepo({ store: db });
  let seq = 0;
  const trash = createTrashService({
    repo: trashRepo,
    adapters: new Map([["post", postTrashAdapterOn(kernel)]]),
    idGen: { newId: () => `trash-${++seq}` },
    transaction: ({ work }) => createContentDbTransactionRunner({ store: db })(work),
    entityPolicy: ({ entityType }) => entityType === "post",
  }, { retentionDays: TRASH_RETENTION_DAYS });
  const remove = removeEntityWithoutBlocker({ remove: bindRemoveEntity({ trash, entityType: "post" }) });
  const app = express();
  const deps: TrashRouteDeps = {
    workspaceId: WS, clock, trash, registry: new Map(), db: kernel,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    userRepo: { list: async () => [] } as unknown as TrashRouteDeps["userRepo"],
  };
  registerAdminTrashListRoute({ errors: routeErrors, app, deps });
  return {
    kernel, postRepo, trashRepo, deps,
    async trashPost(kind: "page" | "post", id = kind) {
      await createPost({ deps: { repo: postRepo, clock }, input: { workspaceId: WS, id, kind, title: `Deleted ${kind}` } });
      await deletePost({ deps: { repo: postRepo, clock, outbox, remove }, input: { workspaceId: WS, id } });
      const row = await trashRepo.findByEntity({ workspaceId: WS, entityType: "post", entityId: id });
      assert.ok(row);
      return row;
    },
    async list() {
      const { res, capture } = createCapturingResponse();
      res.locals.principal = { id: "owner" };
      await extractRouteHandler(app, "get", "/api/admin/v1/workspaces/:workspaceId/trash")(
        { params: { workspaceId: WS }, query: {} }, res,
      );
      assert.equal(capture.statusCode, 200, JSON.stringify(capture.jsonBody));
      return capture.jsonBody as { items: { entityType: string; entityId: string; title: string; subtitle: string | null; displayKind?: string }[]; retentionDays?: number };
    },
  };
}

for (const kind of ["page", "post"] as const) {
  test(`real ${kind} deletion returns its display kind without changing the canonical trash identity`, async (t) => {
    const h = harness(t);
    const snapshot = await h.trashPost(kind);
    const { items } = await h.list();
    assert.equal(items.length, 1);
    assert.equal(items[0].entityType, "post");
    assert.equal(items[0].entityId, kind);
    assert.equal(items[0].title, snapshot.displayTitle);
    assert.equal(items[0].subtitle, snapshot.displaySubtitle);
    assert.equal(items[0].displayKind, kind);
  });
}

test("old snapshots recover kind from columns even when the post payload is corrupt", async (t) => {
  const h = harness(t);
  const snapshot = await h.trashPost("page");
  // Model the old snapshot contract independently of whatever new deletions capture.
  h.deps.trash = { ...h.deps.trash, list: async () => ({ items: [{ ...snapshot }], nextCursor: null }) };
  delete (snapshot as TrashItem & { displayKind?: string }).displayKind;
  await h.kernel.run((db) => db.updateTable("posts").set({ body_json: "broken-json" }).where("id", "=", "page").execute());
  assert.equal((await h.list()).items[0].displayKind, "page");
});

test("an old snapshot whose post no longer exists omits displayKind and stays listable", async (t) => {
  const h = harness(t);
  const snapshot = await h.trashPost("page");
  delete (snapshot as TrashItem & { displayKind?: string }).displayKind;
  h.deps.trash = { ...h.deps.trash, list: async () => ({ items: [snapshot], nextCursor: null }) };
  await h.kernel.run((db) => db.deleteFrom("posts").where("id", "=", "page").execute());
  const { items } = await h.list();
  assert.equal(items.length, 1);
  assert.equal(items[0].entityType, "post");
  assert.equal(Object.hasOwn(items[0], "displayKind"), false);
});

test("legacy subtype lookup never reads a post belonging to another workspace", async (t) => {
  const h = harness(t);
  const snapshot = await h.trashPost("page");
  await h.kernel.run((db) => db.deleteFrom("posts").where("id", "=", "page").execute());
  await h.postRepo.save({ workspaceId: "other-workspace", id: "page", kind: "page", title: "Private page", slug: "private-page",
    status: "draft", bodyFormat: "doc", bodyHtml: null, bodyJson: { type: "doc", content: [] }, updatedAt: AT, version: 1 });
  h.deps.trash = { ...h.deps.trash, list: async () => ({ items: [snapshot], nextCursor: "keep-cursor" }) };
  const { items } = await h.list();
  assert.equal(Object.hasOwn(items[0], "displayKind"), false);
});

test("unauthorized post snapshots are filtered before querying post subtypes", async (t) => {
  const h = harness(t);
  await h.trashPost("page");
  h.deps.authorize = async ({ permission }) => ({ allowed: permission === "content.read", reason: "test" });
  h.deps.db = { ...h.kernel, run: async () => { throw new Error("hidden posts must never trigger subtype reads"); } };
  assert.deepEqual((await h.list()).items, []);
});

test("the list response states the host's retention window, so the admin header never hard-codes it", async (t) => {
  const h = harness(t);
  // Asserted against the composed constant AND its current value: a drift either way is a visible copy change.
  assert.equal((await h.list()).retentionDays, TRASH_RETENTION_DAYS);
  assert.equal(TRASH_RETENTION_DAYS, 30);
});
