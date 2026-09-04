import assert from "node:assert/strict";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { listPublishedPostPreviews, type PostRecord, type PostRepoPort } from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { SqlitePostRepo } from "../repo.sqlite.js";

/**
 * @file Certifies `PostRepoPort.listPublishedPreviews` on BOTH adapters (the rule-of-two contract
 * `post.delete.test.ts` already established for `softDelete`) and its `listPublishedPostPreviews`
 * wrapper (`post.ts`) — the bounded, query-pushed-down listing the post-previews marker
 * (`features/theme/static-render.ts`'s `injectPostPreviewsEmbeds`) depends on.
 *
 * The load-bearing property under test is REQ-25 discipline (`widgets/resolvers/recent-entries.ts`'s
 * own precedent): `kind: "post"`, `status: "published"`, non-trashed, and the `limit` itself are all
 * enforced by the QUERY — a Page or an over-limit row must never reach the caller for it to be
 * sliced away in JS, since that could silently return fewer than `limit` real posts even when more
 * exist. Route-level (HTTP) coverage of the marker's own end-to-end wiring lives in
 * `server/inbound/public-http/routes/site/__tests__/static-post-previews-resolution.test.ts`.
 */

const WORKSPACE_ID = "workspace-list-published-previews-test";

function post(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: WORKSPACE_ID,
    title: "Post",
    slug: "post-1",
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "published",
    kind: "post",
    updatedAt: "2026-09-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  } as PostRecord;
}

const ADAPTERS: { name: string; make: () => PostRepoPort }[] = [
  { name: "InMemoryPostRepo", make: () => new InMemoryPostRepo() },
  { name: "SqlitePostRepo", make: () => new SqlitePostRepo(openContentDb(":memory:")) },
];

for (const adapter of ADAPTERS) {
  test(`${adapter.name}: listPublishedPreviews returns only published, non-trashed kind:"post" rows`, async () => {
    const repo = adapter.make();
    await repo.save(post({ id: "published-post", slug: "published-post" }));
    await repo.save(post({ id: "draft-post", slug: "draft-post", status: "draft" }));
    await repo.save(post({ id: "a-page", slug: "a-page", kind: "page" }));
    const trashed = post({ id: "trashed-post", slug: "trashed-post" });
    await repo.save(trashed);
    await repo.softDelete({ workspaceId: WORKSPACE_ID, id: "trashed-post", deletedAt: "2026-09-02T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z", version: 2 });

    const rows = await repo.listPublishedPreviews({ workspaceId: WORKSPACE_ID, limit: 10 });
    assert.deepEqual(rows.map((r) => r.id).sort(), ["published-post"]);
  });

  test(`${adapter.name}: listPublishedPreviews orders newest updatedAt first`, async () => {
    const repo = adapter.make();
    await repo.save(post({ id: "oldest", slug: "oldest", updatedAt: "2026-01-01T00:00:00.000Z" }));
    await repo.save(post({ id: "newest", slug: "newest", updatedAt: "2026-09-01T00:00:00.000Z" }));
    await repo.save(post({ id: "middle", slug: "middle", updatedAt: "2026-05-01T00:00:00.000Z" }));

    const rows = await repo.listPublishedPreviews({ workspaceId: WORKSPACE_ID, limit: 10 });
    assert.deepEqual(rows.map((r) => r.id), ["newest", "middle", "oldest"]);
  });

  test(`${adapter.name}: listPublishedPreviews is bounded by limit even when more rows exist`, async () => {
    const repo = adapter.make();
    for (let i = 0; i < 5; i += 1) {
      await repo.save(post({ id: `post-${i}`, slug: `post-${i}`, updatedAt: `2026-0${i + 1}-01T00:00:00.000Z` }));
    }

    const rows = await repo.listPublishedPreviews({ workspaceId: WORKSPACE_ID, limit: 2 });
    assert.equal(rows.length, 2, "the query itself must cap the row count at limit, not return every row for the caller to slice");
    assert.deepEqual(rows.map((r) => r.id), ["post-4", "post-3"]);
  });

  test(`${adapter.name}: listPublishedPreviews is workspace-scoped`, async () => {
    const repo = adapter.make();
    await repo.save(post({ id: "this-workspace", slug: "this-workspace" }));
    await repo.save(post({ id: "other-workspace", slug: "other-workspace", workspaceId: "some-other-workspace" }));

    const rows = await repo.listPublishedPreviews({ workspaceId: WORKSPACE_ID, limit: 10 });
    assert.deepEqual(rows.map((r) => r.id), ["this-workspace"]);
  });
}

test("listPublishedPostPreviews: wraps the bounded repo call, returning only what the repo already filtered", async () => {
  const repo = new InMemoryPostRepo([
    post({ id: "one", slug: "one" }),
    post({ id: "two", slug: "two", kind: "page" }),
  ]);
  const { posts } = await listPublishedPostPreviews({ deps: { repo }, input: { workspaceId: WORKSPACE_ID, limit: 10 } });
  assert.deepEqual(posts.map((p) => p.id), ["one"]);
});
