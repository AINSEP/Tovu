/** @file Owner request 2026-10-11: public post/page writes never claim admin or api. */
import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { createPost, updatePost, PostValidationError } from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";

const workspaceId = "reserved-slugs";
const clock = { nowMs: () => Date.parse("2026-10-11T00:00:00Z") };

for (const kind of ["post", "page"] as const) {
  for (const slug of ["admin", "API", "Admin"]) {
    test(`${kind}: explicit ${slug} is refused on create and rename without writes`, async () => {
      const repo = new InMemoryPostRepo();
      const deps = { repo, clock, outbox: new InMemoryOutbox() };
      const expected = (error: unknown) => {
        assert.ok(error instanceof PostValidationError);
        assert.equal(error.message, `slug '${slug.toLowerCase()}' is reserved`);
        return true;
      };
      await assert.rejects(createPost({ deps, input: { workspaceId, id: "bad", kind, title: "Safe", slug } }), expected);
      assert.equal(await repo.findById({ workspaceId, id: "bad" }), null);
      const { post } = await createPost({ deps, input: { workspaceId, id: "safe", kind, title: "Safe" } });
      await assert.rejects(updatePost({ deps, input: { workspaceId, id: post.id, title: post.title, slug, status: post.status, bodyJson: post.bodyJson, expectedVersion: post.version } }), expected);
      assert.deepEqual(await repo.findById({ workspaceId, id: post.id }), post);
      assert.equal((await repo.listRevisions({ workspaceId, postId: post.id })).length, 1);
    });
  }

  for (const title of ["Admin", "API"]) {
    test(`${kind}: derived ${title} skips the reserved base and occupied suffixes`, async () => {
      const repo = new InMemoryPostRepo();
      const deps = { repo, clock };
      const firstSuffix = kind === "post" ? 1 : 2;
      const first = await createPost({ deps, input: { workspaceId, id: "first", kind, title } });
      const second = await createPost({ deps, input: { workspaceId, id: "second", kind, title } });
      assert.equal(first.post.slug, `${title.toLowerCase()}-${firstSuffix}`);
      assert.equal(second.post.slug, `${title.toLowerCase()}-${firstSuffix + 1}`);
    });
  }
}

test("an unpublished automatic post slug follows the title onto API with collision suffixing", async () => {
  const repo = new InMemoryPostRepo();
  const deps = { repo, clock, outbox: new InMemoryOutbox() };
  const { post } = await createPost({ deps, input: { workspaceId, id: "draft", title: "Safe" } });
  await createPost({ deps, input: { workspaceId, id: "occupied", title: "API" } });
  const result = await updatePost({ deps, input: { workspaceId, id: post.id, title: "api", slugFromTitle: true, status: "draft", bodyJson: post.bodyJson, expectedVersion: post.version } });
  assert.equal(result.post.slug, "api-2");
  assert.equal((await repo.findById({ workspaceId, id: post.id }))?.slug, "api-2");
});

test("a page may still claim the root", async () => {
  const result = await createPost({ deps: { repo: new InMemoryPostRepo(), clock }, input: { workspaceId, id: "home", title: "Home", kind: "page", slug: "/" } });
  assert.equal(result.post.slug, "/");
});
