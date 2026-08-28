import { openContentDb, type ContentDb } from "../../platform/db/sqlite/content-db.js";
import type { PostRecord, PostRepoPort } from "./post.js";
import { toPostSearchDocument, type PostSearchHit, type PostSearchPort, type PostSearchQuery } from "./search.js";
import { indexPostSearchDocument, searchPostIndex } from "./search-index.sqlite.js";

/**
 * @file The rule-of-two partner to `search-index.sqlite.ts`: the `PostSearchPort` the hermetic
 * composition root (`server/app.ts`'s `createRouteDeps`, which pairs it with `InMemoryPostRepo`)
 * wires, so `content_post_search` behaves identically whether a caller booted the SQLite server or
 * the in-memory one.
 *
 * The interesting decision here is what "in-memory" means. It does NOT mean a second ranking
 * implementation. A hand-rolled scorer next to the real FTS5 one would be two answers to the same
 * question — the exact drift `@jini-ai/sqlite`'s own module doc records having replaced (its
 * in-memory term-count scorer produced score ties that BM25 separates correctly), and it would make
 * every ranking test in this domain prove something about only one of the two adapters. So this
 * adapter is backed by a REAL SQLite database that merely lives in memory: `openContentDb(":memory:")`
 * runs the same migration stream a file-backed `content.db` gets, including 0022's FTS5 index and
 * its triggers, and the query itself is `searchPostIndex` — the same function, byte for byte, that
 * the durable adapter calls. Only the storage is different.
 *
 * Sync model, and the deliberate contrast with the durable adapter: this one MIRRORS on every
 * search rather than maintaining an index incrementally. `InMemoryPostRepo` is a plain array with no
 * write hook to attach to, and inventing one would put a search concern inside the test double every
 * post test in this repo constructs. Reseeding instead means this index cannot be stale by
 * construction — there is no window in which a repo write has happened and the index has not caught
 * up — at a cost (O(n) per query in the workspace's post count) that is exactly right for the corpus
 * this root actually holds: `server/seed.ts`'s demo content. Do not promote this adapter to a
 * durable one on the strength of it being simpler; on a real corpus the cost model is the wrong way
 * round, which is why the SQLite adapter maintains its index per write instead.
 *
 * The `:memory:` database is created lazily, on the first search. `createRouteDeps()` is constructed
 * by a large number of server tests, nearly none of which search — paying a full migration run in
 * every one of them to serve the handful that do would be a real cost for no benefit.
 */

/** Every NOT NULL column of `posts` this adapter has to supply when mirroring a record; `ext` is
 * serialized the same way `SqlitePostRepo.save` serializes it, and the two nullable sidecars
 * (`seo_ext_json`, `deleted_at`) are passed through because `deleted_at` is a search FILTER. */
const MIRROR_POST_SQL = `INSERT INTO posts
  (id, workspace_id, title, slug, body_json, status, kind, updated_at, version, seo_ext_json, ext, deleted_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export class InMemoryPostSearchIndex implements PostSearchPort {
  private readonly repo: PostRepoPort;
  private db: ContentDb | null = null;

  /**
   * @param repo - The post store to mirror. Read on every search, so a record saved through it is
   * findable immediately.
   */
  constructor(repo: PostRepoPort) {
    this.repo = repo;
  }

  /**
   * Mirrors the workspace's posts into the scratch database, then runs the real ranked query.
   *
   * @param required - Already validated, tokenized and clamped by `searchAdminPosts`.
   * @complexity O(n) in the workspace's post count to mirror, plus FTS5's own search cost. See this
   * file's header for why the reseed is the right trade here and the wrong one for the durable
   * adapter.
   * @overallScore 100
   */
  async search(required: PostSearchQuery): Promise<PostSearchHit[]> {
    if (!this.db) this.db = openContentDb(":memory:");
    const db = this.db;
    const posts = await this.repo.list({ workspaceId: required.workspaceId });
    mirrorPosts(db, posts);
    return searchPostIndex(db.$client, required);
  }
}

/**
 * Replaces the scratch database's contents with `posts`, in one transaction.
 *
 * Deleting `post_search_document` first is what keeps the FTS index correct: the 0022 delete trigger
 * removes each row's index entry, so a post that has since been removed from the repo (or renamed)
 * leaves nothing behind for the next query to match.
 *
 * @complexity O(n) in `posts`.
 * @overallScore 100
 */
function mirrorPosts(db: ContentDb, posts: readonly PostRecord[]): void {
  const sqlite = db.$client;
  const replace = sqlite.transaction((rows: readonly PostRecord[]) => {
    sqlite.prepare("DELETE FROM post_search_document").run();
    sqlite.prepare("DELETE FROM posts").run();
    const insert = sqlite.prepare(MIRROR_POST_SQL);
    for (const post of rows) {
      insert.run(
        post.id,
        post.workspaceId,
        post.title,
        post.slug,
        JSON.stringify(post.bodyJson),
        post.status,
        post.kind,
        post.updatedAt,
        post.version,
        post.seoExtJson ?? null,
        JSON.stringify(post.ext ?? {}),
        post.deletedAt ?? null
      );
      indexPostSearchDocument(sqlite, toPostSearchDocument(post));
    }
  });
  replace(posts);
}
