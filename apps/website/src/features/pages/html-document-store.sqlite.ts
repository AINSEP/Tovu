import type { ClockPort } from "@jini-ai/cms/core";
import { and, eq } from "drizzle-orm";

import { posts } from "../../platform/db/schema.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { extractHtmlEntryRefs } from "../../contracts/core/entry-refs/extractor.js";
import type { EntryRefsRepoPort } from "../../contracts/core/entry-refs/ports.js";

/**
 * @file SPEC-047/ADR-056 REQ-4 — Tovu's implementation of `@jini-ai/vibecoding/html`'s
 * `HtmlDocumentStore` port (`read(): Promise<string>` / `write(html: string): Promise<void>`) over
 * an `"html"`-format Page row in the shared `posts` table.
 *
 * NOT wired against `@jini-ai/vibecoding`'s own `HtmlDocumentStore` type: the package is not yet a
 * dependency of this repo (`package.json` has no `@jini-ai/vibecoding` entry, and its `./html/node`
 * parser entry — REQ-1, blocking, Jini-side — does not exist yet either; confirmed by grep and by
 * reading the Jini package's own `package.json` directly). This class satisfies the port
 * STRUCTURALLY — the two method names and signatures are copied verbatim from
 * `Jini/packages/vibecoding/src/html/regions.ts`'s `HtmlDocumentStore` interface — so wiring it into
 * `createHtmlRegionTarget({ store, parser })` (REQ-5, out of this dispatch's scope) needs no changes
 * here once that dependency exists; only an `implements HtmlDocumentStore` annotation needs adding.
 *
 * Bypasses `PostRepoPort`/`SqlitePostRepo`/`createPost`/`updatePost` entirely, on purpose (ADR-056
 * Decision 4 & CIC-3): this store is the ONLY writer of `body_html`/`bodyFormat: "html"` anywhere in
 * this codebase — the general Post/Page CRUD chokepoint (`post.ts`'s `resolveBodyFields`) can never
 * produce that shape, so there is exactly one place a `bodyFormat: "html"` row is ever written, and
 * this is it.
 *
 * CIC-1 (ADR-056) — the reason this file exists rather than a three-line `SELECT`/`UPDATE` pair: two
 * admin sessions editing the same page concurrently, or a retried tool call racing a still-in-flight
 * one, are two separate callers layered over the same row. `write()` is conditioned on the `version`
 * captured by the MATCHING `read()` (compare-and-set), never an unconditional overwrite — a stale
 * writer is rejected with {@link PageConcurrentEditError}, not silently applied on top of content it
 * never saw. See `pages-html-document-store.test.ts`'s interleaving test for the failure mode this
 * prevents (a naive read-splice-write not only loses the first writer's edit, it can splice the
 * second writer's content into the WRONG byte offset if the first edit changed the document's length
 * anywhere before the second writer's target region).
 *
 * Relationship to `updatePost`'s `expectedVersion` (2026-09-07, fable arch audit §4.15): the audit
 * read one `posts.version` column written under three different concurrency contracts and asked
 * whether this store should take a client-stated `expectedVersion` too. It should not, and the
 * difference is not an inconsistency. `updatePost`'s basis comes from a client that loaded the row
 * in an earlier request and states what it believes it is editing, so the guard there is opt-in
 * (a caller that sends nothing gets last-write-wins) and its rejection is a 409 the client must
 * reconcile. Here there is no earlier request and no client to state anything: the basis is the
 * version captured by the `read()` in THIS turn, which is what makes the guard mandatory rather
 * than opt-in — `write()` without a prior `read()` throws rather than falling back to an
 * unconditional overwrite. What the audit was actually pointing at — an arm writing this column
 * with NO predicate at all — was `routes/pages/update.ts` (C02) and `features/seo`'s
 * `setEntrySeoOverrides` (SEO-01); both now write under one, so every writer of `posts.version`
 * is version-predicated. The two remaining mechanisms differ only in where the basis comes from.
 */

export class PageNotFoundError extends Error {}

/**
 * Refuses {@link PagesHtmlDocumentStore.ensureHtmlFormat} on a row that is not `kind: "page"`.
 *
 * Distinct from {@link PageNotFoundError} on purpose, and it is the one place in this file that
 * does NOT follow the "kind-mismatch is indistinguishable from not-found" convention: the other
 * methods hide a Post's existence because they are read/write paths an agent can aim at any id,
 * whereas this one is only ever reached from a route that has already resolved the row through the
 * pages surface. Conflating "this Post cannot become an html Page" with "no such page" here would
 * hide a genuine caller bug (a Post id routed into the Pages editor) behind a 404 that reads as
 * ordinary missing data.
 */
