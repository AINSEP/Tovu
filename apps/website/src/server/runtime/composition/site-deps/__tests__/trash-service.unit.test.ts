import assert from "node:assert/strict";
import test from "node:test";
import type { TrashAdapter } from "@jini-ai/cms/trash";
import { TrashAdapterMissingError } from "@jini-ai/cms/trash";
import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteTrashRepo } from "#src/features/trash/index";
import { composeTrashService } from "../trash-service.js";

/**
 * @file The closures `composeTrashService` hands `createTrashService`: the row-id generator, the
 * transaction wrapper (which must drop the media access evidence for the LAZILY-read post repo once
 * the work settles, success or failure), the entity policy, and the `isInTrash` user lookup. Driven
 * through the composed `trash`/`isInTrash` over a real in-memory content db and the real SQLite trash
 * repo; only the entity adapter, the post repo and the evidence store are faked.
 */

type Required = Parameters<typeof composeTrashService>[0];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function adapter(entityType: string, hide: TrashAdapter["hide"], unhides: unknown[]): TrashAdapter {
  return {
    entityType,
    hide,
    unhide: async (required, optional) => { unhides.push([required, optional]); return { ok: true, version: 1 }; },
    purge: async () => "purged",
  };
}

function rig(options: { hide?: TrashAdapter["hide"] } = {}) {
  const db = openContentDb(":memory:");
  for (const ws of ["site-7", "site-8"]) {
    db.$client.prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)").run(ws, ws, ws, "2031-01-01T00:00:00.000Z");
  }
  const kernel = contentKernel({ store: db });
  const trashRepo = new SqliteTrashRepo({ store: kernel });
  const invalidations: unknown[] = [];
  const unhides: unknown[] = [];
  const posts = { name: "post-repo-late" };
  let postRepoReads = 0;
  const hide = options.hide ?? (async () => ({ ok: true as const, version: 4, priorMarker: "published" }));
  const deps = composeTrashService({
    kernel,
    trashRepo,
    trashAdapters: new Map([["widget", adapter("widget", hide, unhides)]]),
    postRepo: () => { postRepoReads += 1; return posts; },
    pluginTrashAdapter: {},
    workspaceId: "site-7",
    mediaAccessEvidence: { invalidate: (input: unknown) => { invalidations.push(input); } },
  } as unknown as Required);
  return { deps, trashRepo, invalidations, unhides, posts, postRepoReads: () => postRepoReads };
}

const trashInput = (entityId: string, entityType = "widget") => ({
  workspaceId: "site-7", entityType, entityId, at: "2031-02-03T04:05:06.000Z", expectedVersion: 3,
  actor: { principalId: "owner-1" }, display: { title: `Item ${entityId}` },
});

test("trash() indexes the hidden entity under a fresh random UUID per row", async () => {
  const { deps, trashRepo } = rig();
  assert.deepEqual(await deps.trash.trash(trashInput("w-1")), { ok: true, version: 4, priorMarker: "published" });
  await deps.trash.trash(trashInput("w-2"));
  const first = await trashRepo.findByEntity({ workspaceId: "site-7", entityType: "widget", entityId: "w-1" });
  const second = await trashRepo.findByEntity({ workspaceId: "site-7", entityType: "widget", entityId: "w-2" });
  assert.match(first?.id ?? "", UUID);
  assert.match(second?.id ?? "", UUID);
  assert.notEqual(first?.id, second?.id);
  assert.equal(first?.displayTitle, "Item w-1");
});

test("the transaction wrapper invalidates media evidence for the post repo read at settle time", async () => {
  const { deps, invalidations, posts, postRepoReads } = rig();
  assert.equal(postRepoReads(), 0, "the post repo is not read at composition time");
  await deps.trash.trash(trashInput("w-1"));
  assert.deepEqual(invalidations, [{ owner: posts }]);
  assert.equal(invalidations.length, 1);
  assert.equal((invalidations[0] as { owner: unknown }).owner, posts);
});

test("a failing trash still invalidates media evidence and rolls the index back", async () => {
  const { deps, trashRepo, invalidations, posts } = rig({ hide: async () => { throw new Error("adapter down"); } });
  await assert.rejects(deps.trash.trash(trashInput("w-9")), { message: "adapter down" });
  assert.deepEqual(invalidations, [{ owner: posts }]);
  assert.equal(await trashRepo.findByEntity({ workspaceId: "site-7", entityType: "widget", entityId: "w-9" }), null);
});

test("an entity type with no registered adapter is refused before any transaction runs", async () => {
  const { deps, invalidations } = rig();
  await assert.rejects(deps.trash.trash(trashInput("x-1", "gadget")), (error: unknown) =>
    error instanceof TrashAdapterMissingError && error.message === "trash: no adapter is registered for entity type 'gadget'");
  assert.deepEqual(invalidations, []);
});

test("restore() consults the entity policy for the item's type and unhides through its adapter", async () => {
  const { deps, trashRepo, unhides } = rig();
  await deps.trash.trash(trashInput("w-3"));
  const row = await trashRepo.findByEntity({ workspaceId: "site-7", entityType: "widget", entityId: "w-3" });
  assert.ok(row, "trashed row is indexed");
  const outcome = await deps.trash.restore({ workspaceId: "site-7", entityType: "widget", entityId: "w-3", at: "2031-02-04T00:00:00.000Z" });
  assert.equal(outcome, "restored");
  // The adapter unhides at the version and marker the hide recorded, not the caller's trash input.
  assert.deepEqual(unhides, [[{ workspaceId: "site-7", entityId: "w-3", at: "2031-02-04T00:00:00.000Z", expectedVersion: 4 }, { priorMarker: "published" }]]);
  assert.equal(await trashRepo.findByEntity({ workspaceId: "site-7", entityType: "widget", entityId: "w-3" }), null);
});

test("isInTrash answers from this workspace's user index rows only", async () => {
  const { deps, trashRepo } = rig();
  const row = { workspaceId: "site-7", entityType: "user", entityId: "member-2", trashedAt: "2031-02-03T00:00:00.000Z",
    purgeAfter: "2031-03-05T00:00:00.000Z", actorPrincipalId: "owner-1", actorPluginId: null, displayTitle: "Member",
    displaySubtitle: null, entityVersion: 1, priorMarker: null };
  await trashRepo.insert({ row: { ...row, id: "t-1" } });
  await trashRepo.insert({ row: { ...row, id: "t-2", workspaceId: "site-8", entityId: "member-3" } });
  await trashRepo.insert({ row: { ...row, id: "t-3", entityType: "widget", entityId: "member-4" } });
  assert.equal(await deps.isInTrash({ principalId: "member-2" }), true);
  assert.equal(await deps.isInTrash({ principalId: "member-3" }), false, "another workspace's row does not count");
  assert.equal(await deps.isInTrash({ principalId: "member-4" }), false, "a non-user row does not count");
  assert.equal(await deps.isInTrash({ principalId: "member-5" }), false);
});
