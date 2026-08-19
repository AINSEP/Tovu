import type { ClockPort } from "@jini-ai/cms/core";

import type { PostRecord, PostRepoPort } from "../post/index.js";
import { extractHtmlEntryRefs } from "../../core/entry-refs/extractor.js";
import type { EntryRefsRepoPort } from "../../core/entry-refs/ports.js";
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

  /** @see PagesHtmlDocumentStore.ensureHtmlFormat */
  async ensureHtmlFormat(seedHtml: string): Promise<void> {
    const row = await this.load();
    if (!row) throw new PageNotFoundError(`page '${this.scope.postId}' was not found`);
    if (row.kind !== "page") {
      throw new PageKindMismatchError(`'${this.scope.postId}' is a post, and a post is never bespoke HTML`);
    }

    if (row.bodyFormat === "html") {
      this.lastReadVersion = row.version;
      return;
    }

    const nextVersion = row.version + 1;
    await this.deps.repo.save({
      ...row,
      bodyFormat: "html",
      bodyHtml: seedHtml,
      version: nextVersion,
      updatedAt: this.deps.clock.nowIso(),
    });
    this.lastReadVersion = nextVersion;
    await this.reindexEntryRefs(seedHtml);
  }

  /** @see PagesHtmlDocumentStore.read */
  async read(): Promise<string> {
    const row = await this.load();
    if (!row || row.bodyFormat !== "html" || row.bodyHtml === null) {
      throw new PageNotFoundError(`page '${this.scope.postId}' was not found`);
    }
    this.lastReadVersion = row.version;
    return row.bodyHtml;
  }

  /** @see PagesHtmlDocumentStore.write */
  async write(html: string): Promise<void> {
    if (this.lastReadVersion === null) {
      throw new Error("PagesHtmlDocumentStore.write() called before read() — there is no version to condition the write on");
    }
    const expectedVersion = this.lastReadVersion;
    const row = await this.load();

    if (!row || row.bodyFormat !== "html" || row.version !== expectedVersion) {
      throw new PageConcurrentEditError(
        `page '${this.scope.postId}' was edited elsewhere since this turn started — re-read and retry`
      );
    }

    const nextVersion = expectedVersion + 1;
    await this.deps.repo.save({
      ...row,
      bodyHtml: html,
      version: nextVersion,
      updatedAt: this.deps.clock.nowIso(),
    });
    this.lastReadVersion = nextVersion;
    await this.reindexEntryRefs(html);
  }
}
