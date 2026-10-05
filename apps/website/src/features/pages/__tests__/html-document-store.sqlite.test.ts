import assert from "node:assert/strict";
import { test } from "node:test";

import type { Insertable, Updateable } from "kysely";

import type { Clock as ClockPort } from "@jini-ai/core/primitives";
import type { PostsTable } from "#src/platform/db/content-database.generated";
import { type ContentKernel, describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { postRepoFor } from "#src/features/post/repo";
import { buildPagesRegistrations } from "../tool-registrations.js";
import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { PageConcurrentEditError, PageKindMismatchError, PageNotFoundError, SqlPagesHtmlDocumentStore } from "../html-document-store.js";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

/**
 * @file SPEC-047/ADR-056 REQ-4 — certification of the Pages html document store, including CIC-1's
 * compare-and-set write.
 *
 * The one Kysely body (`html-document-store.ts`) on every dialect (SQLite + PGlite, storage plan §4):
 * a real migrated content database throughout, per Constitution Article V.
 */

const WS = "ws-pages";
const OTHER_WS = "ws-other";

const clock: ClockPort & { nowMs(): number } = createFakeClock({ startIso: "2026-08-04T00:00:00.000Z" });

/** Inserts a `posts` row directly — `createPost`/`updatePost` can never produce an html row
 * (CIC-3), so every test here seeds through the kernel, matching how the store itself is the only
 * writer of this shape in production. */
async function insertPost(db: ContentKernel, row: Partial<Insertable<PostsTable>> & { id: string }): Promise<void> {
  await db.run((q) =>
    q
      .insertInto("posts")
      .values({
        workspace_id: WS,
        title: "New page",
        slug: `slug-${row.id}`,
        body_json: '{"type":"doc","content":[]}',
        body_format: "doc",
        body_html: null,
        status: "draft",
        kind: "page",
        updated_at: "2026-08-01T00:00:00.000Z",
        version: 1,
        ext: "{}",
        ...row,
      })
      .execute()
  );
}

async function insertHtmlPage(db: ContentKernel, spec: { id: string; workspaceId?: string; html: string; version?: number }): Promise<void> {
  await insertPost(db, {
    id: spec.id,
    workspace_id: spec.workspaceId ?? WS,
    title: "About",
    slug: "about",
    body_json: null,
    body_format: "html",
    body_html: spec.html,
    version: spec.version ?? 1,
  });
}

async function setRow(db: ContentKernel, id: string, set: Updateable<PostsTable>): Promise<void> {
  await db.run((q) => q.updateTable("posts").set(set).where("id", "=", id).execute());
}

async function readRow(db: ContentKernel, id: string): Promise<{ bodyHtml: string | null; version: number; bodyFormat: string }> {
  const row = await db.run((q) => q.selectFrom("posts").select(["body_html", "version", "body_format"]).where("id", "=", id).executeTakeFirstOrThrow());
  return { bodyHtml: row.body_html, version: row.version, bodyFormat: row.body_format };
}

describeEachDialect("SqlPagesHtmlDocumentStore", { tables: ["posts", "post_revisions"], make: (kernel) => kernel }, (makeKernel) => {
  // ---------------------------------------------------------------------------
  // read()
  // ---------------------------------------------------------------------------

  test("read() returns the current body_html of an existing html-format page", async () => {
    const db = makeKernel();
    await insertHtmlPage(db, { id: "page-1", html: "<section data-agent-element=\"hero\">Hi</section>" });
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock });

    assert.equal(store.capturedVersion(), null);
    const html = await store.read();
    assert.equal(store.capturedVersion(), 1);
    assert.equal(html, "<section data-agent-element=\"hero\">Hi</section>");
  });

  test("read() throws PageNotFoundError for an id that does not exist", async () => {
    const db = makeKernel();
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "missing" }, { kernel: db, clock });

    await assert.rejects(() => store.read(), PageNotFoundError);
  });

  test("read() throws PageNotFoundError for a 'doc'-format row with the same id — indistinguishable from not-found", async () => {
    const db = makeKernel();
    await insertPost(db, { id: "post-1", title: "Hello", slug: "hello", kind: "post" });
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "post-1" }, { kernel: db, clock });

    await assert.rejects(() => store.read(), PageNotFoundError);
  });

  test("read() is workspace-scoped — a page in another workspace is not found", async () => {
    const db = makeKernel();
    await insertHtmlPage(db, { id: "page-1", workspaceId: OTHER_WS, html: "<p>x</p>" });
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock });

    await assert.rejects(() => store.read(), PageNotFoundError);
  });

  // ---------------------------------------------------------------------------
  // write()
  // ---------------------------------------------------------------------------

  test("write() after read() updates body_html and increments version", async () => {
    const db = makeKernel();
    await insertHtmlPage(db, { id: "page-1", html: "<p>old</p>", version: 5 });
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock });

    assert.equal(store.capturedVersion(), null);
    await store.read();
    assert.equal(store.capturedVersion(), 5);
    await store.write("<p>new</p>");
    assert.equal(store.capturedVersion(), 6);

    const row = (await readRow(db, "page-1"));
    assert.equal(row.bodyHtml, "<p>new</p>");
    assert.equal(row.version, 6);
  });

  test("write() before any read() throws — there is no version to condition the write on", async () => {
    const db = makeKernel();
    await insertHtmlPage(db, { id: "page-1", html: "<p>old</p>" });
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock });

    await assert.rejects(() => store.write("<p>new</p>"), /before read\(\)/);
  });

  test("write() lets a single instance write repeatedly with no intervening read() — mirrors createHtmlRegionTarget's restore() calling write() several times in one pass", async () => {
    const db = makeKernel();
    await insertHtmlPage(db, { id: "page-1", html: "<p>v1</p>", version: 1 });
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock });

    await store.read();
    await store.write("<p>v2</p>");
    await store.write("<p>v3</p>");

    const row = (await readRow(db, "page-1"));
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
    const db = makeKernel();
    await insertHtmlPage(db, { id: "page-1", html: "<p>base</p>", version: 1 });

    // Two independent instances, exactly as two concurrent EditTarget callers would be.
    const writerA = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock });
    const writerB = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock });

    // Both read the SAME base version (1) — interleaved before either has written.
    const seenByA = await writerA.read();
    const seenByB = await writerB.read();
    assert.equal(seenByA, "<p>base</p>");
    assert.equal(seenByB, "<p>base</p>");

    // A writes first and succeeds.
    await writerA.write("<p>A's edit</p>");
    const afterA = (await readRow(db, "page-1"));
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
    const finalRow = (await readRow(db, "page-1"));
    assert.equal(finalRow.bodyHtml, "<p>A's edit</p>", "B's rejected write must not have landed, even partially");
    assert.equal(finalRow.version, 2, "a rejected write must not bump the version either");
  });

  test("CIC-1: after a rejection, re-read() gives the writer a fresh version it can then successfully write with", async () => {
    const db = makeKernel();
    await insertHtmlPage(db, { id: "page-1", html: "<p>base</p>", version: 1 });

    const writerA = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock });
    const writerB = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock });

    await writerA.read();
    await writerB.read();
    await writerA.write("<p>A's edit</p>");
    await assert.rejects(() => writerB.write("<p>stale</p>"), PageConcurrentEditError);

    // The documented recovery path: re-read, then retry.
    const freshRead = await writerB.read();
    assert.equal(freshRead, "<p>A's edit</p>", "the retry must see A's committed edit, not the stale base");

    await writerB.write("<p>B's edit, now based on A's content</p>");
    const finalRow = (await readRow(db, "page-1"));
    assert.equal(finalRow.bodyHtml, "<p>B's edit, now based on A's content</p>");
    assert.equal(finalRow.version, 3);
  });

  test("write()'s WHERE clause is bodyFormat-scoped in its own right, not just version-scoped: a row converted to 'doc' out-of-band after read() rejects the write even though the version still matches", async () => {
    const db = makeKernel();
    await insertHtmlPage(db, { id: "page-1", html: "<p>base</p>", version: 1 });
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock });

    await store.read();

    // Simulate some other process changing this row's format without touching version — the point is
    // that write()'s own WHERE clause defends against writing html into a non-html row independently
    // of the version check, not merely as a side effect of it.
    await setRow(db, "page-1", { body_format: "doc", body_html: null, body_json: "{}" });

    await assert.rejects(() => store.write("<p>should never land</p>"), PageConcurrentEditError);

    const row = (await readRow(db, "page-1"));
    assert.equal(row.bodyFormat, "doc", "the row must stay doc-format — the html write must not have landed");
  });

  // ---------------------------------------------------------------------------
  // SPEC-047 Slice 3 — entry_refs reindexing (optional `entryRefsRepo` dependency).
  // ---------------------------------------------------------------------------

  test("write() with entryRefsRepo supplied replaces this page's entry_refs to match the newly-written html's embeds", async () => {
    const db = makeKernel();
    await insertHtmlPage(db, { id: "page-1", html: "<p>no embeds yet</p>", version: 1 });
    const entryRefsRepo = new InMemoryEntryRefsRepo();
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock, entryRefsRepo });

    await store.read();
    await store.write(`<div data-embed-config='{"type":"widget","id":"widget-1"}'></div>`);

    const refs = await entryRefsRepo.findBySource({ workspaceId: WS, sourceEntryId: "page-1" });
    assert.equal(refs.length, 1);
    assert.equal(refs[0]?.sourceKind, "page-html-embed");
    assert.equal(refs[0]?.targetId, "widget-1");
  });

  test("write() with entryRefsRepo supplied REPLACES the prior ref set, not appends — an embed removed in a later write no longer appears", async () => {
    const db = makeKernel();
    await insertHtmlPage(db, { id: "page-1", html: "<p>base</p>", version: 1 });
    const entryRefsRepo = new InMemoryEntryRefsRepo();
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock, entryRefsRepo });

    await store.read();
    await store.write(`<div data-embed-config='{"type":"widget","id":"widget-1"}'></div>`);
    await store.write("<p>the embed was removed in this edit</p>");

    const refs = await entryRefsRepo.findBySource({ workspaceId: WS, sourceEntryId: "page-1" });
    assert.deepEqual(refs, []);
  });

  test("write() with NO entryRefsRepo supplied still succeeds — the dependency is optional, not required", async () => {
    const db = makeKernel();
    await insertHtmlPage(db, { id: "page-1", html: "<p>base</p>", version: 1 });
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock });

    await store.read();
    await store.write(`<div data-embed-config='{"type":"widget","id":"widget-1"}'></div>`);

    const row = (await readRow(db, "page-1"));
    assert.equal(row.bodyHtml, `<div data-embed-config='{"type":"widget","id":"widget-1"}'></div>`);
  });

  // The admin's Interactive canvas (GrapesJS) serializes `data-embed-config='{"type":…}'` as
  // `data-embed-config="{&quot;type&quot;:…}"`. This store is the chokepoint every Page HTML write
  // passes through, so it stores the readable single-quoted form whichever path the HTML came from.
  const CANVAS_SERIALIZED_MARKER = `<div data-embed-config="{&quot;type&quot;:&quot;widget&quot;,&quot;slug&quot;:&quot;contact-form&quot;}"></div>`;
  const READABLE_MARKER = `<div data-embed-config='{"type":"widget","slug":"contact-form"}'></div>`;

  test("write() stores a canvas-serialized (double-quoted, &quot;-encoded) embed marker in the readable single-quoted form", async () => {
    const db = makeKernel();
    await insertHtmlPage(db, { id: "page-1", html: "<p>base</p>", version: 1 });
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock });

    await store.read();
    await store.write(`<p>That marker, live:</p>${CANVAS_SERIALIZED_MARKER}`);

    assert.equal((await readRow(db, "page-1")).bodyHtml, `<p>That marker, live:</p>${READABLE_MARKER}`);
  });

  test("ensureHtmlFormat() seeds a canvas-serialized embed marker in the readable single-quoted form", async () => {
    const db = makeKernel();
    await insertPost(db, { id: "page-3", title: "New page", slug: "new-page-3", kind: "page" });
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-3" }, { kernel: db, clock });

    assert.equal(store.capturedVersion(), null);
    await store.ensureHtmlFormat(CANVAS_SERIALIZED_MARKER);
    assert.equal(store.capturedVersion(), 2);
    await store.ensureHtmlFormat("<p>ignored</p>");
    assert.equal(store.capturedVersion(), 2);

    assert.equal((await readRow(db, "page-3")).bodyHtml, READABLE_MARKER);
  });

  test("write() indexes a ref for an embed pointing at an id with no corresponding widget/form row — entry_refs must see the dangling reference, not silently skip it (this store has no widget/form repo to check against, so it cannot filter on resolution status even if it wanted to)", async () => {
    const db = makeKernel();
    await insertHtmlPage(db, { id: "page-1", html: "<p>base</p>", version: 1 });
    const entryRefsRepo = new InMemoryEntryRefsRepo();
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock, entryRefsRepo });

    await store.read();
    await store.write(`<div data-embed-config='{"type":"widget","id":"widget-does-not-exist-anywhere"}'></div>`);

    const refs = await entryRefsRepo.findBySource({ workspaceId: WS, sourceEntryId: "page-1" });
    assert.equal(refs.length, 1);
    assert.equal(refs[0]?.targetId, "widget-does-not-exist-anywhere");
  });

  test("ensureHtmlFormat() reindexes entry_refs on the seeding conversion (doc -> html), using the seed html's own embeds", async () => {
    const db = makeKernel();
    await insertPost(db, { id: "page-2", title: "New page", slug: "new-page", kind: "page" });
    const entryRefsRepo = new InMemoryEntryRefsRepo();
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-2" }, { kernel: db, clock, entryRefsRepo });

    await store.ensureHtmlFormat(`<div data-embed-config='{"type":"widget","id":"cf-widget-1"}'></div>`);

    const refs = await entryRefsRepo.findBySource({ workspaceId: WS, sourceEntryId: "page-2" });
    assert.equal(refs.length, 1);
    assert.equal(refs[0]?.targetId, "cf-widget-1");
  });

  // ---------------------------------------------------------------------------
  // S5 (web-high fix plan, 2026-09-24) — the entity-liveness guard (row 5): none of read()/
  // ensureHtmlFormat()/write() checked `deleted_at`, so a trashed page's bespoke-HTML body was still
  // readable and writable through this store.
  // ---------------------------------------------------------------------------

  const TRASH_MESSAGE = "ENTITY_IN_TRASH: page 'page-1' is in the Trash. Restore it from the Trash before changing it.";

  test("read() rejects a trashed html-format page with the entity-liveness message", async () => {
    const db = makeKernel();
    await insertHtmlPage(db, { id: "page-1", html: "<p>trashed</p>" });
    await setRow(db, "page-1", { deleted_at: "2026-09-24T00:00:00.000Z" });
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock });

    await assert.rejects(() => store.read(), { message: TRASH_MESSAGE });
  });

  test("ensureHtmlFormat() rejects a trashed page before the bodyFormat conversion — a trashed doc-format page also reports Trash, not not-found", async () => {
    const db = makeKernel();
    await insertPost(db, { id: "page-1", title: "New page", slug: "new-page", kind: "page", deleted_at: "2026-09-24T00:00:00.000Z" });
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock });

    await assert.rejects(() => store.ensureHtmlFormat("<p>seed</p>"), { message: TRASH_MESSAGE });
  });

  test("write() rejects when the row was trashed between this instance's read() and write() — the row's body_html stays unchanged", async () => {
    const db = makeKernel();
    await insertHtmlPage(db, { id: "page-1", html: "<p>base</p>", version: 1 });
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock });

    await store.read();
    await setRow(db, "page-1", { deleted_at: "2026-09-24T00:00:00.000Z" });

    await assert.rejects(() => store.write("<p>should never land</p>"), { message: TRASH_MESSAGE });

    const row = (await readRow(db, "page-1"));
    assert.equal(row.bodyHtml, "<p>base</p>", "the trashed row's body_html must be untouched");
  });

  test("write() still throws PageConcurrentEditError (not the Trash message) for an ordinary stale write on a LIVE row", async () => {
    const db = makeKernel();
    await insertHtmlPage(db, { id: "page-1", html: "<p>base</p>", version: 1 });
    const writerA = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock });
    const writerB = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "page-1" }, { kernel: db, clock });

    await writerA.read();
    await writerB.read();
    await writerA.write("<p>A's edit</p>");

    await assert.rejects(() => writerB.write("<p>stale</p>"), PageConcurrentEditError);
  });
  test("ensureHtmlFormat() refuses a post and leaves its doc body and revision ledger unchanged", async () => {
    const db = makeKernel();
    await insertPost(db, { id: "post-guard", kind: "post", body_json: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Keep me"}]}]}' });
    const before = await db.run((q) => q.selectFrom("posts").selectAll().where("id", "=", "post-guard").executeTakeFirstOrThrow());
    const repo = postRepoFor(db);
    const store = new SqlPagesHtmlDocumentStore({ workspaceId: WS, postId: "post-guard" }, { kernel: db, clock, revisions: repo });
    await assert.rejects(store.ensureHtmlFormat("<p>replacement</p>"), PageKindMismatchError);
    assert.deepEqual(await db.run((q) => q.selectFrom("posts").selectAll().where("id", "=", "post-guard").executeTakeFirstOrThrow()), before);
    assert.deepEqual(await repo.listRevisions({ workspaceId: WS, postId: "post-guard" }), []);
    assert.equal(store.capturedVersion(), null);
  });

  test("pages_write_region accepts the version captured by a SQL-backed read and persists the edit", async () => {
    const db = makeKernel();
    await insertHtmlPage(db, { id: "sql-tool", html: '<section data-agent-element="hero" data-agent-role="region"><p>old</p></section>', version: 5 });
    const registrations = buildPagesRegistrations({
      workspaceId: WS,
      authorize: async () => ({ allowed: true, reason: "matched" }),
      postRepo: postRepoFor(db),
      pagesHtmlStore: (scope) => new SqlPagesHtmlDocumentStore(scope, { kernel: db, clock }),
    });
    const call = (name: string, input: Record<string, unknown>) => {
      const entry = registrations.find((entry) => entry.descriptor.id === name)!;
      return entry.handler({ principal: { id: "admin", kind: "user" }, signal: new AbortController().signal, input } as never);
    };
    const read = await call("pages_read_html", { id: "sql-tool" }) as { version: number };
    assert.equal(read.version, 5);
    const result = await call("pages_write_region", { id: "sql-tool", handle: "hero", html: "<p>new</p>", expectedVersion: read.version }) as { written: boolean; version: number };
    assert.equal(result.written, true);
    assert.equal(result.version, 6);
    assert.deepEqual(await readRow(db, "sql-tool"), { bodyHtml: '<section data-agent-element="hero" data-agent-role="region"><p>new</p></section>', version: 6, bodyFormat: "html" });
  });

});
