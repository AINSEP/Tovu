import { assertEntityLive, type ClockPort } from "@jini-ai/cms/core";

import { isTrashed, type PostRecord, type PostRepoPort } from "../post/index.js";
// Not from the barrel above — see `html-document-store.sqlite.ts`'s identical import for why.
import { SYSTEM_ACTOR_ID } from "../post/post.js";
import { extractHtmlEntryRefs } from "../../contracts/core/entry-refs/extractor.js";
import type { EntryRefsRepoPort } from "../../contracts/core/entry-refs/ports.js";
import {
  PageConcurrentEditError,
  PageKindMismatchError,
  PageNotFoundError,
  type PagesHtmlDocumentStoreScope,
} from "./html-document-store.sqlite.js";

/**
 * @file The `PostRepoPort`-backed twin of `html-document-store.sqlite.ts`, for `app.ts`'s hermetic
 * in-memory composition root.
 *
 * ## Why a second implementation rather than the real one over `:memory:`
 *
 * `RouteDeps.chatHistory` deliberately takes the *real* adapter over a throwaway `:memory:`
 * database rather than a hand-written double, and that is the right call there. It is the wrong
 * call here, and the difference is worth stating because the two roots look alike: the hermetic
 * root's posts live in an `InMemoryPostRepo`, not in any SQLite database at all. Handing this store
 * its own `:memory:` `ContentDb` would give it a second, disconnected set of rows — writes would
 * succeed, reads through `postRepo` would never see them, and every test would pass against a store
 * that shares no state with the pages it is supposedly editing. Silently wrong beats loudly broken
 * only in the wrong direction.
 *
 * So this mirrors `postRepo`, exactly the justification `search-index.memory.ts` records for its own
 * existence in the same root.
 *
 * ## What it must keep in sync
 *
 * The compare-and-set discipline (CIC-1), not just the method names. A double that accepted writes
 * unconditionally would make the hermetic root a place where the concurrency bug this store exists
 * to prevent is untestable and invisible — so `write()` here checks the version the same way, and
 * raises the same `PageConcurrentEditError`.
 */
export class InMemoryPagesHtmlDocumentStore {
  private lastReadVersion: number | null = null;

  constructor(
    private readonly scope: PagesHtmlDocumentStoreScope,
    // `entryRefsRepo` is optional for the identical reason `PagesHtmlDocumentStoreDeps.entryRefsRepo`
    // (the real adapter) is — see that field's own doc.
    private readonly deps: { repo: PostRepoPort; clock: ClockPort; entryRefsRepo?: EntryRefsRepoPort }
  ) {}

  private async load(): Promise<PostRecord | null> {
    return this.deps.repo.findById({ workspaceId: this.scope.workspaceId, id: this.scope.postId });
  }

  /** @see PagesHtmlDocumentStore's own `reindexEntryRefs` private method for the full rationale. */
  private async reindexEntryRefs(html: string): Promise<void> {
    if (!this.deps.entryRefsRepo) return;
    const refs = extractHtmlEntryRefs({ workspaceId: this.scope.workspaceId, sourceEntryId: this.scope.postId, html });
    await this.deps.entryRefsRepo.replaceForSource({ workspaceId: this.scope.workspaceId, sourceEntryId: this.scope.postId, refs });
  }

  /** @see PagesHtmlDocumentStorePort.capturedVersion */
  capturedVersion(): number | null {
    return this.lastReadVersion;
  }

  /**
   * S1 (fix plan 2026-09-24 row 14) — mirrors the real store's `appendRevision` helper. Unlike that
   * store's optional `deps.revisions`, `deps.repo` here IS a full `PostRepoPort` unconditionally (it
   * is what this whole double is built over — see this file's header), so there is no "supplied or
   * not" branch: every call appends.
   */
  private async appendRevision(seq: number, recordedAt: string): Promise<void> {
    const row = await this.load();
    if (!row) return;
    await this.deps.repo.appendRevision({
      postId: this.scope.postId,
      workspaceId: this.scope.workspaceId,
      seq,
      op: "update",
      stateJson: row,
      actorId: this.scope.actorId ?? SYSTEM_ACTOR_ID,
      recordedAt,
    });
  }

