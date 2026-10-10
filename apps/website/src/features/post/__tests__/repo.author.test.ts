import assert from "node:assert/strict";
import test from "node:test";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { createPost, updatePost, type PostRepoPort } from "../post.js";
import { postRepoFor } from "../repo.js";

const clock = { nowMs: () => Date.parse("2026-10-09T00:00:00Z") };

describeEachDialect<PostRepoPort>("post author", { tables: ["posts", "post_revisions"], make: postRepoFor }, (makeRepo) => {
  test("author and showAuthor round-trip through insert, CAS update, omission, clearing, and revisions", async () => {
    const repo = makeRepo();
    const created = (await createPost({ deps: { repo, clock }, input: {
      workspaceId: "ws-author", id: "p-author", title: "Authored", author: "A & B", showAuthor: true, actorId: "human",
    } })).post;
    const key = { workspaceId: created.workspaceId, id: created.id };
    assert.deepEqual([(await repo.findById(key))?.author, (await repo.findById(key))?.showAuthor], ["A & B", true]);
    const deps = { repo, clock, outbox: new InMemoryOutbox() };
    const base = { ...key, title: created.title, slug: created.slug, bodyJson: created.bodyJson, status: created.status };
    const kept = (await updatePost({ deps, input: { ...base, expectedVersion: 1 } })).post;
    assert.deepEqual([kept.author, kept.showAuthor], ["A & B", true]);
    await updatePost({ deps, input: { ...base, expectedVersion: 2, author: null, showAuthor: false } });
    const cleared = await repo.findById(key);
    assert.deepEqual([cleared?.author, cleared?.showAuthor], [null, false]);
    assert.equal(cleared?.createdByPrincipalId, "human");
    const history = await repo.listRevisions({ workspaceId: key.workspaceId, postId: key.id });
    assert.deepEqual(history.map(r => [r.stateJson.author, r.stateJson.showAuthor]), [["A & B", true], ["A & B", true], [null, false]]);
    await repo.save({ ...cleared!, author: "Restored Credit", showAuthor: true });
    assert.deepEqual([(await repo.findById(key))?.author, (await repo.findById(key))?.showAuthor], ["Restored Credit", true]);
  });
});
