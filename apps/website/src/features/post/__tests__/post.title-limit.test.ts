import assert from "node:assert/strict";
import test from "node:test";

import type { OutboxPort } from "@jini-ai/cms/core";
import { createPost, MAX_TITLE_LENGTH, PostValidationError, updatePost, type PostRecord, type UpdatePostDeps } from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";

/**
 * @file api.spec.md §4 `title` maxLength on the update path. `createPost` refused a title over
 * {@link MAX_TITLE_LENGTH} characters; `updatePost` only checked that the title was non-empty, so
 * PUT /pages, PUT /posts and the `content_post_update` agent tool could store a title create would
 * have refused. Both now share one length validator, so the message is create's, word for word.
 */

const WORKSPACE_ID = "workspace-1";
const NOW = "2026-10-05T00:00:00.000Z";
const clock = { nowMs: () => Date.parse(NOW) };

const noopOutbox: OutboxPort = {
  enqueue: async () => {},
  claimPending: async () => [],
  markDelivered: async () => {},
  markFailed: async () => {},
};

function seed(): PostRecord {
  return {
    id: "post-1",
    workspaceId: WORKSPACE_ID,
    title: "Hello World",
    slug: "hello-world",
    bodyJson: { type: "doc", content: [] },
    status: "draft",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: "2026-04-06T00:00:00.000Z",
    version: 1,
  };
}

function deps(repo: InMemoryPostRepo): UpdatePostDeps {
  return { repo, clock, outbox: noopOutbox };
}

function retitle(record: PostRecord, title: string) {
  return { workspaceId: WORKSPACE_ID, id: record.id, title, slug: record.slug, bodyJson: record.bodyJson, status: record.status };
}

/** The exact message `createPost` raises for an over-long title — the update path must match it. */
async function createRejection(title: string): Promise<string> {
  const repo = new InMemoryPostRepo([]);
  try {
    await createPost({ deps: { repo, clock }, input: { workspaceId: WORKSPACE_ID, id: "post-new", title } });
  } catch (err) {
    assert.ok(err instanceof PostValidationError);
    return err.message;
  }
  assert.fail("createPost accepted an over-long title");
}

test("updatePost refuses a 201-character title with create's exact message, writing nothing", async () => {
  const record = seed();
  const repo = new InMemoryPostRepo([record]);
  const tooLong = "t".repeat(MAX_TITLE_LENGTH + 1);
  const createMessage = await createRejection(tooLong);

  await assert.rejects(
    () => updatePost({ deps: deps(repo), input: retitle(record, tooLong) }),
    (err: unknown) => {
      assert.ok(err instanceof PostValidationError);
      assert.equal((err as Error).message, "title must be 200 characters or fewer");
      assert.equal((err as Error).message, createMessage);
      return true;
    }
  );

  const stored = await repo.findById({ workspaceId: WORKSPACE_ID, id: "post-1" });
  assert.equal(stored?.title, "Hello World");
  assert.equal(stored?.version, 1);
});

test("updatePost accepts a title of exactly 200 characters", async () => {
  const record = seed();
  const repo = new InMemoryPostRepo([record]);

  const { post } = await updatePost({ deps: deps(repo), input: retitle(record, "t".repeat(MAX_TITLE_LENGTH)) });

  assert.equal(post.title, "t".repeat(MAX_TITLE_LENGTH));
});

test("updatePost measures the trimmed title, as create does: 200 characters plus padding saves", async () => {
  const record = seed();
  const repo = new InMemoryPostRepo([record]);

  const { post } = await updatePost({ deps: deps(repo), input: retitle(record, `  ${"t".repeat(MAX_TITLE_LENGTH)}  `) });

  assert.equal(post.title, "t".repeat(MAX_TITLE_LENGTH));
});

test("an empty title is still refused on update with its own message, ahead of the length rule", async () => {
  const record = seed();
  const repo = new InMemoryPostRepo([record]);

  await assert.rejects(
    () => updatePost({ deps: deps(repo), input: retitle(record, "   ") }),
    (err: unknown) => err instanceof PostValidationError && err.message === "title is required"
  );
});
