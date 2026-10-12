import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { postRepoFor } from "../repo.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import {
  createPost, updatePost, PostVersionConflictError,
  type PostRecord, type PostRepoPort, type UpdatePostInput,
} from "../post.js";

const clock = { nowMs: () => Date.parse("2026-10-10T12:00:00Z") };
const key = { workspaceId: "ws-noopsave", id: "entry-1" };
const revisionKey = { workspaceId: key.workspaceId, postId: key.id };

function inputFor(post: PostRecord, patch: Partial<UpdatePostInput> = {}): UpdatePostInput {
  return {
    ...key, title: post.title, slug: post.slug, bodyJson: structuredClone(post.bodyJson),
    status: post.status, expectedVersion: post.version, ...patch,
  };
}

// The same domain contract runs against the hermetic repo and both real SQL dialects.
function saveContract(makeRepo: () => PostRepoPort): void {
  for (const kind of ["post", "page"] as const) {
    test(`${kind}: unchanged saves preserve the record and ledger, including normalized optional fields`, async () => {
      const repo = makeRepo();
      const { post } = await createPost({ deps: { repo, clock }, input: { ...key, title: "Hello", kind } });
      const before = await repo.findById(key);
      const history = await repo.listRevisions(revisionKey);
      const outbox = new InMemoryOutbox();
      const result = await updatePost({ deps: { repo, clock, outbox }, input: inputFor(post, {
        title: "  Hello  ", bodyJson: { content: [], type: "doc" },
        templateChoice: null, overridesThemePage: null, publishAt: null,
        featuredMediaId: null, author: null, showAuthor: false,
      }) });
      assert.deepEqual(result.post, before);
      assert.equal(result.revisionId, null);
      assert.equal(result.previousRevisionId, null);
      assert.deepEqual(await repo.findById(key), before);
      assert.deepEqual(await repo.listRevisions(revisionKey), history);
      assert.deepEqual(await outbox.claimPending({ batchSize: 10, nowIso: "2026-10-11T00:00:00Z" }), []);
    });

    test(`${kind}: each meaningful field change writes once; repeating it does not write again`, async () => {
      const repo = makeRepo();
      let post = (await createPost({ deps: { repo, clock }, input: { ...key, title: "Hello", kind } })).post;
      const changes: Partial<UpdatePostInput>[] = [
        { title: "New title" }, { slug: "new-slug" }, { status: "published" },
        { bodyJson: { type: "doc", content: [{ type: "paragraph" }] } },
        { templateChoice: "article.html" }, { templateChoice: "" }, { templateChoice: null },
        { author: "Guest" }, { showAuthor: true },
        { publishAt: "2026-10-12T00:00:00Z" }, { publishAt: null },
        { featuredMediaId: "image-1" }, { featuredMediaId: null },
        { overridesThemePage: false }, { overridesThemePage: true }, { overridesThemePage: null },
      ];
      for (const patch of changes) {
        const count = (await repo.listRevisions(revisionKey)).length;
        const beforeVersion = post.version;
        post = (await updatePost({ deps: { repo, clock, outbox: new InMemoryOutbox() }, input: inputFor(post, patch) })).post;
        assert.equal(post.version, beforeVersion + 1, JSON.stringify(patch));
        assert.equal((await repo.listRevisions(revisionKey)).length, count + 1);
        const stored = await repo.findById(key);
        const repeated = await updatePost({ deps: { repo, clock, outbox: new InMemoryOutbox() }, input: inputFor(post, patch) });
        assert.deepEqual(repeated.post, stored);
        assert.equal((await repo.listRevisions(revisionKey)).length, count + 1);
        post = repeated.post;
      }
    });

    test(`${kind}: an unchanged save still rejects a stale expectedVersion`, async () => {
      const repo = makeRepo();
      const post = (await createPost({ deps: { repo, clock }, input: { ...key, title: "Hello", kind } })).post;
      const deps = { repo, clock, outbox: new InMemoryOutbox() };
      assert.equal((await updatePost({ deps, input: inputFor(post) })).post.version, post.version);
      await assert.rejects(updatePost({ deps, input: inputFor(post, { expectedVersion: post.version - 1 }) }), PostVersionConflictError);
      assert.equal((await repo.listRevisions(revisionKey)).length, 1);
    });
  }

  test("plugin ext is compared after the hook, ignoring JSON key order", async () => {
    const repo = makeRepo();
    const post = (await createPost({ deps: { repo, clock }, input: { ...key, title: "Hello" } })).post;
    const deps = { repo, clock, outbox: new InMemoryOutbox(), beforeSaveHook: async () => ({ plugin: { a: 1, b: 2 } }) };
    const changed = (await updatePost({ deps, input: inputFor(post) })).post;
    assert.equal(changed.version, post.version + 1);
    assert.equal((await repo.listRevisions(revisionKey)).length, 2);
    const stored = await repo.findById(key);
    const repeated = await updatePost({
      deps: { ...deps, beforeSaveHook: async () => ({ plugin: { b: 2, a: 1 } }) }, input: inputFor(changed),
    });
    assert.deepEqual(repeated.post, stored);
    assert.equal((await repo.listRevisions(revisionKey)).length, 2);
  });
}

describe("no-op saves: memory", () => saveContract(() => new InMemoryPostRepo()));
describeEachDialect("no-op saves: SQL", {
  tables: ["posts", "post_revisions"], make: (kernel) => postRepoFor(kernel),
}, (repo) => saveContract(repo));

test("no-op saves skip both write ports and revision append, with or without expectedVersion", async () => {
  class CountingRepo extends InMemoryPostRepo {
    writes = 0;
    appends = 0;
    override async save(record: PostRecord): Promise<void> { this.writes++; await super.save(record); }
    override async saveIfVersion(input: Parameters<PostRepoPort["saveIfVersion"]>[0]) {
      this.writes++;
      return super.saveIfVersion(input);
    }
    override async appendRevision(input: Parameters<PostRepoPort["appendRevision"]>[0]) {
      this.appends++;
      return super.appendRevision(input);
    }
  }
  const repo = new CountingRepo();
  const post = (await createPost({ deps: { repo, clock }, input: { ...key, title: "Hello" } })).post;
  const before = [repo.writes, repo.appends];
  for (const expectedVersion of [post.version, undefined]) {
    await updatePost({ deps: { repo, clock, outbox: new InMemoryOutbox() }, input: inputFor(post, { expectedVersion }) });
    assert.deepEqual([repo.writes, repo.appends], before);
  }
});

test("an unchanged request rechecks its version after an awaited plugin hook", async () => {
  const repo = new InMemoryPostRepo();
  const post = (await createPost({ deps: { repo, clock }, input: { ...key, title: "Hello" } })).post;
  const deps = { repo, clock, outbox: new InMemoryOutbox() };
  assert.equal((await updatePost({ deps, input: inputFor(post) })).post.version, post.version);
  await assert.rejects(updatePost({
    deps: { ...deps, beforeSaveHook: async () => {
      // Another writer changes only metadata/version: equality must not hide the stale basis.
      await repo.save({ ...post, version: post.version + 1 });
      return {};
    } }, input: inputFor(post),
  }), PostVersionConflictError);
  assert.equal((await repo.listRevisions(revisionKey)).length, 1);
});
