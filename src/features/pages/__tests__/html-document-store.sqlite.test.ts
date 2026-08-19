import assert from "node:assert/strict";
import test from "node:test";

import type { ClockPort } from "@jini-ai/cms/core";
import { openContentDb, type ContentDb } from "#src/db/sqlite/content-db";
import { InMemoryEntryRefsRepo } from "#src/core/entry-refs/repo.memory";
import { PageConcurrentEditError, PageNotFoundError, PagesHtmlDocumentStore } from "../html-document-store.sqlite.js";

/**
 * @file SPEC-047/ADR-056 REQ-4 — certification of `PagesHtmlDocumentStore`, including CIC-1's
 * compare-and-set write.
 *
 * Real `content.db` (`:memory:`, full migration stream) throughout, per Constitution Article V and
 * matching `search-index.sqlite.test.ts`'s own precedent for this exact table.
 */

const WS = "ws-pages";
const OTHER_WS = "ws-other";

const clock: ClockPort = { nowIso: () => "2026-08-04T00:00:00.000Z" };

function harness(): { db: ContentDb } {
  return { db: openContentDb(":memory:") };
}

/** Inserts a `"html"`-format Page row directly — `createPost`/`updatePost` can never produce this
 * shape (CIC-3), so every test here seeds through raw SQL, matching how `PagesHtmlDocumentStore`
 * itself is the only writer of this shape in production. */
function insertHtmlPage(db: ContentDb, spec: { id: string; workspaceId?: string; html: string; version?: number }): void {
  db.$client
    .prepare(
      `INSERT INTO posts (id, workspace_id, title, slug, body_json, body_format, body_html, status, kind, updated_at, version, ext)
       VALUES (?, ?, 'About', 'about', NULL, 'html', ?, 'draft', 'page', '2026-08-01T00:00:00.000Z', ?, '{}')`
    )
    .run(spec.id, spec.workspaceId ?? WS, spec.html, spec.version ?? 1);
}

function readRow(db: ContentDb, id: string): { bodyHtml: string | null; version: number; bodyFormat: string } {
  return db.$client.prepare("SELECT body_html AS bodyHtml, version, body_format AS bodyFormat FROM posts WHERE id = ?").get(id) as {
    bodyHtml: string | null;
    version: number;
    bodyFormat: string;
  };
}

// ---------------------------------------------------------------------------
// read()
// ---------------------------------------------------------------------------

test("read() returns the current body_html of an existing html-format page", async () => {
  const { db } = harness();
  insertHtmlPage(db, { id: "page-1", html: "<section data-agent-element=\"hero\">Hi</section>" });
  const store = new PagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { db, clock });

  const html = await store.read();
  assert.equal(html, "<section data-agent-element=\"hero\">Hi</section>");
});

test("read() throws PageNotFoundError for an id that does not exist", async () => {
  const { db } = harness();
  const store = new PagesHtmlDocumentStore({ workspaceId: WS, postId: "missing" }, { db, clock });

  await assert.rejects(() => store.read(), PageNotFoundError);
});

test("read() throws PageNotFoundError for a 'doc'-format row with the same id — indistinguishable from not-found", async () => {
  const { db } = harness();
  db.$client
    .prepare(
      `INSERT INTO posts (id, workspace_id, title, slug, body_json, body_format, body_html, status, kind, updated_at, version, ext)
       VALUES ('post-1', ?, 'Hello', 'hello', '{"type":"doc","content":[]}', 'doc', NULL, 'draft', 'post', '2026-08-01T00:00:00.000Z', 1, '{}')`
    )
    .run(WS);
  const store = new PagesHtmlDocumentStore({ workspaceId: WS, postId: "post-1" }, { db, clock });

  await assert.rejects(() => store.read(), PageNotFoundError);
});

test("read() is workspace-scoped — a page in another workspace is not found", async () => {
  const { db } = harness();
  insertHtmlPage(db, { id: "page-1", workspaceId: OTHER_WS, html: "<p>x</p>" });
  const store = new PagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { db, clock });

  await assert.rejects(() => store.read(), PageNotFoundError);
});

// ---------------------------------------------------------------------------
// write()
// ---------------------------------------------------------------------------

test("write() after read() updates body_html and increments version", async () => {
  const { db } = harness();
  insertHtmlPage(db, { id: "page-1", html: "<p>old</p>", version: 5 });
  const store = new PagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { db, clock });

  await store.read();
  await store.write("<p>new</p>");

  const row = readRow(db, "page-1");
  assert.equal(row.bodyHtml, "<p>new</p>");
  assert.equal(row.version, 6);
});

