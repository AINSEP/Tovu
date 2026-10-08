import assert from "node:assert/strict";
import test from "node:test";

import { revertChangeSet } from "../../index.js";
import { InMemoryChangeSetRepo } from "../../repo.memory.js";
import { createPostRevertRegistry, InMemoryPostRepo } from "#src/features/post/index";
import type { ChangeSetItemRecord, ChangeSetRecord } from "@jini-ai/cms/core";
import type { PostRepoPort, PostReverterDeps } from "#src/features/post/index";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import { InMemoryOutbox } from "#src/contracts/core/events/index";

/**
 * @file `core/commands/revert.ts` × the post `update` reverter — SPEC-005 BR-08, AC-17.
 * **CIC U-005 (Binding — the SM2 transition specifically ESCALATE_SECURITY): revert must never
 * re-fire the hook.** This is the dedicated, direct coverage the TDD dispatch requires for U-005.
 *
 * Revert is a pure pre-image restore through PostRepoPort.save, not updatePost: the write service
 * would re-fire content.entry.beforeSave, violating CIC U-005. Its findBySlug uniqueness lookup is
 * an observable distinction raw save does not have, so asserting no lookup detects the wrong path
 * independently of hook wiring. See tasks.md T023 and test-certification.md for the owner constraint.
 */

const WORKSPACE = "ws-1";

/** Reverting an update never forgets a trashed post; reaching this would be a contract change. */
const forgetNothing: PostReverterDeps["forgetRemoved"] = async () => {
  throw new Error("an update revert is not expected to forget a removed post");
};

function findBySlugSpy(inner: PostRepoPort): { repo: PostRepoPort; findBySlugCalls: number[]; otherReadCalls: string[] } {
  const calls: number[] = [];
  const otherReadCalls: string[] = [];
  const repo = new Proxy(inner, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        if (property === "findBySlug") calls.push(1);
        else if (property !== "findById" && /^(find|list|read)/.test(String(property))) otherReadCalls.push(String(property));
        return Reflect.apply(value, target, args);
      };
    },
  });
  return { repo, findBySlugCalls: calls, otherReadCalls };
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
    buildPostRecord({
      id: "post-1",
      workspaceId: WORKSPACE,
      title: "Edited Title",
      slug: "edited-slug",
      bodyJson: { type: "doc", content: [{ type: "paragraph" }] },
      status: "draft",
      kind: "post",
      updatedAt: "2026-07-28T00:00:00.000Z",
      version: 2,
    }),
  ]);
  const { repo: postRepo, findBySlugCalls, otherReadCalls } = findBySlugSpy(inner);

  const { changeSet, item } = buildAppliedChangeSet();
  const changeSets = new InMemoryChangeSetRepo([changeSet], [item]);

  const reverterDeps: PostReverterDeps = {
    postRepo,
    clock: { nowMs: () => Date.parse("2026-07-28T03:00:00.000Z") },
    outbox: new InMemoryOutbox(),
    forgetRemoved: forgetNothing,
  };

  await revertChangeSet({
    deps: {
      changeSets,
      registry: createPostRevertRegistry(reverterDeps),
      clock: { nowMs: () => Date.parse("2026-07-28T03:00:00.000Z") },
      idGen: { newId: () => "id-1" },
    },
    input: { workspaceId: WORKSPACE, changeSetId: "cs-1" },
  });

  assert.deepEqual(otherReadCalls, [], "restoring an update must not perform any other save-path read");
  assert.equal(
    findBySlugCalls.length,
    0,
    "revert must restore via a raw PostRepoPort.save() call, never via updatePost() (which always checks slug uniqueness first) — " +
      "calling updatePost during revert is exactly the illegal transition CIC U-005 forbids, since it would re-fire content.entry.beforeSave " +
      "once post.ts's optional beforeSaveHook exists"
  );
});

for (const inverseExt of [undefined, { "word-count": { words: 17, computedAt: "historical" } }]) {
  test(`AC-17: reverting a post-update restores bodyJson/title/slug/status, increments version by 1, and ${inverseExt ? "restores historical ext" : "removes newly introduced ext"}`, async () => {
    const postRepo = new InMemoryPostRepo([
      buildPostRecord({
        id: "post-1",
        workspaceId: WORKSPACE,
        title: "Edited Title",
        slug: "edited-slug",
        bodyJson: { type: "doc", content: [{ type: "paragraph" }] },
        status: "published",
        ext: { "word-count": { words: 999 }, "new-plugin": { added: true } },
        kind: "post",
        updatedAt: "2026-07-28T00:00:00.000Z",
        version: 2,
      }),
    ]);
    const { changeSet, item } = buildAppliedChangeSet();
    if (inverseExt !== undefined) item.inversePayload = { ...item.inversePayload as Record<string, unknown>, ext: inverseExt };
    const changeSets = new InMemoryChangeSetRepo([changeSet], [item]);

    const reverterDeps: PostReverterDeps = {
      postRepo,
      clock: { nowMs: () => Date.parse("2026-07-28T03:00:00.000Z") },
      outbox: new InMemoryOutbox(),
      forgetRemoved: forgetNothing,
    };

    await revertChangeSet({
      deps: {
        changeSets,
        registry: createPostRevertRegistry(reverterDeps),
        clock: { nowMs: () => Date.parse("2026-07-28T03:00:00.000Z") },
        idGen: { newId: () => "id-1" },
      },
      input: { workspaceId: WORKSPACE, changeSetId: "cs-1" },
    });

    const restored = await postRepo.findById({ workspaceId: WORKSPACE, id: "post-1" });
    assert.equal(restored?.title, "Original Title");
    assert.equal(restored?.slug, "original-slug");
    assert.equal(restored?.status, "draft");
    assert.deepEqual(restored?.bodyJson, { type: "doc", content: [] });
    assert.deepEqual(restored?.ext, inverseExt);
    if (inverseExt === undefined) assert.equal(Object.hasOwn(restored!, "ext"), false, "newly introduced extension data must be removed");
    assert.equal(restored?.version, 3, "AC-17: version increments by exactly 1 on revert, even though the write is a restore");
  });
}
