import assert from "node:assert/strict";
import test from "node:test";

import type { OutboxPort } from "@jini-ai/cms/core";
import {
  PostConflictError,
  PostNotFoundError,
  PostVersionConflictError,
  updatePost,
  type UpdatePostInput,
} from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";

/**
 * @file Optimistic-concurrency guard for `updatePost` (worklist item 10, 2026-09-06).
 *
 * The bug this suite exists to catch: `updatePost` did a read-modify-write — `findById`, then
 * `save()` with `version: existing.version + 1` — and compared that version against nothing. Two
 * operators who both opened the same post at version 1 therefore both saved successfully, and the
 * second silently erased the first's document. Last write wins, no warning, no conflict.
 *
 * The load-bearing property under test is NOT "a save with a matching version succeeds" (that
 * passes under the unguarded code too, which is exactly the failure mode a weak test would let
 * through): it is that the SECOND save from a superseded basis is REJECTED and the first
 * operator's content survives byte-for-byte on the row.
 *
 * The guard is opt-in by construction. `expectedVersion` is optional, so every caller that does not
 * send one keeps the pre-existing last-write-wins behavior unchanged — pinned below so the
 * additive-and-non-breaking claim is a test, not a comment.
 */

const noopOutbox: OutboxPort = {
  enqueue: async () => {},
  claimPending: async () => [],
  markDelivered: async () => {},
  markFailed: async () => {},
};

const seedPost = {
  id: "post-1",
  workspaceId: "workspace-1",
  title: "Hello World",
  slug: "hello-world",
  bodyJson: { type: "doc", content: [] },
  status: "published" as const,
  kind: "post" as const,
  updatedAt: "2026-09-06T00:00:00.000Z",
  version: 1,
};

const clock = { nowIso: () => "2026-09-06T01:00:00.000Z" };

/** One operator's save, differing only in the body text and the basis it claims. */
function operatorSave(repo: InMemoryPostRepo, text: string, expectedVersion?: number) {
  const input: UpdatePostInput = {
    workspaceId: "workspace-1",
    id: "post-1",
    title: "Hello World",
    slug: "hello-world",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
    status: "published",
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
  };
  return updatePost({ deps: { repo, clock, outbox: noopOutbox }, input });
}

test("updatePost rejects a second save built on a superseded version, and operator A's content survives", async () => {
  const repo = new InMemoryPostRepo([seedPost]);

  // Both operators opened the post while it was at version 1.
  const first = await operatorSave(repo, "operator A", 1);
  assert.equal(first.post.version, 2);

  // Operator B's basis is now stale. Under the unguarded code this save landed and erased A's work.
  await assert.rejects(
    () => operatorSave(repo, "operator B — must not win", 1),
    (err: unknown) => {
      assert.ok(err instanceof PostVersionConflictError, `expected PostVersionConflictError, got ${String(err)}`);
      assert.equal(
        err.message,
        "post 'post-1' was modified by another save (expected version 1, current version 2)"
      );
      assert.equal(err.expectedVersion, 1);
      assert.equal(err.currentVersion, 2);
      return true;
    }
  );

  // The row still holds operator A's document at A's version — proof the rejected save wrote
  // nothing at all, rather than partially applying or bumping the version on its way out.
  const after = await repo.findById({ workspaceId: "workspace-1", id: "post-1" });
  assert.deepEqual(after?.bodyJson, {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "operator A" }] }],
  });
  assert.equal(after?.version, 2);
});

test("PostVersionConflictError is a PostConflictError, so callers already mapping that to 409 need no change", async () => {
  const repo = new InMemoryPostRepo([seedPost]);
  await operatorSave(repo, "operator A", 1);

  await assert.rejects(() => operatorSave(repo, "operator B", 1), PostConflictError);
});

test("updatePost applies normally when expectedVersion matches the row's current version", async () => {
  const repo = new InMemoryPostRepo([seedPost]);

  const result = await operatorSave(repo, "in sync", 1);

  assert.equal(result.post.version, 2);
  assert.deepEqual(result.post.bodyJson, {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "in sync" }] }],
  });
});

test("updatePost without expectedVersion keeps the pre-existing last-write-wins behavior (additive, non-breaking)", async () => {
  const repo = new InMemoryPostRepo([seedPost]);

  await operatorSave(repo, "operator A");
  const second = await operatorSave(repo, "operator B");

  // Unchanged from before the guard: an unversioned caller still clobbers. This is deliberate —
  // the guard is opt-in, so no existing caller's behavior moves until it starts sending a version.
  assert.equal(second.post.version, 3);
  assert.deepEqual(second.post.bodyJson, {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "operator B" }] }],
  });
});

test("a not-found row beats a stale expectedVersion — the version guard never leaks a row's existence", async () => {
  const repo = new InMemoryPostRepo([{ ...seedPost, deletedAt: "2026-09-06T00:30:00.000Z" }]);

  await assert.rejects(
    () => operatorSave(repo, "operator B", 1),
    (err: unknown) => {
      assert.ok(err instanceof PostNotFoundError, `expected PostNotFoundError, got ${String(err)}`);
      assert.equal(err.message, "post 'post-1' was not found");
      return true;
    }
  );
});
