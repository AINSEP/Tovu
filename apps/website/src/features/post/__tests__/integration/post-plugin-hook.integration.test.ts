import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo, createPost, updatePost, type PostRecord, type PostRepoPort } from "#src/features/post/index";

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
 * Exercises the implemented hook call sites and persistence in the post domain.
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
    // `updatePost` now wraps its save in `deps.repo.transaction(...)` and always calls
    // `appendRevision` after — both delegate untouched so this fixture keeps testing only what it
    // names (the beforeSaveHook throw-before-save guarantee), not the revision ledger.
    appendRevision: (r) => inner.appendRevision(r),
    listRevisions: (r) => inner.listRevisions(r),
    transaction: (fn) => inner.transaction(fn),
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
    bodyFormat: "doc",
    bodyHtml: null,
    status: "draft",
    kind: "post",
    updatedAt: "2026-07-27T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
  await repo.save(post);
  return post;
}

test("AC-01/REQ-05/REQ-06: updatePost merges the injected beforeSaveHook's returned ext patch onto the saved/returned post", async () => {
  const memoryRepo = new InMemoryPostRepo();
  const priorExt = { "word-count": { count: 5, prior: true }, "other-plugin": { retained: "yes" } };
  await seedPost(memoryRepo, { ext: priorExt });
  const bodyJson = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "new body" }] }] };
  let receivedDraft: unknown;

  const post = await updatePost({
    deps: {
      repo: memoryRepo,
      clock,
      outbox,
      beforeSaveHook: async (draft) => {
        receivedDraft = draft;
        return { "word-count": { count: JSON.stringify(draft.bodyJson).length } };
      },
    },
    input: { workspaceId: "ws-1", id: "post-1", title: "New title", slug: "new-slug", bodyJson, status: "published" },
  });

  assert.deepEqual(
    (post.post as PostRecord & { ext?: unknown }).ext,
    { "word-count": { count: JSON.stringify(bodyJson).length }, "other-plugin": { retained: "yes" } },
    "the hook's returned patch must be merged onto the saved PostRecord's ext field (REQ-06/BR-06)"
  );
  assert.deepEqual(receivedDraft, { id: "post-1", workspaceId: "ws-1", title: "New title", slug: "new-slug", status: "published", bodyJson, ext: priorExt });
  assert.deepEqual(await memoryRepo.findById({ workspaceId: "ws-1", id: "post-1" }), post.post);
});

test("CIC U-004-B1/F1 (Binding — post.ts side): a throwing beforeSaveHook must prevent repo.save() from ever being called — no partial write", async () => {
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
    }),
    { message: "plugin hook failed" }
  );

  assert.equal(counter.saveCalls, 0, "repo.save() must never be called when the hook throws (BR-06/BR-07/EC-10, CIC U-004)");
});

test("behavior.spec.md §10 / regression seam: updatePost with NO beforeSaveHook supplied behaves exactly as it does today (no-op default) — this must ALREADY pass, proving the optional dependency does not regress the zero-plugin path", async () => {
  const memoryRepo = new InMemoryPostRepo();
  const priorExt = { "word-count": { count: 5 }, "other-plugin": { retained: true } };
  await seedPost(memoryRepo, { ext: priorExt });

  const { post } = await updatePost({
    deps: { repo: memoryRepo, clock, outbox },
    input: { workspaceId: "ws-1", id: "post-1", title: "Hello Again", slug: "hello", bodyJson: { type: "doc", content: [] }, status: "draft" },
  });

  assert.equal(post.title, "Hello Again");
  assert.equal(post.version, 2);
  assert.deepEqual(post.ext, priorExt);
  assert.deepEqual((await memoryRepo.findById({ workspaceId: "ws-1", id: "post-1" }))?.ext, priorExt);
});

test("REQ-11/AC-14: an entry with no contributing plugin carries no ext object at all on its DTO-equivalent in-memory record", async () => {
  const memoryRepo = new InMemoryPostRepo();
  await seedPost(memoryRepo);

  const { post } = await updatePost({
    deps: { repo: memoryRepo, clock, outbox },
    input: { workspaceId: "ws-1", id: "post-1", title: "Hello", slug: "hello", bodyJson: { type: "doc", content: [] }, status: "draft" },
  });

  assert.equal((post as PostRecord & { ext?: unknown }).ext, undefined);
});


test("createPost passes the new draft to its hook and persists the derived extension", async () => {
  const repo = new InMemoryPostRepo();
  const bodyJson = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "created body" }] }] };
  const { post } = await createPost({
    deps: { repo, clock, outbox, beforeSaveHook: async (draft) => {
      assert.deepEqual(draft, { id: "created", workspaceId: "ws-1", title: "Created", slug: "created", status: "published", bodyJson, ext: {} });
      return { "word-count": { count: JSON.stringify(draft.bodyJson).length } };
    } },
    input: { workspaceId: "ws-1", id: "created", title: "Created", slug: "created", bodyJson, status: "published" },
  });
  assert.deepEqual(post.ext, { "word-count": { count: JSON.stringify(bodyJson).length } });
  assert.deepEqual(await repo.findById({ workspaceId: "ws-1", id: "created" }), post);
});
