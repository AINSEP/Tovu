import assert from "node:assert/strict";
import test from "node:test";

import { emptiedPgContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { PostRecord } from "../post.js";
import { postRepoFor } from "../repo.js";
import { foldForIndex, pgPostSearch } from "../search-index.postgres.js";
import { searchAdminPosts } from "../search.js";

const post: PostRecord = {
  id: "cafe-guide", workspaceId: "search-ws", title: "Café guide", slug: "coffee-guide",
  kind: "post", status: "published", version: 1, updatedAt: "2026-10-04T12:00:00.000Z",
  bodyFormat: "doc", bodyHtml: null,
  bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Try crème brûlée." }] }] },
};

// F1.1/F4.3: replacing NFKD with NFC, or dropping separator normalization, changes these literals.
test("Postgres indexing folds combining marks, compatibility characters and punctuation into searchable words", () => {
  assert.equal(foldForIndex("  CAFÉ\u0301—crème/brûlée!  "), "CAFE creme brulee");
  assert.equal(foldForIndex("Ｆｕｌｌ １２３ ﬃ 日本語"), "Full 123 ffi 日本語");
  assert.equal(foldForIndex("!?\t\n"), "");
});

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
    const repo = postRepoFor(kernel);
    await repo.save(post);
    await repo.save({ ...post, id: "unrelated", title: "Unrelated", slug: "unrelated", bodyJson: { type: "doc", content: [] } });
    assert.deepEqual(await repo.findById({ workspaceId: "search-ws", id: "cafe-guide" }), {
      ...post, seoExtJson: null, deletedAt: null, templateChoice: null, overridesThemePage: null,
      memberAccessJson: null, createdByPrincipalId: null, createdAt: null,
    });
    const find = async (text: string) => (await searchAdminPosts({
      deps: { search: { search: (request) => pgPostSearch.search(kernel, request) } },
      input: { workspaceId: "search-ws", query: text },
    })).hits.map(({ id, title }) => ({ id, title }));
    assert.deepEqual(await find("cafe"), [{ id: "cafe-guide", title: "Café guide" }]);
    assert.deepEqual(await find(query), [{ id: "cafe-guide", title: "Café guide" }]);
  });
}
