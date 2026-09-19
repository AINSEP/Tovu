import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo, type PostRecord } from "../../post/index.js";
import { setEntrySeoOverrides } from "../write-service.js";

/**
 * @file Round-4 dispatch, Task 2 — `setEntrySeoOverrides` (`mergeOverridesOntoCurrentRow`) writes
 * directly through `postRepo.saveIfVersion`, bypassing `createPost`/`updatePost`/`deletePost`
 * entirely. It bumps `posts.version` but appends no `post_revisions` row, so an SEO-only edit was
 * invisible to the ledger's whole reason to exist (a complete edit history). This is the disclosed
 * bypass flagged in the prior round's handoff (`2026-09-18-impl-post-revisions-3.md`, finding #1).
 *
 * This file proves the bypass (RED against pre-fix code) and then certifies the fix: the SEO write
 * must append exactly one revision, attributed to the real caller, chained to whatever revision
 * came before it — the same contract `post.revisions.test.ts` certifies for
 * `createPost`/`updatePost`/`deletePost`.
 */

const WORKSPACE = "workspace-1";
const ENTRY_ID = "post-1";
const NOW = "2026-09-18T00:00:00.000Z";

const alwaysAllow = async () => ({ allowed: true, reason: "matched" });
const noopInvalidate = () => {};
const clock = { nowIso: () => NOW };

function seedPost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: ENTRY_ID,
    workspaceId: WORKSPACE,
    title: "Hello World",
    slug: "hello-world",
    bodyJson: { type: "doc", content: [] },
    status: "published",
    kind: "post",
    updatedAt: "2026-09-07T00:00:00.000Z",
    version: 1,
    seoExtJson: null,
    ...overrides,
  };
}

test("setEntrySeoOverrides appends a post_revisions row, attributed to the real caller — SEO edits must not escape the ledger", async () => {
  const postRepo = new InMemoryPostRepo([seedPost()]);

  const { overrides } = await setEntrySeoOverrides({
    deps: { postRepo, authorize: alwaysAllow, invalidateSitemapCache: noopInvalidate, clock },
    input: {
      workspaceId: WORKSPACE,
      entryId: ENTRY_ID,
      patch: { title: "SEO title" },
      callerPrincipalId: "seo-editor-1",
    },
  });
  assert.deepEqual(overrides, { title: "SEO title" });

  const revisions = await postRepo.listRevisions({ workspaceId: WORKSPACE, postId: ENTRY_ID });
  assert.equal(revisions.length, 1, "an SEO-only write must append exactly one revision, like any other post write");
  assert.equal(revisions[0].op, "update");
  assert.equal(revisions[0].actorId, "seo-editor-1", "the revision must carry the real caller, not a fallback");
  assert.equal(revisions[0].seq, 2, "seq must equal the post's version after the write");
  assert.equal(JSON.parse(revisions[0].stateJson.seoExtJson ?? "{}").title, "SEO title");
});

test("setEntrySeoOverrides's revision chains after a prior revision, like any other post write", async () => {
  const postRepo = new InMemoryPostRepo();
  const { id: createRevisionId } = await postRepo.appendRevision({
    postId: ENTRY_ID,
    workspaceId: WORKSPACE,
    seq: 1,
    op: "create",
    stateJson: seedPost(),
    actorId: "creator-1",
    recordedAt: NOW,
  });
  await postRepo.save(seedPost());

  await setEntrySeoOverrides({
    deps: { postRepo, authorize: alwaysAllow, invalidateSitemapCache: noopInvalidate, clock },
    input: { workspaceId: WORKSPACE, entryId: ENTRY_ID, patch: { description: "chained" }, callerPrincipalId: "seo-editor-2" },
  });

  const revisions = await postRepo.listRevisions({ workspaceId: WORKSPACE, postId: ENTRY_ID });
  assert.equal(revisions.length, 2, "the SEO write must append its OWN row alongside the pre-existing create revision, not replace or skip it");
  assert.equal(revisions[0].id, createRevisionId);
  assert.equal(revisions[1].op, "update");
  assert.equal(revisions[1].seq, 2);
});
