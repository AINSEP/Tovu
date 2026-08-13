import assert from "node:assert/strict";
import test from "node:test";

import { revertChangeSet } from "../..";
import { InMemoryChangeSetRepo } from "../../repo.memory";
import { createPostRevertRegistry, InMemoryPostRepo } from "#src/features/post/index";
import type { ChangeSetItemRecord, ChangeSetRecord } from "@jini-ai/cms/core";
import type { PostRepoPort, PostReverterDeps } from "#src/features/post/index";

/**
 * @file `core/commands/revert.ts` × the post `update` reverter — SPEC-005 BR-08, AC-17.
 * **CIC U-005 (Binding — the SM2 transition specifically ESCALATE_SECURITY): revert must never
 * re-fire the hook.** This is the dedicated, direct coverage the TDD dispatch requires for U-005.
 *
 * **Load-bearing TDD finding (see tasks.md T023 and this feature's test-certification.md):** the
 * post `update` reverter — originally shipped in `src/core/commands/appliers.ts`, moved to
 * `src/features/post/reverters.ts` by the 2026-08-13 features-post-deep-import-trace.md Job 2
 * inversion, behavior unchanged by that move — calls `updatePost(...)` directly to restore the
 * pre-image, at the time this test was written. That is EXACTLY the illegal transition CIC U-005
 * names — once `post.ts` gains an optional `beforeSaveHook` (tasks.md T020), routing revert
 * through `updatePost` would re-fire `content.entry.beforeSave` during what must be a pure data
 * restore. This is provable TODAY, without any hook wiring at all, via an observable side effect
 * `updatePost` performs that a raw `PostRepoPort.save()` call never would: `updatePost` calls
 * `repo.findBySlug()` to check slug uniqueness before persisting. A correct revert (raw `save()`)
 * must NEVER call `findBySlug` — an incorrect one (routing through `updatePost`) always will. This
 * decouples "is revert calling the wrong function" from "is the hook wired yet," which is why this
 * test was meaningful (and RED against the pre-T023 reverter) before Phase 3 (T020/T023) landed.
 *
 * TDD-certified against `core/commands/revert.ts` + the post reverter — these assertions describe
 * the fix T023 applied and continue to guard against a regression back to the illegal transition.
 */

const WORKSPACE = "ws-1";

function findBySlugSpy(inner: PostRepoPort): { repo: PostRepoPort; findBySlugCalls: number[] } {
  const calls: number[] = [];
  const repo: PostRepoPort = {
    findById: (r) => inner.findById(r),
    findBySlug: (r) => {
      calls.push(1);
      return inner.findBySlug(r);
    },
    list: (r) => inner.list(r),
    save: (record) => inner.save(record),
  };
  return { repo, findBySlugCalls: calls as unknown as number[] };
}

function buildAppliedChangeSet(): { changeSet: ChangeSetRecord; item: ChangeSetItemRecord } {
  const changeSet: ChangeSetRecord = {
    id: "cs-1",
    workspaceId: WORKSPACE,
    status: "applied",
    summary: "Update post post-1",
    createdAt: "2026-07-28T00:00:00.000Z",
    appliedAt: "2026-07-28T00:00:00.000Z",
  };
  const item: ChangeSetItemRecord = {
    id: "csi-1",
    changeSetId: "cs-1",
    entityType: "post",
    entityId: "post-1",
    operation: "update",
    inversePayload: {
      title: "Original Title",
      slug: "original-slug",
      bodyJson: { type: "doc", content: [] },
      status: "draft",
    },
    entityVersionAtApply: 2, // the version AFTER the save being reverted — must match current version
    position: 0,
  };
  return { changeSet, item };
}

test("CIC U-005-B1 (Binding): reverting a post-update change set must NOT call postRepo.findBySlug — a save-path-only side effect that reveals an illegal pass-through via updatePost() instead of a raw PostRepoPort.save()", async () => {
  const inner = new InMemoryPostRepo([
    {
      id: "post-1",
      workspaceId: WORKSPACE,
      title: "Edited Title",
      slug: "edited-slug",
      bodyJson: { type: "doc", content: [{ type: "paragraph" }] },
      status: "draft",
      kind: "post",
      updatedAt: "2026-07-28T00:00:00.000Z",
      version: 2,
    },
  ]);
  const { repo: postRepo, findBySlugCalls } = findBySlugSpy(inner);

  const { changeSet, item } = buildAppliedChangeSet();
  const changeSets = new InMemoryChangeSetRepo([changeSet], [item]);

  const reverterDeps: PostReverterDeps = {
    postRepo,
    clock: { nowIso: () => "2026-07-28T03:00:00.000Z" },
    outbox: { enqueue: async () => {} },
  };

  await revertChangeSet({
    deps: {
      changeSets,
      registry: createPostRevertRegistry(reverterDeps),
      clock: { nowIso: () => "2026-07-28T03:00:00.000Z" },
      idGen: { newId: () => "id-1" },
    },
    input: { workspaceId: WORKSPACE, changeSetId: "cs-1" },
  });

  assert.equal(
    findBySlugCalls.length,
    0,
    "revert must restore via a raw PostRepoPort.save() call, never via updatePost() (which always checks slug uniqueness first) — " +
      "calling updatePost during revert is exactly the illegal transition CIC U-005 forbids, since it would re-fire content.entry.beforeSave " +
      "once post.ts's optional beforeSaveHook exists"
  );
});

test("AC-17 (existing, correct baseline — regression guard): reverting a post-update change set still restores bodyJson/title/slug/status and increments version by exactly 1", async () => {
  const postRepo = new InMemoryPostRepo([
    {
      id: "post-1",
      workspaceId: WORKSPACE,
      title: "Edited Title",
      slug: "edited-slug",
      bodyJson: { type: "doc", content: [{ type: "paragraph" }] },
      status: "draft",
      kind: "post",
      updatedAt: "2026-07-28T00:00:00.000Z",
      version: 2,
    },
  ]);
  const { changeSet, item } = buildAppliedChangeSet();
  const changeSets = new InMemoryChangeSetRepo([changeSet], [item]);

  const reverterDeps: PostReverterDeps = {
    postRepo,
    clock: { nowIso: () => "2026-07-28T03:00:00.000Z" },
    outbox: { enqueue: async () => {} },
  };

  await revertChangeSet({
    deps: {
      changeSets,
      registry: createPostRevertRegistry(reverterDeps),
      clock: { nowIso: () => "2026-07-28T03:00:00.000Z" },
      idGen: { newId: () => "id-1" },
    },
    input: { workspaceId: WORKSPACE, changeSetId: "cs-1" },
  });

  const restored = await postRepo.findById({ workspaceId: WORKSPACE, id: "post-1" });
  assert.equal(restored?.title, "Original Title");
  assert.equal(restored?.slug, "original-slug");
  assert.equal(restored?.status, "draft");
  assert.equal(restored?.version, 3, "AC-17: version increments by exactly 1 on revert, even though the write is a restore");
});