  /** @see PagesHtmlDocumentStore.ensureHtmlFormat */
  async ensureHtmlFormat(seedHtml: string): Promise<void> {
    const row = await this.load();
    if (!row) throw new PageNotFoundError(`page '${this.scope.postId}' was not found`);
    assertEntityLive({ entityType: "page", entityId: this.scope.postId, state: isTrashed(row) ? "trashed" : "live" });
    if (row.kind !== "page") {
      throw new PageKindMismatchError(`'${this.scope.postId}' is a post, and a post is never bespoke HTML`);
    }

    if (row.bodyFormat === "html") {
      this.lastReadVersion = row.version;
      return;
    }

    const nextVersion = row.version + 1;
    const updatedAt = this.deps.clock.nowIso();

    await this.deps.repo.transaction(async () => {
      // Pre-conversion snapshot — see the real store's `ensureHtmlFormat` for why this is skipped
      // when a revision at this exact `seq` already exists.
      const existing = await this.deps.repo.listRevisions({ workspaceId: this.scope.workspaceId, postId: this.scope.postId });
      if (!existing.some((revision) => revision.seq === row.version)) {
        await this.appendRevision(row.version, updatedAt);
      }
      await this.deps.repo.save({
        ...row,
        bodyFormat: "html",
        bodyHtml: seedHtml,
        version: nextVersion,
        updatedAt,
      });
      await this.appendRevision(nextVersion, updatedAt);
    });
    this.lastReadVersion = nextVersion;
    await this.reindexEntryRefs(seedHtml);
  }

  /** @see PagesHtmlDocumentStore.read */
  async read(): Promise<string> {
    const row = await this.load();
    if (!row) throw new PageNotFoundError(`page '${this.scope.postId}' was not found`);
    assertEntityLive({ entityType: "page", entityId: this.scope.postId, state: isTrashed(row) ? "trashed" : "live" });
    if (row.bodyFormat !== "html" || row.bodyHtml === null) {
      throw new PageNotFoundError(`page '${this.scope.postId}' was not found`);
    }
    this.lastReadVersion = row.version;
    return row.bodyHtml;
  }

  /**
   * @see PagesHtmlDocumentStore.write
   *
   * Commits through {@link PostRepoPort.saveIfVersion} rather than a separate `row.version !==
   * expectedVersion` check followed by an unconditional `save()`. The two-step form has an `await`
   * gap between the check and the act: two `write()` calls truly in flight at once (as two parallel
   * `pages_write_region` tool-call dispatches produce — see `tool-registrations.write-region.test.ts`'s
   * own header, defect #2) can both pass the check before either has saved, so the later `save()`
   * silently clobbers the earlier one with no error to either caller. `saveIfVersion` does its
   * version compare and its write in one synchronous span with no `await` inside, so whichever
   * caller's `saveIfVersion` actually runs second — even with both `write()`s in flight — sees the
   * version the first one already bumped and reports `applied: false`. This is this store's own
   * analogue of the real store's atomic `UPDATE ... WHERE version = ?` (see this file's header).
   * Pinned by `__tests__/html-document-store.memory.test.ts`'s "BUG: two write() calls truly IN
   * FLIGHT AT ONCE" case.
   */
  async write(html: string): Promise<void> {
    if (this.lastReadVersion === null) {
      throw new Error("PagesHtmlDocumentStore.write() called before read() — there is no version to condition the write on");
    }
    const expectedVersion = this.lastReadVersion;
    const row = await this.load();

    // Disambiguate on the mismatch path: a trashed row is not "someone else edited it" — see
    // `PagesHtmlDocumentStore.write`'s own doc for why the two are distinct rejections.
    if (row && isTrashed(row)) {
      assertEntityLive({ entityType: "page", entityId: this.scope.postId, state: "trashed" });
    }
    if (!row || row.bodyFormat !== "html") {
      throw new PageConcurrentEditError(
        `page '${this.scope.postId}' was edited elsewhere since this turn started — re-read and retry`
      );
    }

    const nextVersion = expectedVersion + 1;
    const updatedAt = this.deps.clock.nowIso();
    const { applied } = await this.deps.repo.saveIfVersion({
      record: { ...row, bodyHtml: html, version: nextVersion, updatedAt },
      ifVersion: expectedVersion,
    });
    if (!applied) {
      throw new PageConcurrentEditError(
        `page '${this.scope.postId}' was edited elsewhere since this turn started — re-read and retry`
      );
    }
    // S1 (fix plan 2026-09-24 row 14) — after, not inside, `saveIfVersion`: that call is this
    // store's own atomic compare-and-set (see this method's own header), so there is nothing left to
    // wrap in a `transaction()` by the time `applied` is known true.
    await this.appendRevision(nextVersion, updatedAt);
    this.lastReadVersion = nextVersion;
    await this.reindexEntryRefs(html);
  }
}
