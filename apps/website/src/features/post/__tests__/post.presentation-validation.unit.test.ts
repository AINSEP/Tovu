import assert from "node:assert/strict";
import test from "node:test";
import { createPost, updatePost, PostValidationError, type CreatePostInput, type UpdatePostInput } from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRecord } from "./post-record.fixture.js";

import { InMemoryOutbox } from "#src/contracts/core/events/index";

const clock = { nowMs: () => 0 };

for (const operation of ["create", "update"] as const) {
  test(`${operation}: invalid presentation fields are refused before saving a post or revision`, async () => {
    for (const patch of [{ templateChoice: 12 }, { templateChoice: {} }, { overridesThemePage: "false" }, { overridesThemePage: 0 }]) {
      const existing = buildPostRecord();
      const repo = new InMemoryPostRepo(operation === "update" ? [existing] : []);
      const input = { ...existing, ...patch };
      const write = operation === "create"
        ? createPost({ deps: { repo, clock }, input: input as unknown as CreatePostInput })
        : updatePost({ deps: { repo, clock, outbox: new InMemoryOutbox() }, input: input as unknown as UpdatePostInput });
      await assert.rejects(write, PostValidationError, JSON.stringify(patch));
      assert.deepEqual(await repo.list({ workspaceId: existing.workspaceId }), operation === "update" ? [existing] : []);
      assert.deepEqual(await repo.listRevisions({ workspaceId: existing.workspaceId, postId: existing.id }), []);
    }
  });

  test(`${operation}: null, empty template and false retain their distinct presentation choices`, async () => {
    for (const patch of [{ templateChoice: null, overridesThemePage: null }, { templateChoice: "", overridesThemePage: false }, { templateChoice: "article.html", overridesThemePage: true }]) {
      const existing = buildPostRecord({ templateChoice: "old.html", overridesThemePage: true });
      const repo = new InMemoryPostRepo(operation === "update" ? [existing] : []);
      const input = { ...existing, ...patch };
      const result = operation === "create" ? await createPost({ deps: { repo, clock }, input }) : await updatePost({ deps: { repo, clock, outbox: new InMemoryOutbox() }, input });
      assert.equal(result.post.templateChoice, patch.templateChoice);
      assert.equal(result.post.overridesThemePage, patch.overridesThemePage);
    }
  });
}