test("write() before any read() throws — there is no version to condition the write on", async () => {
  const { db } = harness();
  insertHtmlPage(db, { id: "page-1", html: "<p>old</p>" });
  const store = new PagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { db, clock });

  await assert.rejects(() => store.write("<p>new</p>"), /before read\(\)/);
});

test("write() lets a single instance write repeatedly with no intervening read() — mirrors createHtmlRegionTarget's restore() calling write() several times in one pass", async () => {
  const { db } = harness();
  insertHtmlPage(db, { id: "page-1", html: "<p>v1</p>", version: 1 });
  const store = new PagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { db, clock });

  await store.read();
  await store.write("<p>v2</p>");
  await store.write("<p>v3</p>");

  const row = readRow(db, "page-1");
  assert.equal(row.bodyHtml, "<p>v3</p>");
  assert.equal(row.version, 3, "each write must condition on the version the PREVIOUS write in this instance just produced");
});

// ---------------------------------------------------------------------------
// CIC-1 — compare-and-set, the mandatory interleaving test.
//
// Two separate EditTarget-style callers (two separate PagesHtmlDocumentStore instances, exactly
// what two concurrent admin sessions or a retried tool call racing an in-flight one would be) both
// read() the same row, then write() in sequence: read, read, write, write. The second write must be
// REJECTED, not silently applied on top of content it never saw.
// ---------------------------------------------------------------------------

test("CIC-1: two readers, then two writers (read, read, write, write) — the second, stale writer is rejected, never silently applied", async () => {
  const { db } = harness();
  insertHtmlPage(db, { id: "page-1", html: "<p>base</p>", version: 1 });

  // Two independent instances, exactly as two concurrent EditTarget callers would be.
  const writerA = new PagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { db, clock });
  const writerB = new PagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { db, clock });

  // Both read the SAME base version (1) — interleaved before either has written.
  const seenByA = await writerA.read();
  const seenByB = await writerB.read();
  assert.equal(seenByA, "<p>base</p>");
  assert.equal(seenByB, "<p>base</p>");

  // A writes first and succeeds.
  await writerA.write("<p>A's edit</p>");
  const afterA = readRow(db, "page-1");
  assert.equal(afterA.bodyHtml, "<p>A's edit</p>");
  assert.equal(afterA.version, 2);

  // B writes next, still conditioned on the version it read (1) — the row is now at version 2, so
  // this MUST be rejected, never silently overwrite A's committed edit.
  await assert.rejects(
    () => writerB.write("<p>B's edit, computed against a document A already changed</p>"),
    PageConcurrentEditError
  );

  // A's edit must survive untouched — this is the actual data-loss/corruption CIC-1 exists to
  // prevent, not just "an error was thrown somewhere."
  const finalRow = readRow(db, "page-1");
  assert.equal(finalRow.bodyHtml, "<p>A's edit</p>", "B's rejected write must not have landed, even partially");
  assert.equal(finalRow.version, 2, "a rejected write must not bump the version either");
});

test("CIC-1: after a rejection, re-read() gives the writer a fresh version it can then successfully write with", async () => {
  const { db } = harness();
  insertHtmlPage(db, { id: "page-1", html: "<p>base</p>", version: 1 });

  const writerA = new PagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { db, clock });
  const writerB = new PagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { db, clock });

  await writerA.read();
  await writerB.read();
  await writerA.write("<p>A's edit</p>");
  await assert.rejects(() => writerB.write("<p>stale</p>"), PageConcurrentEditError);

  // The documented recovery path: re-read, then retry.
  const freshRead = await writerB.read();
  assert.equal(freshRead, "<p>A's edit</p>", "the retry must see A's committed edit, not the stale base");

  await writerB.write("<p>B's edit, now based on A's content</p>");
  const finalRow = readRow(db, "page-1");
  assert.equal(finalRow.bodyHtml, "<p>B's edit, now based on A's content</p>");
  assert.equal(finalRow.version, 3);
});

test("write()'s WHERE clause is bodyFormat-scoped in its own right, not just version-scoped: a row converted to 'doc' out-of-band after read() rejects the write even though the version still matches", async () => {
  const { db } = harness();
  insertHtmlPage(db, { id: "page-1", html: "<p>base</p>", version: 1 });
  const store = new PagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { db, clock });

  await store.read();

  // Simulate some other process changing this row's format without touching version — the point is
  // that write()'s own WHERE clause defends against writing html into a non-html row independently
  // of the version check, not merely as a side effect of it.
  db.$client.prepare("UPDATE posts SET body_format = 'doc', body_html = NULL, body_json = '{}' WHERE id = 'page-1'").run();

  await assert.rejects(() => store.write("<p>should never land</p>"), PageConcurrentEditError);

  const row = readRow(db, "page-1");
  assert.equal(row.bodyFormat, "doc", "the row must stay doc-format — the html write must not have landed");
});

