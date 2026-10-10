import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { createPost, updatePost, PostValidationError, type CreatePostInput } from "../post.js";
import { createPostReverters } from "../reverters.js";
import { InMemoryPostRepo } from "../repo.memory.js";

const clock = { nowMs: () => Date.parse("2026-10-09T00:00:00Z") };
const input = { workspaceId: "ws", id: "p1", title: "Hello", actorId: "human" };

test("creation defaults to the actor username once, stays hidden, and records the whole credit in revisions", async () => {
  const repo = new InMemoryPostRepo();
  const lookups: unknown[] = [];
  const authorAccounts = { findByPrincipalId: async (required: unknown) => { lookups.push(required); return { username: "admin" }; } };
  const created = (await createPost({ deps: { repo, clock, authorAccounts }, input })).post;
  assert.equal(created.author, "admin");
  assert.equal(created.showAuthor, false);
  assert.equal(created.createdByPrincipalId, "human");
  assert.deepEqual(lookups, [{ workspaceId: "ws", principalId: "human" }]);
  const changed = (await updatePost({ deps: { repo, clock, outbox: new InMemoryOutbox() }, input: {
    ...input, slug: created.slug, bodyJson: created.bodyJson, status: created.status, author: "Guest Writer", showAuthor: true,
  } })).post;
  assert.equal(changed.author, "Guest Writer");
  assert.equal(changed.createdByPrincipalId, "human");
  assert.equal(changed.showAuthor, true);
  const revisions = await repo.listRevisions({ workspaceId: "ws", postId: "p1" });
  assert.deepEqual(revisions.map(r => [r.stateJson.author, r.stateJson.showAuthor]), [["admin", false], ["Guest Writer", true]]);
  assert.equal(lookups.length, 1, "an edit never resolves or rewrites the creation default");
});

test("explicit credit, including null, skips account lookup; unknown actors remain unknown", async () => {
  for (const [author, expected] of [["  By Another Name  ", "By Another Name"], [null, null], ["", null]] as const) {
    const post = (await createPost({ deps: { repo: new InMemoryPostRepo(), clock,
      authorAccounts: { findByPrincipalId: async () => { throw new Error("must not resolve an explicit credit"); } },
    }, input: { ...input, author, showAuthor: true } })).post;
    assert.equal(post.author, expected);
    assert.equal(post.showAuthor, true);
  }
  const post = (await createPost({ deps: { repo: new InMemoryPostRepo(), clock }, input: { ...input, actorId: undefined } })).post;
  assert.equal(post.author, null);
  assert.equal(post.showAuthor, false);
});

test("invalid author or toggle fails before writing or account lookup, with exact domain errors", async () => {
  for (const [patch, message] of [
    [{ author: 42 }, "author must be a string or null"],
    [{ author: "A".repeat(201) }, "author must be at most 200 characters"],
    [{ showAuthor: "false" }, "showAuthor must be a boolean"],
    [{ showAuthor: null }, "showAuthor must be a boolean"],
  ] as const) {
    const repo = new InMemoryPostRepo();
    await assert.rejects(createPost({ deps: { repo, clock, authorAccounts: {
      findByPrincipalId: async () => { throw new Error("invalid input reached account lookup"); },
    } }, input: { ...input, ...patch } as CreatePostInput }),
    (error: unknown) => error instanceof PostValidationError && error.message === message);
    assert.deepEqual(await repo.list({ workspaceId: "ws" }), []);
  }
});

test("author accepts 200 display characters and rejects a longer edit without changing the post or revisions", async () => {
  const repo = new InMemoryPostRepo();
  const created = (await createPost({ deps: { repo, clock }, input: { ...input, author: `  ${"A".repeat(200)}  ` } })).post;
  assert.equal(created.author, "A".repeat(200));
  const revisions = await repo.listRevisions({ workspaceId: "ws", postId: "p1" });
  await assert.rejects(updatePost({ deps: { repo, clock, outbox: new InMemoryOutbox() }, input: {
    ...input, slug: created.slug, bodyJson: created.bodyJson, status: created.status, author: "A".repeat(201),
  } }), (error: unknown) => error instanceof PostValidationError && error.message === "author must be at most 200 characters");
  assert.deepEqual(await repo.findById({ workspaceId: "ws", id: "p1" }), created);
  assert.deepEqual(await repo.listRevisions({ workspaceId: "ws", postId: "p1" }), revisions);
});

test("author counts Unicode code points across creation and edits, with no write on overflow", async () => {
  const repo = new InMemoryPostRepo();
  const author = "😀".repeat(200);
  const created = (await createPost({ deps: { repo, clock }, input: { ...input, author: `  ${author}  ` } })).post;
  assert.equal(created.author, author);
  const changed = (await updatePost({ deps: { repo, clock, outbox: new InMemoryOutbox() }, input: {
    ...input, slug: created.slug, bodyJson: created.bodyJson, status: created.status, author: "A😀".repeat(100),
  } })).post;
  assert.equal(changed.author, "A😀".repeat(100));
  const revisions = await repo.listRevisions({ workspaceId: "ws", postId: "p1" });
  await assert.rejects(updatePost({ deps: { repo, clock, outbox: new InMemoryOutbox() }, input: {
    ...input, slug: changed.slug, bodyJson: changed.bodyJson, status: changed.status, author: "😀".repeat(201),
  } }), (error: unknown) => error instanceof PostValidationError && error.message === "author must be at most 200 characters");
  assert.deepEqual(await repo.findById({ workspaceId: "ws", id: "p1" }), changed);
  assert.deepEqual(await repo.listRevisions({ workspaceId: "ws", postId: "p1" }), revisions);
});

test("undo restores the captured credit and toggle, while older inverses preserve current byline fields", async () => {
  const repo = new InMemoryPostRepo();
  const created = (await createPost({ deps: { repo, clock }, input: { ...input, author: "Current Writer", showAuthor: true } })).post;
  const reverter = createPostReverters({ postRepo: repo, clock, outbox: new InMemoryOutbox(), forgetRemoved: async () => {} }).update;
  const inverse = { title: created.title, slug: created.slug, bodyJson: created.bodyJson, status: created.status };
  const item = { id: "item", changeSetId: "change", position: 0, entityType: "post", entityId: created.id, operation: "update" as const };
  await reverter.applyInverse({ workspaceId: "ws", item: { ...item, inversePayload: { ...inverse, author: null, showAuthor: false } } });
  assert.deepEqual([(await repo.findById({ workspaceId: "ws", id: created.id }))?.author,
    (await repo.findById({ workspaceId: "ws", id: created.id }))?.showAuthor], [null, false]);
  await repo.save({ ...created, author: "Kept Writer", showAuthor: true });
  await reverter.applyInverse({ workspaceId: "ws", item: { ...item, inversePayload: inverse } });
  assert.deepEqual([(await repo.findById({ workspaceId: "ws", id: created.id }))?.author,
    (await repo.findById({ workspaceId: "ws", id: created.id }))?.showAuthor], ["Kept Writer", true]);
});
