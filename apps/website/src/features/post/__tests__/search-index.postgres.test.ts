import { createMediaAccessEvidence } from "@jini-ai/cms/media/site/access-evidence";
import assert from "node:assert/strict";
import { POST_SEARCH_HOST } from "../search-host-config.js";
import test from "node:test";

import { schemaErasedKernel } from "#src/platform/db/content-kernel";
import { emptiedPgContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { PostRecord } from "@jini-ai/cms/posts/post";
import { postRepoFor } from "../repo.js";
import { pgPostSearchFor } from "@jini-ai/cms/posts/sql";
import { searchAdminPosts } from "@jini-ai/cms/posts/search";

const post: PostRecord = {
  id: "cafe-guide", workspaceId: "search-ws", title: "Café guide", slug: "coffee-guide",
  kind: "post", status: "published", version: 1, updatedAt: "2026-10-04T12:00:00.000Z",
  bodyFormat: "doc", bodyHtml: null,
  bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Try crème brûlée." }] }] },
};

for (const [query, bug] of [
  ["cafe", false],
  ["café", true],
  ["cafe\u0301", true],
  ["crème brûlée", true],
] as const) {
  // F2.6/F4.4/F6.4/F7.5: real repo, projection, tokenizer and PostgreSQL query; fresh rows per case.
  // The ASCII control proves the post is indexed and visible before challenging the query folding.
  test(`${bug ? "BUG: " : ""}Postgres search finds stored accented prose for ${JSON.stringify(query)}`, async () => {
    const kernel = emptiedPgContentKernel(["posts", "post_revisions", "post_search_document"]);
    const repo = postRepoFor(kernel, { mediaAccessEvidence: createMediaAccessEvidence() });
    await repo.save(post);
    await repo.save({ ...post, id: "unrelated", title: "Unrelated", slug: "unrelated", bodyJson: { type: "doc", content: [] } });
    assert.deepEqual(await repo.findById({ workspaceId: "search-ws", id: "cafe-guide" }), {
      ...post, seoExtJson: null, deletedAt: null, templateChoice: null, overridesThemePage: null,
      memberAccessJson: null, createdByPrincipalId: null, createdAt: null,
      author: null, showAuthor: false,
    });
    const find = async (text: string) => (await searchAdminPosts({
      deps: { search: { search: (request) => pgPostSearchFor(POST_SEARCH_HOST).search(schemaErasedKernel({ store: kernel }), request) } },
      input: { workspaceId: "search-ws", query: text },
    })).hits.map(({ id, title }) => ({ id, title }));
    assert.deepEqual(await find("cafe"), [{ id: "cafe-guide", title: "Café guide" }]);
    assert.deepEqual(await find(query), [{ id: "cafe-guide", title: "Café guide" }]);
  });
}