// ---------------------------------------------------------------------------
// SPEC-047 Slice 3 — entry_refs reindexing (optional `entryRefsRepo` dependency).
// ---------------------------------------------------------------------------

test("write() with entryRefsRepo supplied replaces this page's entry_refs to match the newly-written html's embeds", async () => {
  const { db } = harness();
  insertHtmlPage(db, { id: "page-1", html: "<p>no embeds yet</p>", version: 1 });
  const entryRefsRepo = new InMemoryEntryRefsRepo();
  const store = new PagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { db, clock, entryRefsRepo });

  await store.read();
  await store.write(`<div data-embed-config='{"type":"widget","id":"widget-1"}'></div>`);

  const refs = await entryRefsRepo.findBySource({ workspaceId: WS, sourceEntryId: "page-1" });
  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.sourceKind, "page-html-embed");
  assert.equal(refs[0]?.targetId, "widget-1");
});

test("write() with entryRefsRepo supplied REPLACES the prior ref set, not appends — an embed removed in a later write no longer appears", async () => {
  const { db } = harness();
  insertHtmlPage(db, { id: "page-1", html: "<p>base</p>", version: 1 });
  const entryRefsRepo = new InMemoryEntryRefsRepo();
  const store = new PagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { db, clock, entryRefsRepo });

  await store.read();
  await store.write(`<div data-embed-config='{"type":"widget","id":"widget-1"}'></div>`);
  await store.write("<p>the embed was removed in this edit</p>");

  const refs = await entryRefsRepo.findBySource({ workspaceId: WS, sourceEntryId: "page-1" });
  assert.deepEqual(refs, []);
});

test("write() with NO entryRefsRepo supplied still succeeds — the dependency is optional, not required", async () => {
  const { db } = harness();
  insertHtmlPage(db, { id: "page-1", html: "<p>base</p>", version: 1 });
  const store = new PagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { db, clock });

  await store.read();
  await store.write(`<div data-embed-config='{"type":"widget","id":"widget-1"}'></div>`);

  const row = readRow(db, "page-1");
  assert.equal(row.bodyHtml, `<div data-embed-config='{"type":"widget","id":"widget-1"}'></div>`);
});

test("write() indexes a ref for an embed pointing at an id with no corresponding widget/form row — entry_refs must see the dangling reference, not silently skip it (this store has no widget/form repo to check against, so it cannot filter on resolution status even if it wanted to)", async () => {
  const { db } = harness();
  insertHtmlPage(db, { id: "page-1", html: "<p>base</p>", version: 1 });
  const entryRefsRepo = new InMemoryEntryRefsRepo();
  const store = new PagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { db, clock, entryRefsRepo });

  await store.read();
  await store.write(`<div data-embed-config='{"type":"widget","id":"widget-does-not-exist-anywhere"}'></div>`);

  const refs = await entryRefsRepo.findBySource({ workspaceId: WS, sourceEntryId: "page-1" });
  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.targetId, "widget-does-not-exist-anywhere");
});

test("ensureHtmlFormat() reindexes entry_refs on the seeding conversion (doc -> html), using the seed html's own embeds", async () => {
  const { db } = harness();
  db.$client
    .prepare(
      `INSERT INTO posts (id, workspace_id, title, slug, body_json, body_format, body_html, status, kind, updated_at, version, ext)
       VALUES ('page-2', ?, 'New page', 'new-page', '{"type":"doc","content":[]}', 'doc', NULL, 'draft', 'page', '2026-08-01T00:00:00.000Z', 1, '{}')`
    )
    .run(WS);
  const entryRefsRepo = new InMemoryEntryRefsRepo();
  const store = new PagesHtmlDocumentStore({ workspaceId: WS, postId: "page-2" }, { db, clock, entryRefsRepo });

  await store.ensureHtmlFormat(`<div data-embed-config='{"type":"widget","id":"cf-widget-1"}'></div>`);

  const refs = await entryRefsRepo.findBySource({ workspaceId: WS, sourceEntryId: "page-2" });
  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.targetId, "cf-widget-1");
});
