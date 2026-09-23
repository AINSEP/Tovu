import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo } from "#src/features/post/index";
import type { PostRecord } from "#src/features/post/index";

import { createRecordStoreTrashAdapter } from "../adapters/record-store.js";
import { POST_ENTITY_TYPE } from "../adapters/post.js";

/**
 * @file `createRecordStoreTrashAdapter`'s purge rung, for the post configuration the hermetic
 * composition root (`server/runtime/composition/app.ts`) builds.
 *
 * `hardDelete` is OPTIONAL on this adapter and the post configuration omitted it until 2026-09-20,
 * because `InMemoryPostRepo` had no row removal. The stand-down that produced was honest — nothing
 * ever claimed to have purged what it had not — but it meant a Trash purge in the in-memory
 * composition could never complete: the sweeper released the lease and retried the same row on
 * every pass, forever. `PostRepoPort.hardDelete` exists now, so the omission has no premise left.
 *
 * Both branches are pinned here: an adapter WITH row removal purges, one WITHOUT still stands down.
 */

const WS = "workspace-1";
const AT = "2026-09-20T12:00:00.000Z";

function seed(): PostRecord {
  return {
    id: "post-1",
    workspaceId: WS,
    title: "Hello World",
    slug: "hello-world",
    bodyJson: { type: "doc", content: [] },
    status: "published",
    kind: "post",
    updatedAt: "2026-04-06T00:00:00.000Z",
    version: 3,
  };
}

/** The exact post configuration `app.ts` builds, with `hardDelete` supplied or withheld. */
function adapterOver(postRepo: InMemoryPostRepo, optional: { withHardDelete: boolean }) {
  return createRecordStoreTrashAdapter<PostRecord>({
    entityType: POST_ENTITY_TYPE,
    store: postRepo,
    isHidden: (record) => record.deletedAt !== undefined && record.deletedAt !== null,
    hidden: (record, at) => ({ ...record, deletedAt: at, updatedAt: at }),
    shown: (record, at) => ({ ...record, deletedAt: null, updatedAt: at }),
    ...(optional.withHardDelete ? { hardDelete: (required) => postRepo.hardDelete(required) } : {}),
  });
}

test("the post adapter purges for real once hardDelete is wired — the row and its ledger are gone", async () => {
  const postRepo = new InMemoryPostRepo([seed()]);
  const adapter = adapterOver(postRepo, { withHardDelete: true });
  const hidden = await adapter.hide({ workspaceId: WS, entityId: "post-1", at: AT, expectedVersion: 3 });
  assert.deepEqual(hidden, { ok: true, version: 4 });

  const outcome = await adapter.purge({ workspaceId: WS, entityId: "post-1", expectedVersion: 4 });

  assert.equal(outcome, "purged", "a purge that completed must say so, or the sweeper retries it forever");
  assert.equal(await postRepo.findById({ workspaceId: WS, id: "post-1" }), null, "the row must be gone");
  assert.deepEqual(await postRepo.listRevisions({ workspaceId: WS, postId: "post-1" }), []);
});

test("without hardDelete the same adapter still stands down rather than claiming a removal", async () => {
  const postRepo = new InMemoryPostRepo([seed()]);
  const adapter = adapterOver(postRepo, { withHardDelete: false });
  await adapter.hide({ workspaceId: WS, entityId: "post-1", at: AT, expectedVersion: 3 });

  const outcome = await adapter.purge({ workspaceId: WS, entityId: "post-1", expectedVersion: 4 });

  assert.equal(outcome, "version-changed", "no row removal means no purge — never a false 'purged'");
  assert.ok(await postRepo.findById({ workspaceId: WS, id: "post-1" }), "and the row is untouched");
});
