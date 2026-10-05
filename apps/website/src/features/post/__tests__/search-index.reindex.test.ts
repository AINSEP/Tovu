import assert from "node:assert/strict";
import test from "node:test";

import type { UUID } from "@jini-ai/core/primitives";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "../../../platform/db/content-kernel.js";
import type { PostRecord } from "../post.js";
import { postRepoFor } from "../repo.js";
import { searchAdminPosts } from "../search.js";
import { PostSearchIndex, postSearchFor, preparePostSearchIndex } from "../search-index.js";

// The boot step under test (RED before it existed: the boot only filled MISSING projections, so the
// first post-boot search below found nothing). batchSize 1 makes the rebuild cross page boundaries.
const boot = (kernel: ContentKernel) => preparePostSearchIndex(kernel, { batchSize: 1 });

// f7ca1e766 follow-up: rows indexed before HTML bodies were projected (and before query folding) must
// be corrected by boot alone, with nobody resaving a post — and only once.
const page: PostRecord = {
  id: "studio", workspaceId: "reindex-ws", title: "Studio", slug: "studio", kind: "page",
  status: "published", version: 1, updatedAt: "2026-10-04T12:00:00.000Z",
  bodyFormat: "html", bodyHtml: "<p>Needleword and café.</p>",
  bodyJson: { type: "doc", content: [] },
};
const docPost: PostRecord = {
  ...page, id: "notes", slug: "notes", title: "Notes", kind: "post", bodyFormat: "doc", bodyHtml: null,
  bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Plainword" }] }] },
};

/** What the pre-f7ca1e766 projection wrote for an HTML post: the empty doc placeholder's text. */
async function writeLegacyProjection(kernel: ContentKernel, post: PostRecord): Promise<void> {
  await postSearchFor(kernel).upsert(kernel, { postId: post.id as UUID, title: post.title, slug: post.slug, bodyText: "" });
}

const tables = ["posts", "post_revisions", "post_search_document", "setting_values_global"];
for (const dialect of eachDialect({ tables, make: (kernel) => kernel })) {
  test(`${dialect.name}: boot re-indexes legacy projections once, without a resave`, async (t) => {
    const kernel = dialect.make();
    if (dialect.dialect === "sqlite") t.after(() => kernel.close());
    const repo = postRepoFor(kernel);
    const search = new PostSearchIndex(kernel);
    const find = async (query: string) => (await searchAdminPosts({
      deps: { search }, input: { workspaceId: "reindex-ws", query },
    })).hits.map((hit) => hit.id).sort();

    await repo.save(page);
    await repo.save(docPost);
    await writeLegacyProjection(kernel, page);
    assert.deepEqual(await find("needleword"), []);
    assert.deepEqual(await find("café"), []);

    // First boot: every post re-projected (one batch boundary crossed), stale HTML rows fixed.
    const first = await boot(kernel);
    assert.deepEqual(await find("needleword"), ["studio"]);
    assert.deepEqual(await find("café"), ["studio"]);
    assert.deepEqual(await find("cafe"), ["studio"]);
    assert.deepEqual(await find("plainword"), ["notes"]);
    assert.deepEqual(first, { reindexed: 2, backfilled: 0 });

    // Second boot: the stored projection version is current, so nothing is rebuilt. Proven by a
    // deliberately stale row surviving it (a rebuild would have corrected it).
    await writeLegacyProjection(kernel, page);
    assert.deepEqual(await boot(kernel), { reindexed: 0, backfilled: 0 });
    assert.deepEqual(await find("needleword"), []);
  });
}
