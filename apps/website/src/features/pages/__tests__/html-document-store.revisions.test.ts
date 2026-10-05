import assert from "node:assert/strict";
import { test } from "node:test";

import type { Clock as ClockPort } from "@jini-ai/core/primitives";
import { type ContentKernel, describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { postRepoFor, type SqlPostRepo } from "#src/features/post/repo";
import { PageConcurrentEditError, SqlPagesHtmlDocumentStore } from "../html-document-store.js";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

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
const clock: ClockPort & { nowMs(): number } = createFakeClock({ startIso: "2026-09-24T00:00:00.000Z" });


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
        slug: `slug-${spec.id}`,
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
  test("a failed revision append rolls back the page update and ledger for writes and conversions", async () => {
    const { db, repo } = harness();
    for (const operation of ["write", "convert"] as const) {
      const id = `rollback-${operation}`;
      await insertPage(db, { id, ...(operation === "write" ? { html: "<p>original</p>" } : {}) });
      const before = await db.run((q) => q.selectFrom("posts").selectAll().where("id", "=", id).executeTakeFirstOrThrow());
      const append = repo.appendRevision.bind(repo);
      const failure = new Error("ledger append failed");
      const revisions = {
        findById: repo.findById.bind(repo),
        listRevisions: repo.listRevisions.bind(repo),
        transaction: repo.transaction.bind(repo),
        appendRevision: async (input: Parameters<typeof repo.appendRevision>[0]) => {
          const appended = await append(input);
          if (input.seq === 2) throw failure; // after the UPDATE and a real ledger insert
          return appended;
        },
      };
      const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: id }, { kernel: db, clock, revisions });
      if (operation === "write") await store.read();
      await assert.rejects(
        operation === "write" ? store.write("<p>new</p>") : store.ensureHtmlFormat("<p>converted</p>"),
        (err) => err === failure
      );
      assert.deepEqual(await db.run((q) => q.selectFrom("posts").selectAll().where("id", "=", id).executeTakeFirstOrThrow()), before);
      assert.deepEqual(await repo.listRevisions({ workspaceId: WS, postId: id }), []);
    }
  });

  test("a rejected stale write leaves the winning page and revision ledger unchanged", async () => {
    const { db, repo } = harness();
    await insertPage(db, { id: "stale-write", html: "<p>base</p>" });
    const scope = { workspaceId: WS, postId: "stale-write" };
    const deps = { kernel: db, clock, revisions: repo };
    const winner = new SqlPagesHtmlDocumentStore(scope, deps);
    const stale = new SqlPagesHtmlDocumentStore(scope, deps);
    await winner.read();
    await stale.read();
    await winner.write("<p>winner</p>");
    const before = await repo.listRevisions(scope);
    await assert.rejects(stale.write("<p>loser</p>"), PageConcurrentEditError);
    assert.deepEqual(await repo.listRevisions(scope), before);
    assert.equal(await winner.read(), "<p>winner</p>");
  });

  test("a conversion CAS failure rolls back its pre-conversion snapshot and preserves the winning edit", async () => {
    const { db, repo } = harness();
    const id = "stale-conversion";
    await insertPage(db, { id });
    let winningRow: unknown;
    const revisions = {
      findById: repo.findById.bind(repo),
      listRevisions: repo.listRevisions.bind(repo),
      appendRevision: repo.appendRevision.bind(repo),
      transaction: async <T>(fn: () => Promise<T>): Promise<T> => {
        // Another writer commits after ensureHtmlFormat's SELECT, before its transaction.
        await db.run((q) => q.updateTable("posts").set({ version: 2, title: "winning edit" }).where("id", "=", id).execute());
        winningRow = await db.run((q) => q.selectFrom("posts").selectAll().where("id", "=", id).executeTakeFirstOrThrow());
        return repo.transaction(fn);
      },
    };
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: id }, { kernel: db, clock, revisions });
    await assert.rejects(store.ensureHtmlFormat("<p>loser</p>"), PageConcurrentEditError);
    assert.deepEqual(await db.run((q) => q.selectFrom("posts").selectAll().where("id", "=", id).executeTakeFirstOrThrow()), winningRow);
    assert.deepEqual(await repo.listRevisions({ workspaceId: WS, postId: id }), []);
  });

});
