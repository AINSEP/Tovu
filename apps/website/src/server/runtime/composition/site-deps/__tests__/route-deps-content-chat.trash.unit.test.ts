import assert from "node:assert/strict";
import test from "node:test";
import { PostValidationError } from "@jini-ai/cms/posts/post";
import { restorePostForward } from "@jini-ai/cms/posts/post-trash";
import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { openChatDb } from "#src/platform/db/sqlite/chat-db";
import { sanitizeShareDatabase } from "#src/server/runtime/composition/site-portability";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import { routeDepsChatAgents, routeDepsContentTrash } from "../route-deps-content-chat.js";

/**
 * @file `routeDepsContentTrash`: the per-domain removal ports (each pinned to its own entity type), the
 * forget ports, the 60-day sweep (purges inside the trash transaction, policy read from the adapter
 * map), the live `isTrashableEntityType`, the widget post writes (the site's reserved segments win
 * over the caller's deps) and the shared instances handed through unchanged. Also
 * `routeDepsChatAgents.chatBulkDeletionFor`, whose clock is read on every preview, not at assembly.
 * The trash service, trash repo and adapters are recording fakes; the content and chat dbs are real
 * in-memory SQLite.
 */

type TrashRequired = Parameters<typeof routeDepsContentTrash>[0];
type ChatRequired = Parameters<typeof routeDepsChatAgents>[0];
type Adapter = { purge: (input: unknown) => Promise<string> };

function trashRig() {
  const trashed: unknown[] = [];
  const forgotten: unknown[] = [];
  const purged: unknown[] = [];
  const deletedRows: unknown[] = [];
  let transactions = 0;
  const trash = { trash: async (input: unknown, optional: unknown) => { trashed.push([input, optional]); return { ok: true, version: 2 }; } };
  const claims = [{ id: "t-1", workspaceId: "site-7", entityType: "widget" }, { id: "t-2", workspaceId: "site-7", entityType: "gone-kind" }];
  const trashRepo = {
    deleteByEntity: async (input: unknown) => { forgotten.push(input); },
    claimDue: async () => claims,
    findByIds: async ({ ids }: { ids: string[] }) => ids.map(id => ({ id, workspaceId: "site-7", entityId: `entity-${id}`, entityVersion: 5 })),
    deleteById: async (input: unknown) => { deletedRows.push(input); },
  };
  const trashAdapters = new Map<string, Adapter>([["widget", { purge: async (input) => { purged.push(input); return "purged"; } }]]);
  const shared = { registry: { name: "registry-1" }, db: { name: "trash-db-1" }, postRepo: { name: "posts-1" }, mediaAccessEvidence: { name: "evidence-1" },
    pluginExports: { name: "exports-1" }, assistantAgentInventory: { name: "agents-1" } };
  const deps = routeDepsContentTrash({
    ...shared,
    resolvedSiteBinding: { dir: "/nonexistent/site-7", name: "site-7" },
    kernel: contentKernel({ store: openContentDb(":memory:") }),
    workspaceId: "site-7",
    postSearchBackfillReady: Promise.resolve(),
    trashRegistry: shared.registry,
    sqliteTrashDb: shared.db,
    trashRepo,
    trashAdapters,
    trashTransaction: async (work: () => Promise<unknown>) => { transactions += 1; return work(); },
    trash,
  } as unknown as TrashRequired);
  return { deps, shared, trash, trashed, forgotten, purged, deletedRows, trashAdapters, transactions: () => transactions };
}

const removal = (id: string) => ({ workspaceId: "site-7", id, actor: { principalId: "owner-1" }, display: { title: `Title ${id}` }, at: "2031-02-03T04:05:06.000Z", expectedVersion: 4 });
const trashedAs = (entityType: string, id: string) => ({ workspaceId: "site-7", entityType, entityId: id, actor: { principalId: "owner-1" }, display: { title: `Title ${id}` }, at: "2031-02-03T04:05:06.000Z", expectedVersion: 4 });

// Mutations: `removeComment` binds POST_ENTITY_TYPE (l.93); `removeWidget` uses `bindRemoveEntity({ trash, entityType: "widget" })`
// (l.103, the prior marker is dropped); `removeRedirect` binds MEDIA_ENTITY_TYPE (l.101).
test("each removal port trashes only its own entity type, and the widget port carries its prior marker", async () => {
  const { deps, trashed } = trashRig();
  assert.deepEqual(await deps.removePost(removal("p-1")), { ok: true, version: 2 });
  await deps.removeComment(removal("c-1"));
  await deps.removeMedia(removal("m-1"));
  await deps.removeRedirect(removal("r-1"));
  await deps.removeWidget({ ...removal("w-1"), priorMarker: "published" });
  assert.deepEqual(trashed, [
    [trashedAs("post", "p-1"), {}],
    [trashedAs("comment", "c-1"), {}],
    [trashedAs("media", "m-1"), {}],
    [trashedAs("redirect", "r-1"), {}],
    [trashedAs("widget", "w-1"), { priorMarker: "published" }],
  ]);
});

// Mutation: `forgetRemovedPost` binds MEDIA_ENTITY_TYPE (l.110).
test("forgetRemovedMedia and forgetRemovedPost drop the trash row of their own entity type", async () => {
  const { deps, forgotten } = trashRig();
  await deps.forgetRemovedMedia({ workspaceId: "site-7", id: "m-2" });
  await deps.forgetRemovedPost({ workspaceId: "site-7", id: "p-2" });
  assert.deepEqual(forgotten, [{ workspaceId: "site-7", entityType: "media", entityId: "m-2" }, { workspaceId: "site-7", entityType: "post", entityId: "p-2" }]);
});