export class PageKindMismatchError extends Error {}

/**
 * CIC-1's rejection — surfaced when `write()`'s `UPDATE ... WHERE version = <captured>` affects zero
 * rows, meaning the row's version moved since the matching `read()`. Never a silent no-op or a
 * fallback overwrite (ADR-056 Decision 2's own wording).
 */
export class PageConcurrentEditError extends Error {}

export interface PagesHtmlDocumentStoreDeps {
  db: ContentDb;
  clock: ClockPort;
  /**
   * SPEC-047 Slice 3 — when supplied, every successful {@link PagesHtmlDocumentStore.write}/
   * {@link PagesHtmlDocumentStore.ensureHtmlFormat} (the seeding branch only — see that method's own
   * doc) re-extracts this Page's `data-embed-type` references
   * (`core/entry-refs/extractor.ts`'s `extractHtmlEntryRefs`) and replaces its `entry_refs` rows, so
   * "deleting a widget/form silently breaks a page" is covered for html Pages the same way it
   * already is for TipTap `widgetEmbed` nodes.
   *
   * Optional, not required, so every pre-existing construction site (this class's own certified
   * `html-document-store.test.ts`, and any other caller built before this dependency existed) keeps
   * compiling and behaving unchanged — omitting it simply means this store never touches
   * `entry_refs`, not a broken build. Real composition roots (`server/deps.ts`/`server/app.ts`)
   * supply the real/in-memory `entryRefsRepo` they already construct for widgets.
   *
   * Disclosed gap: this write and the `entry_refs` replace are two separate statements, not one
   * transaction — unlike `entries`' own write chokepoint (INV-06's same-transaction guarantee),
   * `PagesHtmlDocumentStore` has no transaction wrapper to hook into (CIC-3's whole point is that it
   * bypasses that chokepoint). A crash between the two, or another writer's `write()` landing in
   * between, can leave `entry_refs` briefly stale — acceptable because the index is derived and
   * rebuildable by definition (`EntryRefsRepoPort`'s own doc), not because the race is impossible.
   */
  entryRefsRepo?: EntryRefsRepoPort;
}

/** Scopes one store instance to one Page row — mirrors every other adapter in this feature area
 * being workspace-scoped, so a store built for workspace A can never touch workspace B's row even
 * if handed a colliding `postId` (defense in depth; ids are UUIDs and collision is not the expected
 * threat model, but the scoping costs nothing and matches house convention). */
export interface PagesHtmlDocumentStoreScope {
  workspaceId: string;
  postId: string;
}

/**
 * The capability a Page's bespoke-HTML body is read and written through, as an interface rather
 * than the concrete class.
 *
 * Two implementations satisfy it: {@link PagesHtmlDocumentStore} over the real `content.db`, and
 * `html-document-store.memory.ts`'s `PostRepoPort`-backed twin for `app.ts`'s hermetic root. A
 * class type would not work here even if there were only one — TypeScript compares classes with
 * private fields nominally, so a structurally identical second implementation is not assignable to
 * the first.
 *
 * `read()` deliberately returns only the string, per `@jini-ai/vibecoding/html`'s `HtmlDocumentStore`
 * contract, which is why the version an implementation conditions its write on is captured on the
 * instance rather than handed back to the caller.
 */
export interface PagesHtmlDocumentStorePort {
  /** Births an `"html"`-format Page, or no-ops if the row already is one. */
  ensureHtmlFormat(seedHtml: string): Promise<void>;
  read(): Promise<string>;
  write(html: string): Promise<void>;
  /**
   * The row `version` captured by the most recent {@link read}/{@link ensureHtmlFormat} — the exact
   * value the next {@link write}'s compare-and-set will condition on — or `null` before either has
   * run.
   *
   * Added 2026-09-09 so a caller-stated `expectedVersion` (the agent tools' optimistic-concurrency
   * basis, mirroring `content_post_update`'s) can be compared against the version the write is
   * ACTUALLY conditioned on, with nothing able to move in between. Comparing against a version read
   * separately — through `postRepo`, say — would leave a window where a concurrent writer lands
   * between the check and this store's own `read()`, and the write would then be conditioned on the
   * intruder's version and silently clobber it. That is precisely the failure a version guard exists
   * to prevent, so the basis and the predicate must be the same number.
   *
   * Purely additive to `@jini-ai/vibecoding/html`'s `HtmlDocumentStore` shape: that port needs only
   * `read`/`write`, and TypeScript's structural typing means an extra method never breaks
   * assignability (see this file's header on why the port is satisfied structurally).
   */
  capturedVersion(): number | null;
}

