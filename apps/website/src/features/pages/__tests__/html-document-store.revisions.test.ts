import assert from "node:assert/strict";
import { test } from "node:test";

import type { ClockPort } from "@jini-ai/cms/core";
import { type ContentKernel, describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { postRepoFor, type SqlPostRepo } from "#src/features/post/repo";
import { SqlPagesHtmlDocumentStore } from "../html-document-store.js";

/**
 * @file S1 (fix plan 2026-09-24 row 14) — certification that `PagesHtmlDocumentStore.write`/
 * `ensureHtmlFormat` append to the `post_revisions` ledger `SqlitePostRepo` already owns, when
 * `deps.revisions` is supplied, so an html Page's edit history is recoverable the same way a Post's
 * already is (see `html-document-store.sqlite.ts`'s `PagesHtmlDocumentStoreDeps.revisions` doc).
 *
 * One kernel shared between the store and the repo, matching production (`server/deps.ts` wires
 * both off the SAME `db`) — a second database would give the two a disconnected set of rows, per
 * `html-document-store.memory.ts`'s own header on exactly this trap. Runs on SQLite and PGlite, so
 * the store's writes joining `repo.transaction()` is proven on both.
 */

const WS = "ws-pages-rev";
const clock: ClockPort = { nowIso: () => "2026-09-24T00:00:00.000Z" };


const ORIGINAL_DOC = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] };

/** Seeds a `doc`-format Page row directly — `createPost` cannot produce a `kind: "page"` row through
 *  the html store's own path being under test, so this mirrors `html-document-store.sqlite.test.ts`'s
 *  own `insertHtmlPage` helper but for the pre-conversion `doc` shape. */
async function insertPage(db: ContentKernel, spec: { id: string; html?: string }): Promise<void> {
  await db.run((q) =>
    q
      .insertInto("posts")
      .values({
        id: spec.id,
        workspace_id: WS,
        title: "About",
        slug: "about",
        body_json: spec.html === undefined ? JSON.stringify(ORIGINAL_DOC) : null,
        body_format: spec.html === undefined ? "doc" : "html",
        body_html: spec.html ?? null,
        status: "draft",
        kind: "page",
        updated_at: "2026-09-01T00:00:00.000Z",
        version: 1,
        ext: "{}",
      })
      .execute()
  );
}

describeEachDialect("SqlPagesHtmlDocumentStore revisions", {
  tables: ["posts", "post_revisions"],
  make: (kernel): { db: ContentKernel; repo: SqlPostRepo } => ({ db: kernel, repo: postRepoFor(kernel) }),
}, (harness) => {

  test("ensureHtmlFormat() + write() append pre-conversion, post-conversion, and post-write snapshots to post_revisions", async () => {
    const { db, repo } = harness();
    await insertPage(db, { id: "page-1" });
    const store = new SqlPagesHtmlDocumentStore(
      { workspaceId: WS, postId: "page-1", actorId: "tester-1" },
      { kernel: db, clock, revisions: repo }
    );

    await store.ensureHtmlFormat('<section data-region="a"></section>');
    await store.write('<section data-region="a">x</section>');

    const revisions = await repo.listRevisions({ workspaceId: WS, postId: "page-1" });
    assert.equal(revisions.length, 3, "pre-conversion, post-conversion, and post-write — one row each");

    assert.equal(revisions[0].seq, 1);
    assert.deepEqual(revisions[0].stateJson.bodyJson, ORIGINAL_DOC, "the pre-conversion row must still hold the original doc body — it is the only recovery path once ensureHtmlFormat nulls body_json");

    assert.equal(revisions[1].seq, 2);
    assert.equal(revisions[1].stateJson.bodyHtml, '<section data-region="a"></section>');

    assert.equal(revisions[2].seq, 3);
    assert.equal(revisions[2].stateJson.bodyHtml, '<section data-region="a">x</section>');
    assert.equal(revisions[2].actorId, "tester-1");
  });

  test("ensureHtmlFormat() on an already-html page appends no pre-conversion snapshot — it never converts anything", async () => {
    const { db, repo } = harness();
    await insertPage(db, { id: "page-2", html: "<p>seed</p>" });
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-2" }, { kernel: db, clock, revisions: repo });

    await store.ensureHtmlFormat("<p>ignored, already born</p>");

    const revisions = await repo.listRevisions({ workspaceId: WS, postId: "page-2" });
    assert.equal(revisions.length, 0);
  });

  test("without deps.revisions, write() and ensureHtmlFormat() behave exactly as before — no ledger, no error", async () => {
    const { db } = harness();
    await insertPage(db, { id: "page-3" });
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-3" }, { kernel: db, clock });

    await store.ensureHtmlFormat('<section data-region="a"></section>');
    await store.write('<section data-region="a">x</section>');

    const row = await db.run((q) => q.selectFrom("posts").select(["body_html", "version"]).where("id", "=", "page-3").executeTakeFirstOrThrow());
    assert.equal(row.body_html, '<section data-region="a">x</section>');
    assert.equal(row.version, 3);
  });
});
