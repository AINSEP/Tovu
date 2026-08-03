import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo, updatePost, type PostRecord, type PostRepoPort } from "#src/features/post/index";

/**
 * @file `post.ts`'s `BeforeSaveHookPort` integration seam — SPEC-005 REQ-05/06/11, C-014, W-003.
 * **CIC U-004 (Binding, no escalation marker) — post.ts side:** the hook must fully resolve or
 * throw BEFORE the single `deps.repo.save()` call; the existing `post.test.ts`/
 * `post.transition-events.test.ts` fixtures must keep passing unmodified with `beforeSaveHook`
 * absent (regression seam — NOT re-asserted here; this file only adds NEW coverage for the new,
 * optional dependency).
 *
 * This file targets `createPost`/`updatePost` DIRECTLY (not through hook-registry.ts, which has
 * its own dedicated `hook-registry.integration.test.ts`) — a hand-written fake `beforeSaveHook`
 * closure stands in for a real `BeforeSaveHookPort` implementation, isolating "does post.ts wire
 * the hook correctly" from "does hook-registry.ts compose plugins correctly."
 *
 * TDD-certified against the CURRENT `post.ts` (an existing, already-implemented file this dispatch
 * does not modify) — every test below that depends on the not-yet-added `beforeSaveHook`/`ext`
 * fields is currently RED because `post.ts` has no such field or call site yet, not because of a
 * thrown stub error. These assertions describe the contract the Programmer stage must satisfy
 * when it adds the optional `beforeSaveHook` dependency (tasks.md T020).
 */

function makeCounterRepo(inner: PostRepoPort) {
  const counter = { saveCalls: 0 };
  const repo: PostRepoPort = {
    findById: (r) => inner.findById(r),
    findBySlug: (r) => inner.findBySlug(r),
    list: (r) => inner.list(r),
    save: async (record) => {
      counter.saveCalls += 1;
      await inner.save(record);
    },
  };
  return { repo, counter };
}

const clock = { nowIso: () => "2026-07-28T00:00:00.000Z" };
const outbox = { enqueue: async () => {} };

async function seedPost(repo: PostRepoPort, overrides: Partial<PostRecord> = {}): Promise<PostRecord> {
  const post: PostRecord = {
    id: "post-1",
    workspaceId: "ws-1",
    title: "Hello",
    slug: "hello",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "one two three four five" }] }] },
    status: "draft",
    kind: "post",
    updatedAt: "2026-07-27T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
  await repo.save(post);
  return post;
}

test("AC-01/REQ-05/REQ-06 (currently RED — no hook call site exists in post.ts yet): updatePost merges the injected beforeSaveHook's returned ext patch onto the saved/returned post", async () => {
  const memoryRepo = new InMemoryPostRepo();
  await seedPost(memoryRepo);

  const post = await updatePost({
    deps: {
      repo: memoryRepo,
      clock,
      outbox,
      // NOTE: `beforeSaveHook` is not yet a declared field on `UpdatePostDeps` — this is exactly
      // the field Programmer's task T020 must add. Passed here as the certified target shape.
      beforeSaveHook: async () => ({ "word-count": { count: 5 } }),
    } as never,
    input: { workspaceId: "ws-1", id: "post-1", title: "Hello", slug: "hello", bodyJson: { type: "doc", content: [] }, status: "draft" },
  });

  assert.deepEqual(
    (post.post as PostRecord & { ext?: unknown }).ext,
    { "word-count": { count: 5 } },
    "the hook's returned patch must be merged onto the saved PostRecord's ext field (REQ-06/BR-06)"
  );
});

test("CIC U-004-B1/F1 (Binding — post.ts side): a throwing beforeSaveHook must prevent repo.save() from ever being called — no partial write (currently RED: without the T020 wiring, the hook is never even invoked, so this assertion currently fails the OTHER way — save() runs unconditionally)", async () => {
  const memoryRepo = new InMemoryPostRepo();
  await seedPost(memoryRepo);
  const { repo, counter } = makeCounterRepo(memoryRepo);

  await assert.rejects(() =>
    updatePost({
      deps: {
        repo,
        clock,
        outbox,
        beforeSaveHook: async () => {
          throw new Error("plugin hook failed");
        },
      } as never,
      input: { workspaceId: "ws-1", id: "post-1", title: "Hello", slug: "hello", bodyJson: { type: "doc", content: [] }, status: "draft" },
    })
  );

  assert.equal(counter.saveCalls, 0, "repo.save() must never be called when the hook throws (BR-06/BR-07/EC-10, CIC U-004)");
});

test("behavior.spec.md §10 / regression seam: updatePost with NO beforeSaveHook supplied behaves exactly as it does today (no-op default) — this must ALREADY pass, proving the optional dependency does not regress the zero-plugin path", async () => {
  const memoryRepo = new InMemoryPostRepo();
  await seedPost(memoryRepo);

  const { post } = await updatePost({
    deps: { repo: memoryRepo, clock, outbox },
    input: { workspaceId: "ws-1", id: "post-1", title: "Hello Again", slug: "hello", bodyJson: { type: "doc", content: [] }, status: "draft" },
  });

  assert.equal(post.title, "Hello Again");
  assert.equal(post.version, 2);
});

test("REQ-11/AC-14 (currently RED): an entry with no contributing plugin carries no ext object at all on its DTO-equivalent in-memory record", async () => {
  const memoryRepo = new InMemoryPostRepo();
  await seedPost(memoryRepo);

  const { post } = await updatePost({
    deps: { repo: memoryRepo, clock, outbox },
    input: { workspaceId: "ws-1", id: "post-1", title: "Hello", slug: "hello", bodyJson: { type: "doc", content: [] }, status: "draft" },
  });

  assert.equal((post as PostRecord & { ext?: unknown }).ext, undefined);
});