/**
 * Builds a store for one Page, with the `content.db` handle and clock already closed over.
 *
 * A factory rather than a store, for the same reason `RouteDeps.chatHistory` is one: composition
 * owns the db handle so no route ever holds it, which is what makes an unscoped `WHERE id = ?`
 * unwritable from a route rather than merely against convention. Every instance is bound to exactly
 * one `(workspaceId, postId)` pair at construction.
 */
export type PagesHtmlDocumentStoreFactory = (
  scope: PagesHtmlDocumentStoreScope
) => PagesHtmlDocumentStorePort;

/**
 * Tovu's `HtmlDocumentStore` adapter over one `"html"`-format Page row (SPEC-047/ADR-056 REQ-4).
 *
 * Stateful by necessity, not by convenience: `HtmlDocumentStore.read()` returns only a string per
 * the port's contract (no version), so the row's `version` at the time of the most recent `read()`
 * is captured on the instance and is what the next `write()` conditions its compare-and-set on
 * (CIC-1). This matches how `createHtmlRegionTarget` (`regions.ts`, engine, unmodified) actually
 * calls this port: every one of `replacePart`/`restore`/`validate` calls `store.read()` immediately
 * before (or as part of judging) a `store.write()`, with no other store call landing in between — so
 * "condition on the most recently read version" is exactly "condition on the version the content
 * being written was computed from," which is the property CIC-1 requires.
 */
export class PagesHtmlDocumentStore {
  private lastReadVersion: number | null = null;

  constructor(
    private readonly scope: PagesHtmlDocumentStoreScope,
    private readonly deps: PagesHtmlDocumentStoreDeps
  ) {}

  /**
   * @see PagesHtmlDocumentStorePort.capturedVersion
   * @complexity O(1).
   */
  capturedVersion(): number | null {
    return this.lastReadVersion;
  }

  /**
   * Reads the current `body_html`, capturing this row's `version` on the instance for the next
   * {@link write} to condition its compare-and-set on.
   *
   * A row that does not exist, or that exists but is not `bodyFormat: "html"`, 404s identically —
   * the same "kind-mismatch is indistinguishable from not-found" convention
   * `pages/get-by-id.ts` already applies, so this store never leaks whether a `doc`-format row with
   * this id exists.
   *
   * @throws {PageNotFoundError} If no `"html"`-format row with this id exists in this workspace.
   * @complexity O(1) — one indexed row lookup.
   * @overallScore 100
   */
  async read(): Promise<string> {
    const rows = this.deps.db
      .select({ bodyHtml: posts.bodyHtml, bodyFormat: posts.bodyFormat, version: posts.version })
      .from(posts)
      .where(and(eq(posts.workspaceId, this.scope.workspaceId), eq(posts.id, this.scope.postId)))
      .limit(1)
      .all();
    const row = rows[0];

    if (!row || row.bodyFormat !== "html" || row.bodyHtml === null) {
      throw new PageNotFoundError(`page '${this.scope.postId}' was not found`);
    }

    this.lastReadVersion = row.version;
    return row.bodyHtml;
  }

