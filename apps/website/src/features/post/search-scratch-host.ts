import { contentKernel, schemaErasedKernel } from "../../platform/db/content-kernel.js";
import { openContentDb } from "../../platform/db/sqlite/content-db.js";
import { toRow } from "./repo.rows.js";
import { type SearchProjectionTables, sqlitePostSearch } from "@jini-ai/cms/posts/sql";
import type { PostSearchScratch } from "@jini-ai/cms/posts/search-index.memory";

/**
 * @file The rule-of-two partner to `search-index.sqlite.ts`: the `PostSearchPort` the hermetic
 * composition root (`apps/website/src/server/runtime/composition/app.ts`'s `createRouteDeps`, which pairs it with `InMemoryPostRepo`)
 * wires, so `content_post_search` behaves identically whether a caller booted the SQLite server or
 * the in-memory one.
 *
 * The interesting decision here is what "in-memory" means. It does NOT mean a second ranking
 * implementation. A hand-rolled scorer next to the real FTS5 one would be two answers to the same
 * question — the exact drift `@jini-ai/sqlite-chat`'s own module doc records having replaced (its
 * in-memory term-count scorer produced score ties that BM25 separates correctly), and it would make
 * every ranking test in this domain prove something about only one of the two adapters. So this
 * adapter is backed by a REAL SQLite database that merely lives in memory: `openContentDb(":memory:")`
 * runs the same migration stream a file-backed `content.db` gets, including 0022's FTS5 index and
 * its triggers, and the query itself is `sqlitePostSearch` — the same code, byte for byte, that the
 * durable SQLite adapter runs. Only the storage is different.
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

export function openPostSearchScratch(_required: Record<string, never>, _optional: Record<string, never> = {}): PostSearchScratch {
  const kernel = contentKernel({ store: openContentDb(":memory:") });
  return {
    transaction: ({ run }) => kernel.transaction(run),
    clearProjection: async () => { await kernel.run((db) => db.withTables<SearchProjectionTables>().deleteFrom("post_search_document").execute()); },
    clearPosts: async () => { await kernel.run((db) => db.deleteFrom("posts").execute()); },
    insertPost: async ({ post }) => { await kernel.run((db) => db.insertInto("posts").values(toRow(post)).execute()); },
    upsertDocument: ({ document }) => sqlitePostSearch.upsert({ kernel: schemaErasedKernel({ store: kernel }), document }),
    query: ({ query }) => sqlitePostSearch.search(schemaErasedKernel({ store: kernel }), query),
  };
}