// Mutations: `transaction: ({ work }) => work()` (l.119, bypasses the trash transaction); `entityPolicy: () => false` (l.120).
test("sweepTrash purges an installed kind inside the trash transaction and leaves an uninstalled kind's item listed", async () => {
  const { deps, purged, deletedRows, transactions } = trashRig();
  const report = await deps.sweepTrash({ workspaceId: "site-7", now: "2031-04-05T00:00:00.000Z", limit: 10 });
  assert.deepEqual(report, { claimed: 2, purged: 1, results: [{ id: "t-1", outcome: "purged" }, { id: "t-2", outcome: "adapter-unavailable" }] });
  assert.deepEqual(purged, [{ workspaceId: "site-7", entityId: "entity-t-1", expectedVersion: 5 }]);
  assert.deepEqual(deletedRows, [{ workspaceId: "site-7", id: "t-1" }]);
  assert.equal(transactions(), 1, "the one purge ran inside the trash transaction");
});

// Mutation: l.123 snapshots the map at assembly (`isTrashableEntityType: (known => ({ entityType }) => known.has(entityType))(new Set(trashAdapters.keys()))`).
test("isTrashableEntityType reads the adapter map on every call, so a kind registered after assembly is trashable", () => {
  const { deps, trashAdapters } = trashRig();
  assert.equal(deps.isTrashableEntityType({ entityType: "redirect" }), false);
  trashAdapters.set("redirect", { purge: async () => "purged" });
  assert.equal(deps.isTrashableEntityType({ entityType: "redirect" }), true);
  assert.equal(deps.isTrashableEntityType({ entityType: "widget" }), true);
});

// Mutation: l.113 lets the caller's deps win (`deps: { reservedSegments: RESERVED_SEGMENTS, postPublicPath, isDeepStrictEqual, ...required.deps }`).
test("a widget post write validates the new slug against the site's reserved segments, whatever the caller passed", async () => {
  const { deps } = trashRig();
  const page = buildPostRecord({ id: "page-1", workspaceId: "site-7", kind: "page", slug: "about", title: "About", version: 3 });
  const updatePost = deps.widgetPostWrites.updatePost as unknown as (required: { deps: Record<string, unknown>; input: Record<string, unknown> }) => Promise<unknown>;
  await assert.rejects(updatePost({
    deps: { repo: { findById: async () => page }, reservedSegments: new Set<string>() },
    input: { workspaceId: "site-7", id: "page-1", title: "About", slug: "admin", expectedVersion: 3 },
  }), (error: unknown) => error instanceof PostValidationError && error.message === "slug 'admin' is reserved");
});

// Mutations: `postGoLiveCandidates: undefined` (l.129); `db: trashRegistry` (l.127); `siteBackupSanitize` dropped (l.77).
test("the shared stores and ports are handed to the routes unchanged", () => {
  const { deps, shared, trash } = trashRig();
  assert.equal(deps.workspaceId, "site-7");
  assert.equal(deps.trash, trash);
  assert.equal(deps.registry, shared.registry);
  assert.equal(deps.db, shared.db);
  assert.equal(deps.postRepo, shared.postRepo);
  assert.equal(deps.postGoLiveCandidates, shared.postRepo);
  assert.equal(deps.mediaAccessEvidence, shared.mediaAccessEvidence);
  assert.equal(deps.pluginExports, shared.pluginExports);
  assert.equal(deps.assistantAgentInventory, shared.assistantAgentInventory);
  assert.equal(deps.siteBackupSanitize, sanitizeShareDatabase);
  assert.equal(deps.widgetPostWrites.restorePostForward, restorePostForward);
});

/** A chat whose one failed run may still be recovered until 5000 ms. */
function seedRecoverableChat(store: ReturnType<typeof openChatDb>): void {
  store.prepare("INSERT INTO ai_chats (id, scope_id, owner_kind, owner_id, title, created_at, updated_at) VALUES ('chat-1', 'site-7', 'user', 'owner-1', 'Plan', 100, 100)").run();
  store.prepare("INSERT INTO ai_chat_messages (id, conversation_id, role, content, run_id, run_status, position, created_at) VALUES ('msg-1', 'chat-1', 'assistant', 'hi', 'run-1', 'failed', 0, 100)").run();
  store.prepare("INSERT INTO assistant_run_attempts (message_id, engine, accepted_json, recovery_deadline, attempt_started_at, last_progress_at) VALUES ('msg-1', 'local', '{}', 5000, 100, 100)").run();
}

// Mutation: l.155 reads the clock once at assembly (`now: (at => () => at)(clock.nowMs())`).
test("chatBulkDeletionFor reads the clock on every preview: a chat kept as recoverable becomes deletable once its deadline passes", async () => {
  const chat = openChatDb({ filePath: ":memory:" });
  seedRecoverableChat(chat);
  let nowMs = 1_000;
  const kernel = contentKernel({ store: openContentDb(":memory:") });
  const assembled = routeDepsChatAgents({ kernel, chat, clock: { nowMs: () => nowMs, nowIso: () => "2031-02-03T04:05:06.000Z" }, outbox: {}, entryRefsRepo: {}, entryRepo: {},
    tracker: {}, postRepo: {}, pluginExports: { validateHtml: async () => [] } } as unknown as ChatRequired);
  const deletion = assembled.chatBulkDeletionFor({ scope: { scopeId: "site-7", ownerKind: "user", ownerId: "owner-1" }, openConversations: async () => new Set<string>() });
  const early = await deletion.preview({ before: 200 });
  assert.deepEqual([early.ids, early.kept], [[], [{ id: "chat-1", title: "Plan", reason: "recoverable" }]]);
  nowMs = 6_000;
  const late = await deletion.preview({ before: 200 });
  assert.deepEqual([late.ids, late.kept], [["chat-1"], []]);
  chat.close();
});