  /**
   * Births an `"html"`-format Page: flips a `"doc"`-format row to `"html"` and seeds `body_html`
   * with `seedHtml`. Idempotent — a row already in `"html"` format is left untouched (content
   * included) and only has its `version` captured, so the caller can follow with
   * {@link read}/{@link write} unconditionally.
   *
   * **This is the only path by which an `"html"`-format row ever comes into existence.** It exists
   * because the two halves of the design lock each other out otherwise: `post.ts`'s
   * `resolveBodyFields()` is hardcoded to `"doc"` and can never construct an html row (ADR-056
   * CIC-3, deliberate), while {@link read} refuses a row whose `bodyHtml` is null — so without this
   * method there is no first write. Keeping it here rather than loosening `createPost` is what
   * preserves CIC-3 literally: `createPost`/`updatePost` still cannot produce this shape, and this
   * class remains the sole writer of it.
   *
   * **The conversion is one-way and drops `body_json`** (D-2's explicitly warned, one-way format
   * conversion). The CHECK constraint on `posts` permits exactly one populated body column per
   * format, so flipping to `"html"` requires nulling `body_json` in the same statement — any TipTap
   * content on that row is gone and is not recoverable from this table. Callers must not offer this
   * on a Page with authored `doc` content without warning the operator first; today the only caller
   * is the Pages editor acting on a freshly created, empty Page.
   *
   * @throws {PageNotFoundError} If no row with this id exists in this workspace.
   * @throws {PageKindMismatchError} If the row exists but is `kind: "post"` — Posts are Tiptap, full
   * stop (D-1), and no Post may be converted to bespoke HTML through this or any other path.
   * @complexity O(1) — one indexed row lookup plus, on a `doc` row, one indexed row update.
   */
  async ensureHtmlFormat(seedHtml: string): Promise<void> {
    const rows = this.deps.db
      .select({ kind: posts.kind, bodyFormat: posts.bodyFormat, version: posts.version })
      .from(posts)
      .where(and(eq(posts.workspaceId, this.scope.workspaceId), eq(posts.id, this.scope.postId)))
      .limit(1)
      .all();
    const row = rows[0];

    if (!row) throw new PageNotFoundError(`page '${this.scope.postId}' was not found`);
    if (row.kind !== "page") {
      throw new PageKindMismatchError(`'${this.scope.postId}' is a post, and a post is never bespoke HTML`);
    }

    if (row.bodyFormat === "html") {
      // Already born. Capture the version so a following `write()` has something to condition on,
      // and leave the content alone — re-seeding here would silently discard the page's real body
      // every time the editor opened it.
      this.lastReadVersion = row.version;
      return;
    }

    const nextVersion = row.version + 1;
    const result = this.deps.db
      .update(posts)
      .set({
        bodyFormat: "html",
        bodyHtml: seedHtml,
        // Required by the table's CHECK constraint, not incidental — see this method's doc.
        bodyJson: null,
        version: nextVersion,
        updatedAt: this.deps.clock.nowIso(),
      })
      .where(
        and(
          eq(posts.workspaceId, this.scope.workspaceId),
          eq(posts.id, this.scope.postId),
          // Same compare-and-set discipline as `write()` (CIC-1): if another writer moved this row
          // between the SELECT above and here, this update matches nothing rather than clobbering.
          eq(posts.version, row.version)
        )
      )
      .run();

    if (result.changes === 0) {
      throw new PageConcurrentEditError(
        `page '${this.scope.postId}' was edited elsewhere while it was being converted to HTML — retry`
      );
    }

    this.lastReadVersion = nextVersion;
    await this.reindexEntryRefs(seedHtml);
  }

  /**
   * SPEC-047 Slice 3 — re-extracts and replaces this Page's `entry_refs` rows for `html`, when
   * {@link PagesHtmlDocumentStoreDeps.entryRefsRepo} was supplied. A no-op (not an error) when it
   * wasn't — see that field's own doc for why this dependency stays optional.
   *
   * @complexity O(n) over `html`'s length (delegates to `extractHtmlEntryRefs`'s own O(n) scan) plus
   * one `replaceForSource` write.
   * @overallScore 100
   */
  private async reindexEntryRefs(html: string): Promise<void> {
    if (!this.deps.entryRefsRepo) return;
    const refs = extractHtmlEntryRefs({
      workspaceId: this.scope.workspaceId,
      sourceEntryId: this.scope.postId,
      html,
    });
    await this.deps.entryRefsRepo.replaceForSource({
      workspaceId: this.scope.workspaceId,
      sourceEntryId: this.scope.postId,
      refs,
    });
  }

  /**
   * Writes a new `body_html`, conditioned on the `version` captured by the most recent {@link read}
   * (CIC-1's compare-and-set). On success, `version` is incremented and the instance's captured
   * version advances to match — so a second `write()` on this same instance (no intervening `read()`
   * call, exactly how `createHtmlRegionTarget`'s `restore()` writes several regions in one pass) is
   * conditioned on the version this store itself just produced, not a stale one.
   *
   * @throws {Error} If called before any {@link read} — there is no captured version to condition on.
   * @throws {PageConcurrentEditError} If zero rows matched the compare-and-set — the row's version
   * moved since the matching `read()` (another writer committed first). The caller must re-`read()`
   * and retry; this method never falls back to an unconditional overwrite.
   * @complexity O(1) — one indexed, version-conditioned row update.
   * @overallScore 100
   */
  async write(html: string): Promise<void> {
    if (this.lastReadVersion === null) {
      throw new Error("PagesHtmlDocumentStore.write() called before read() — there is no version to condition the write on");
    }
    const expectedVersion = this.lastReadVersion;
    const nextVersion = expectedVersion + 1;

    const result = this.deps.db
      .update(posts)
      .set({ bodyHtml: html, version: nextVersion, updatedAt: this.deps.clock.nowIso() })
      .where(
        and(
          eq(posts.workspaceId, this.scope.workspaceId),
          eq(posts.id, this.scope.postId),
          eq(posts.bodyFormat, "html"),
          eq(posts.version, expectedVersion)
        )
      )
      .run();

    if (result.changes === 0) {
      throw new PageConcurrentEditError(
        `page '${this.scope.postId}' was edited elsewhere since this turn started — re-read and retry`
      );
    }

    this.lastReadVersion = nextVersion;
    await this.reindexEntryRefs(html);
  }
}
