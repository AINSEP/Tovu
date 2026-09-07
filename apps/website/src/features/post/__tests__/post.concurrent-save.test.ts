import assert from "node:assert/strict";
import test from "node:test";

import type { OutboxPort } from "@jini-ai/cms/core";
import { PostVersionConflictError, updatePost, type PostRecord, type UpdatePostInput } from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";

/**
 * @file C01 (fable bugs audit, 2026-09-06) — `updatePost`'s `expectedVersion` compare must be
 * ATOMIC with the write, not merely ordered before it.
 *
 * Why `post.optimistic-concurrency.test.ts` does not already cover this: every test in that file is
 * SEQUENTIAL — operator A's `updatePost` promise is fully awaited before operator B's begins. A
 * sequential test passes under the broken code and under the fixed code alike, because the stale
 * basis is still stale by the time the in-memory compare runs. What it cannot see is the window
 * between the compare and the write.
 *
 * The window is real and is not a microtask: `post.ts` compares at `assertExpectedVersion`, then
 * awaits `assertSlugAvailableForUpdate` (a repo read) and `runBeforeSaveHook` (a plugin hook — a
 * genuinely arbitrary-latency, third-party await) before `repo.save()`. `repo.sqlite.ts`'s `save()`
 * is an unconditional `INSERT … ON CONFLICT(posts.id) DO UPDATE` with no `version` predicate, so a
 * save that PASSED the compare lands regardless of what happened during those awaits.
 *
 * The tests below interleave two real `updatePost` calls across that window: operator A parks
 * inside the before-save hook, operator B completes end to end, then A is released. Both claim
 * `expectedVersion: 1` and both are entitled to a 200 under the broken code — which is the bug: A's
 * document silently erases B's, and the row never advances past version 2.
 *
 * What this test would still pass under, deliberately checked: it would NOT pass under a fix that
 * only re-reads and re-compares before the save (that is the same TOCTOU one await later), because
 * the assertion is on the ERROR TYPE plus the row's surviving content, not on "A did not win".
 */

const noopOutbox: OutboxPort = {
  enqueue: async () => {},
  claimPending: async () => [],
  markDelivered: async () => {},
  markFailed: async () => {},
};

const seedPost: PostRecord = {
  id: "post-1",
  workspaceId: "workspace-1",
  title: "Hello World",
  slug: "hello-world",
  bodyJson: { type: "doc", content: [] },
  status: "published",
  kind: "post",
  updatedAt: "2026-09-06T00:00:00.000Z",
  version: 1,
};

const clock = { nowIso: () => "2026-09-07T01:00:00.000Z" };

function bodyWith(text: string): UpdatePostInput["bodyJson"] {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

/** One operator's save. `beforeSaveHook` is how a test parks a request mid-flight, in the exact
 *  place `post.ts` already awaits arbitrary plugin latency. */
function operatorSave(
  repo: InMemoryPostRepo,
  text: string,
  expectedVersion: number,
  beforeSaveHook?: () => Promise<Record<string, never>>
) {
  return updatePost({
    deps: {
      repo,
      clock,
      outbox: noopOutbox,
      ...(beforeSaveHook ? { beforeSaveHook: async () => beforeSaveHook() } : {}),
    },
    input: {
      workspaceId: "workspace-1",
      id: "post-1",
      title: "Hello World",
      slug: "hello-world",
      bodyJson: bodyWith(text),
      status: "published",
      expectedVersion,
    },
  });
}

/** A gate a test can open once: the hook reports it has parked, and waits to be released. */
function makeGate(): { parked: Promise<void>; release: () => void; hook: () => Promise<Record<string, never>> } {
  let announceParked: () => void = () => {};
  let release: () => void = () => {};
  const parked = new Promise<void>((resolve) => {
    announceParked = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    parked,
    release,
    hook: async () => {
      announceParked();
      await released;
      return {};
    },
  };
}

test("C01: a save that passed the version compare must NOT land after another save won the row while it sat in the before-save hook", async () => {
  const repo = new InMemoryPostRepo([seedPost]);
  const gate = makeGate();

  // Operator A opened the post at version 1 and saves. Its before-save hook parks: A has already
  // passed `assertExpectedVersion` and is now holding, exactly as a slow plugin filter would.
  const operatorA = operatorSave(repo, "operator A — stale by the time it writes", 1, gate.hook);
  await gate.parked;

  // Operator B — also basis version 1, no hook — runs to completion and wins the row at version 2.
  const winner = await operatorSave(repo, "operator B — the winner", 1);
  assert.equal(winner.post.version, 2);

  // A resumes. Its in-memory compare said "version 1 is current"; that is no longer true.
  gate.release();

  await assert.rejects(
    () => operatorA,
    (err: unknown) => {
      assert.ok(
        err instanceof PostVersionConflictError,
        `expected PostVersionConflictError, got ${err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err)}`
      );
      assert.equal(
        err.message,
        "post 'post-1' was modified by another save (expected version 1, current version 2)"
      );
      assert.equal(err.expectedVersion, 1);
      assert.equal(err.currentVersion, 2);
      return true;
    }
  );

  // The load-bearing assertion: B's document is still on the row, byte for byte, at B's version.
  // Under the unguarded `save()` this reads back as A's text — a silent, unreported lost update.
  const after = await repo.findById({ workspaceId: "workspace-1", id: "post-1" });
  assert.deepEqual(after?.bodyJson, bodyWith("operator B — the winner"));
  assert.equal(after?.version, 2);
});

test("C01: two saves from the same basis interleaved through the hook produce exactly one winner, not two 200s", async () => {
  const repo = new InMemoryPostRepo([seedPost]);
  const gateA = makeGate();
  const gateB = makeGate();

  const first = operatorSave(repo, "first", 1, gateA.hook);
  const second = operatorSave(repo, "second", 1, gateB.hook);
  await Promise.all([gateA.parked, gateB.parked]);

  // Both have passed the compare. Releasing them in order makes the second one's write the stale
  // one — under the broken code both resolve and the row ends at version 2 holding "second".
  gateA.release();
  await first;
  gateB.release();

  const outcomes = await Promise.allSettled([second]);
  assert.equal(outcomes[0].status, "rejected", "the second save must be rejected, not silently applied");
  assert.ok((outcomes[0] as PromiseRejectedResult).reason instanceof PostVersionConflictError);

  const after = await repo.findById({ workspaceId: "workspace-1", id: "post-1" });
  assert.deepEqual(after?.bodyJson, bodyWith("first"));
  assert.equal(after?.version, 2, "exactly one save landed, so the row advanced exactly once");
});
