import assert from "node:assert/strict";
import test from "node:test";

import { eachDialect, emptiedPgContentKernel } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { PostRecord } from "../post.js";
import { postRepoFor } from "../repo.js";
import { searchAdminPosts } from "../search.js";
import { backfillPostSearchIndex, PostSearchIndex, type SearchProjectionTables } from "../search-index.js";

// pb1/F2.6/F6.4: independently observe the real save and backfill paths through ranked search.
// Counterexample: retain bodyJson-only projection or omit body_format/body_html from backfill.
const page: PostRecord = {
  id: "studio", workspaceId: "pb1-ws", title: "Studio", slug: "studio", kind: "page",
  status: "published", version: 1, updatedAt: "2026-10-04T12:00:00.000Z",
  bodyFormat: "html", bodyHtml: '<p>Needleword and café.</p><script>Scriptdecoy</script>',
  bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Docdecoy" }] }] },
};

for (const dialect of eachDialect({ tables: ["posts", "post_revisions", "post_search_document"], make: (kernel) => kernel })) {
  test(`BUG: ${dialect.name} saves and backfills HTML search prose using the format discriminator`, async (t) => {
    const kernel = dialect.make();
    if (dialect.dialect === "sqlite") t.after(() => kernel.close());
    const repo = postRepoFor(kernel);
    const search = new PostSearchIndex(kernel);
    const find = async (query: string) => (await searchAdminPosts({
      deps: { search }, input: { workspaceId: "pb1-ws", query },
    })).hits;

    await repo.save(page);
    assert.deepEqual((await find("needleword")).map((hit) => hit.id), ["studio"]);
    assert.deepEqual((await find("café")).map((hit) => hit.id), ["studio"]);
    assert.deepEqual(await find("docdecoy"), []);
    assert.deepEqual(await find("scriptdecoy"), []);

    // A legacy import may have a post but no projection. Delete via SQL rather than invoking
    // production backfill helpers to arrange their own expected output.
    await kernel.run((db) => db.withTables<SearchProjectionTables>()
      .deleteFrom("post_search_document").where("post_id", "=", "studio").execute());
    assert.deepEqual(await find("needleword"), []);
    assert.equal(await backfillPostSearchIndex(kernel), 1);
    assert.deepEqual((await find("needleword")).map((hit) => hit.id), ["studio"]);
    assert.equal(await backfillPostSearchIndex(kernel), 0);

    // The same shared projection must also replace HTML text when the format changes to doc.
    await repo.save({ ...page, version: 2, bodyFormat: "doc", bodyHtml: null });
    assert.deepEqual((await find("docdecoy")).map((hit) => hit.id), ["studio"]);
    assert.deepEqual(await find("needleword"), []);
  });
}

test("BUG: PostgreSQL query folding re-tokenizes compatibility decompositions before OR syntax", async () => {
  const kernel = emptiedPgContentKernel(["posts", "post_revisions", "post_search_document"]);
  const repo = postRepoFor(kernel);
  await repo.save({ ...page, bodyFormat: "doc", bodyHtml: null,
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "½ cup crème brûlée." }] }] },
  });
  const search = new PostSearchIndex(kernel);
  for (const query of ["½", "crème", "cre\u0300me"]) {
    assert.deepEqual((await searchAdminPosts({
      deps: { search }, input: { workspaceId: "pb1-ws", query },
    })).hits.map((hit) => hit.id), ["studio"], query);
  }
});
