import assert from "node:assert/strict";
import test from "node:test";

import type { OutboxPort } from "@jini-ai/cms/core";
import { createPost, MAX_SLUG_LENGTH, MAX_TITLE_LENGTH, PostValidationError, updatePost, type PostRecord, type UpdatePostDeps } from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";

/**
 * @file A derived slug stays inside {@link MAX_SLUG_LENGTH}, and an over-limit legacy title or slug
 * does not block an unrelated edit. `createPost` used to derive a slug as long as its (up to 200
 * character) title while every `updatePost` validated the slug, so the post it created could never
 * be saved again; a row stored before the bounds existed hit the same wall on a body-only edit,
 * which in the Page editor also stopped the HTML save that follows the metadata write.
 */

const WORKSPACE_ID = "workspace-1";
const clock = { nowMs: () => Date.parse("2026-10-05T00:00:00.000Z") };
const noopOutbox: OutboxPort = {
  enqueue: async () => {},
  claimPending: async () => [],
  markDelivered: async () => {},
  markFailed: async () => {},
};

function deps(repo: InMemoryPostRepo): UpdatePostDeps {
  return { repo, clock, outbox: noopOutbox };
}

function bodyEdit(record: PostRecord) {
  return { workspaceId: WORKSPACE_ID, id: record.id, title: record.title, slug: record.slug,
    bodyJson: { type: "doc", content: [{ type: "paragraph" }] }, status: record.status };
}

function legacy(overrides: Partial<PostRecord>): PostRecord {
  return {
    id: "legacy-1", workspaceId: WORKSPACE_ID, title: "Legacy", slug: "legacy",
    bodyJson: { type: "doc", content: [] }, status: "draft", kind: "post", bodyFormat: "doc",
    bodyHtml: null, updatedAt: "2026-04-06T00:00:00.000Z", version: 1, ...overrides,
  };
}

test("createPost derives a slug no longer than the bound from a 200-character title, and that post can be re-saved", async () => {
  const repo = new InMemoryPostRepo([]);
  const title = "a".repeat(MAX_TITLE_LENGTH);
  const { post } = await createPost({ deps: { repo, clock }, input: { workspaceId: WORKSPACE_ID, id: "p1", title } });
  assert.ok(post.slug.length <= MAX_SLUG_LENGTH, `derived slug is ${post.slug.length} characters`);
  const { post: saved } = await updatePost({ deps: deps(repo), input: bodyEdit(post) });
  assert.equal(saved.version, 2);
});

test("colliding derived slugs keep room for their numeric suffix and never exceed the bound", async () => {
  const repo = new InMemoryPostRepo([]);
  const title = "word ".repeat(40).trim();
  const slugs: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const { post } = await createPost({ deps: { repo, clock }, input: { workspaceId: WORKSPACE_ID, id: `p${i}`, title } });
    slugs.push(post.slug);
  }
  assert.equal(new Set(slugs).size, 12);
  assert.deepEqual(slugs.filter((s) => s.length > MAX_SLUG_LENGTH), []);
  assert.ok(!slugs[0].endsWith("-"), "a truncated base never ends in a dash");
  assert.equal(slugs[11], `${slugs[0]}-12`);
});

test("updatePost lets an unchanged over-limit legacy slug and title through a body-only edit", async () => {
  const record = legacy({ title: "t".repeat(MAX_TITLE_LENGTH + 5), slug: "s".repeat(MAX_SLUG_LENGTH + 5) });
  const repo = new InMemoryPostRepo([record]);
  const { post } = await updatePost({ deps: deps(repo), input: bodyEdit(record) });
  assert.equal(post.version, 2);
  assert.equal(post.slug, record.slug);
  assert.equal(post.title, record.title);
});

test("updatePost still refuses CHANGING to an over-limit slug or title, with the exact messages", async () => {
  const record = legacy({ title: "t".repeat(MAX_TITLE_LENGTH + 5), slug: "s".repeat(MAX_SLUG_LENGTH + 5) });
  const repo = new InMemoryPostRepo([record]);
  await assert.rejects(
    () => updatePost({ deps: deps(repo), input: { ...bodyEdit(record), slug: "s".repeat(MAX_SLUG_LENGTH + 6) } }),
    (err: unknown) => err instanceof PostValidationError && err.message === "slug must be 120 characters or fewer"
  );
  await assert.rejects(
    () => updatePost({ deps: deps(repo), input: { ...bodyEdit(record), title: "t".repeat(MAX_TITLE_LENGTH + 6) } }),
    (err: unknown) => err instanceof PostValidationError && err.message === "title must be 200 characters or fewer"
  );
  assert.equal((await repo.findById({ workspaceId: WORKSPACE_ID, id: record.id }))?.version, 1);
});
