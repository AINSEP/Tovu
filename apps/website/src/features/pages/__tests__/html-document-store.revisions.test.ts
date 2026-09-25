import assert from "node:assert/strict";
import test from "node:test";

import type { ClockPort } from "@jini-ai/cms/core";
import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";
import { SqlitePostRepo } from "#src/features/post/repo.sqlite";
import { PagesHtmlDocumentStore } from "../html-document-store.sqlite.js";

/**
 * @file S1 (fix plan 2026-09-24 row 14) — certification that `PagesHtmlDocumentStore.write`/
 * `ensureHtmlFormat` append to the `post_revisions` ledger `SqlitePostRepo` already owns, when
 * `deps.revisions` is supplied, so an html Page's edit history is recoverable the same way a Post's
 * already is (see `html-document-store.sqlite.ts`'s `PagesHtmlDocumentStoreDeps.revisions` doc).
 *
 * One `ContentDb` shared between the store and the repo, matching production (`server/deps.ts`
 * wires both off the SAME `db`) — a second `:memory:` handle would give the two a disconnected set
 * of rows, per `html-document-store.memory.ts`'s own header on exactly this trap.
 */

const WS = "ws-pages-rev";
const clock: ClockPort = { nowIso: () => "2026-09-24T00:00:00.000Z" };

function harness(): { db: ContentDb; repo: SqlitePostRepo } {
  const db = openContentDb(":memory:");
  return { db, repo: new SqlitePostRepo(db) };
}

const ORIGINAL_DOC = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] };

/** Seeds a `doc`-format Page row directly — `createPost` cannot produce a `kind: "page"` row through
 *  the html store's own path being under test, so this mirrors `html-document-store.sqlite.test.ts`'s
 *  own `insertHtmlPage` helper but for the pre-conversion `doc` shape. */
function insertDocPage(db: ContentDb, spec: { id: string; workspaceId?: string }): void {
  db.$client
    .prepare(
      `INSERT INTO posts (id, workspace_id, title, slug, body_json, body_format, body_html, status, kind, updated_at, version, ext)
       VALUES (?, ?, 'About', 'about', ?, 'doc', NULL, 'draft', 'page', '2026-09-01T00:00:00.000Z', 1, '{}')`
    )
    .run(spec.id, spec.workspaceId ?? WS, JSON.stringify(ORIGINAL_DOC));
}

test("ensureHtmlFormat() + write() append pre-conversion, post-conversion, and post-write snapshots to post_revisions", async () => {
  const { db, repo } = harness();
  insertDocPage(db, { id: "page-1" });
  const store = new PagesHtmlDocumentStore(
    { workspaceId: WS, postId: "page-1", actorId: "tester-1" },
    { db, clock, revisions: repo }
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
  db.$client
    .prepare(
      `INSERT INTO posts (id, workspace_id, title, slug, body_json, body_format, body_html, status, kind, updated_at, version, ext)
       VALUES ('page-2', ?, 'About', 'about', NULL, 'html', '<p>seed</p>', 'draft', 'page', '2026-09-01T00:00:00.000Z', 1, '{}')`
    )
    .run(WS);
  const store = new PagesHtmlDocumentStore({ workspaceId: WS, postId: "page-2" }, { db, clock, revisions: repo });

  await store.ensureHtmlFormat("<p>ignored, already born</p>");

  const revisions = await repo.listRevisions({ workspaceId: WS, postId: "page-2" });
  assert.equal(revisions.length, 0);
});

test("without deps.revisions, write() and ensureHtmlFormat() behave exactly as before — no ledger, no error", async () => {
  const { db } = harness();
  insertDocPage(db, { id: "page-3" });
  const store = new PagesHtmlDocumentStore({ workspaceId: WS, postId: "page-3" }, { db, clock });

  await store.ensureHtmlFormat('<section data-region="a"></section>');
  await store.write('<section data-region="a">x</section>');

  const row = db.$client.prepare("SELECT body_html AS bodyHtml, version FROM posts WHERE id = ?").get("page-3") as {
    bodyHtml: string;
    version: number;
  };
  assert.equal(row.bodyHtml, '<section data-region="a">x</section>');
  assert.equal(row.version, 3);
});
