import type { Database as SqliteDatabase } from "better-sqlite3";

import type { UUID } from "../../core/ports";
import type { ContentDb } from "../../infra/sqlite/content-db";
import type { PostKind, PostStatus } from "./post";
import {
  toPostSearchDocument,
  type PostSearchDocument,
  type PostSearchHit,
  type PostSearchPort,
  type PostSearchQuery,
} from "./search";

/**
 * @file The durable FTS5 + BM25 adapter behind `PostSearchPort` — Tovu's posts equivalent of
 * `@jini-ai/sqlite`'s `tool_catalog` helpers, and deliberately NOT a reuse of them.
 *
 * Why not reuse. `ensureToolCatalogTables`/`reseedToolCatalog`/`searchToolCatalog` are a genuinely
 * good fit for what they index and a genuinely bad one for this. Their table is keyed by tool id
 * with a `description` and a `source`; their sync model is `DELETE FROM` + reinsert every row +
 * `'rebuild'` the whole index, on the sound argument (their own module doc's) that the source of
 * truth is a `ToolRegistry` reassembled from static code on every boot, so a wholesale snapshot can
 * only ever lag, never diverge. Posts have no such moment. They are mutable user data edited one row
 * at a time by humans and agents all day, so a wholesale rebuild would be both the wrong cost model
 * (O(corpus) per edit) and the wrong correctness model (nothing to trigger it). Contorting those
 * three functions into per-row maintenance would leave a shared API whose two callers want opposite
 * things. What IS reused is the approach: external-content FTS5, `bm25()` with per-column weights
 * passed at query time, alphanumeric-only tokenization of the user's query, and the score inversion
 * so higher means better.
 *
 * Sync model, and what makes it hard to get wrong:
 *  - The searchable TEXT of a post (`title`/`slug`/plain text of `body_json`) changes in exactly one
 *    place — `SqlitePostRepo.save()`, the sole writer of those columns (verified across the repo:
 *    the only other statement that touches `posts` is `seedContentDb`'s first-run demo insert, which
 *    the backfill below covers). `save()` calls {@link indexPostSearchDocument} in the same call, so
 *    the projection cannot be left stale by a normal write.
 *  - Everything ELSE a search must respect — workspace, `kind`, `status`, and the soft-delete
 *    marker — is NOT indexed and is filtered from the live `posts` row at query time. That is the
 *    load-bearing decision in this file: publishing, unpublishing, trashing, and restoring a post
 *    all change what search may return WITHOUT changing a single indexed character, so making them
 *    query-time filters means those four operations need no index write at all and therefore cannot
 *    forget one. `deletePost` -> `softDelete()` writes only `deleted_at`/`updated_at`/`version`, and
 *    `postDeleteReverter` restores through `save()`; neither needs to know this index exists.
 *  - `post_search_document` -> `post_search_fts` is kept in sync by the three triggers the 0022
 *    migration installs, so a writer of the projection table cannot forget the index either.
 *
 * Reads go through `db.$client` (the raw `better-sqlite3` handle `ContentDb` already exposes for
 * `db-ops.ts`'s backup API) rather than the Drizzle query builder: `MATCH`, `bm25()`, `snippet()`,
 * and a virtual table joined on its own `rowid` have no representation in drizzle-orm's sqlite-core,
 * and expressing them through `sql` template escapes would produce a less readable query than the
 * SQL itself.
 */

/**
 * BM25 column weights, in `post_search_fts`'s declared column order (title, slug, body_text).
 *
 * Weighted, not uniform, because the product question is "where's the page ABOUT x" — a title match
 * is a claim that the document is about the term, while one body occurrence is a claim that the term
 * was mentioned. The slug sits between them: it is usually title-derived, it is human-chosen, and it
 * is literally the thing a navigation answer has to produce. The absolute numbers are a ratio, not a
 * calibration — BM25 already normalizes for field length, so these only need to encode
 * title > slug >> body, which they do at 8:4:1. Passed at query time (SQLite allows it), so retuning
 * them is a one-line change with no reindex, exactly as `searchToolCatalog` does with its own 6:1.
 */
const BM25_WEIGHTS = { title: 8.0, slug: 4.0, bodyText: 1.0 } as const;

/** `snippet()`'s ellipsis for a truncated excerpt, and the token budget for one. 20 tokens is
 * roughly a line of prose — enough to disambiguate two similar hits, short enough that a full page
 * of results is still a fraction of what one `content_post_get` would cost. */
const SNIPPET_ELLIPSIS = "…";
const SNIPPET_TOKEN_BUDGET = 20;

/**
 * Column index of `body_text` in `post_search_fts`, passed to `snippet()`.
 *
 * Pinned to the body rather than FTS5's `-1` ("pick the best-matching column"), because with `-1` a
 * title match returns a snippet that is just the title again — a field the hit already carries
 * verbatim. Anchoring on the body means the snippet always adds information. When the match is not
 * in the body, FTS5 returns that column's opening tokens, which is still a useful preview.
 */
const SNIPPET_COLUMN_BODY_TEXT = 2;

/** One row of the search join, before projection into a {@link PostSearchHit}. */
interface PostSearchRow {
  id: string;
  kind: string;
  title: string;
  slug: string;
  status: string;
  updated_at: string;
  snippet: string;
  rank: number;
}

/**
 * Writes (or rewrites) one post's searchable projection. Idempotent per post id.
 *
 * The FTS index itself is not touched here — the 0022 triggers own that, so this is a plain upsert
 * against an ordinary table with an ordinary primary key, and the index maintenance happens inside
 * the same implicit transaction as the caller's own write.
 *
 * @param db - The raw better-sqlite3 handle for the content database.
 * @param document - The projection, from `toPostSearchDocument`.
 * @complexity O(log n) for the upsert, plus FTS5's own per-document indexing cost in the triggers.
 * @overallScore 100
 */
export function indexPostSearchDocument(db: SqliteDatabase, document: PostSearchDocument): void {
  db.prepare(
    `INSERT INTO post_search_document (post_id, title, slug, body_text)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(post_id) DO UPDATE SET title = excluded.title, slug = excluded.slug, body_text = excluded.body_text`
  ).run(document.postId, document.title, document.slug, document.bodyText);
}

/**
 * Indexes every post that has no projection yet, and returns how many it wrote.
 *
 * This is the answer to "existing posts must be searchable without an edit" — both for a database
 * that predates the 0022 migration and for the demo content `seedContentDb` inserts straight into
 * `posts` without going near `SqlitePostRepo`. Anti-join rather than a rebuild: on a warm database
 * it costs one indexed `NOT EXISTS` scan and writes nothing, which is what makes it safe to run
 * unconditionally on every boot.
 *
 * NOT a repair pass. It fills gaps; it does not re-extract text for posts already indexed, because
 * the only thing that could make an existing projection wrong is a change to `extractPostPlainText`
 * itself — a code change, which is a migration's job to follow up, not a boot step's.
 *
 * Runs in one transaction so a crash midway leaves the table either fully caught up or untouched,
 * rather than in a state where the next boot's anti-join sees a partially-filled index and skips the
 * rows it already wrote (which would be correct) while the crash left a half-written FTS segment
 * (which would not).
 *
 * @param db - The raw better-sqlite3 handle for the content database.
 * @returns The number of posts newly indexed.
 * @complexity O(m) in the number of UNINDEXED posts, plus one O(n) anti-join over `posts`.
 * @overallScore 100
 */
export function backfillPostSearchIndex(db: SqliteDatabase): number {
  const missing = db
    .prepare(
      `SELECT p.id AS id, p.title AS title, p.slug AS slug, p.body_json AS body_json
       FROM posts p
       WHERE NOT EXISTS (SELECT 1 FROM post_search_document d WHERE d.post_id = p.id)`
    )
    .all() as Array<{ id: string; title: string; slug: string; body_json: string }>;

  if (missing.length === 0) return 0;

  const writeAll = db.transaction((rows: typeof missing) => {
    for (const row of rows) {
      indexPostSearchDocument(
        db,
        toPostSearchDocument({ id: row.id, title: row.title, slug: row.slug, bodyJson: parseBodyJson(row.body_json) })
      );
    }
  });
  writeAll(missing);

  return missing.length;
}

/**
 * Tolerant `body_json` parse for the backfill path.
 *
 * `SqlitePostRepo.toRecord` parses the same column with a bare `JSON.parse`, and is right to: a read
 * that silently returns a post with no body would hide real corruption. This path is different —
 * it is a boot-time sweep over EVERY existing row, so one unparseable legacy body must not stop the
 * server from starting. The post still gets indexed by title and slug; only its body text is lost,
 * which is strictly better than the whole workspace losing search.
 */
function parseBodyJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * Runs one ranked search and returns the hits, best first.
 *
 * Terms are OR'd rather than FTS5's implicit AND, matching `searchToolCatalog`'s identical choice:
 * a two-word query should still surface a strong single-word match rather than returning nothing,
 * and BM25 already demotes the weaker hit rather than needing an AND to exclude it.
 *
 * @param db - The raw better-sqlite3 handle for the content database.
 * @param query - Already validated, tokenized and clamped by `searchAdminPosts`.
 * @returns Up to `query.limit` hits.
 * @complexity FTS5's own posting-list cost per term, plus a primary-key join per candidate row; the
 * `LIMIT` is applied after the visibility filters, so a workspace's trashed/other-kind rows cannot
 * crowd real hits out of the page.
 * @overallScore 100
 */
export function searchPostIndex(db: SqliteDatabase, query: PostSearchQuery): PostSearchHit[] {
  const filters: string[] = ["post_search_fts MATCH ?", "p.workspace_id = ?", "p.deleted_at IS NULL"];
  const params: unknown[] = [query.terms.join(" OR "), query.workspaceId];

  if (query.kind !== undefined) {
    filters.push("p.kind = ?");
    params.push(query.kind);
  }
  if (query.status !== undefined) {
    filters.push("p.status = ?");
    params.push(query.status);
  }
  params.push(query.limit);

  const rows = db
    .prepare(
      `SELECT p.id AS id, p.kind AS kind, p.title AS title, p.slug AS slug, p.status AS status,
              p.updated_at AS updated_at,
              snippet(post_search_fts, ${SNIPPET_COLUMN_BODY_TEXT}, '', '', ?, ${SNIPPET_TOKEN_BUDGET}) AS snippet,
              bm25(post_search_fts, ${BM25_WEIGHTS.title}, ${BM25_WEIGHTS.slug}, ${BM25_WEIGHTS.bodyText}) AS rank
       FROM post_search_fts
       JOIN post_search_document d ON d.rowid = post_search_fts.rowid
       JOIN posts p ON p.id = d.post_id
       WHERE ${filters.join(" AND ")}
       ORDER BY rank
       LIMIT ?`
    )
    // `snippet()`'s ellipsis is the FIRST bound parameter because it appears first in the statement
    // text; the WHERE clause's own parameters follow in `filters` order, and `limit` last.
    .all(SNIPPET_ELLIPSIS, ...params) as PostSearchRow[];

  return rows.map(toHit);
}

/** Projects a joined row into the model-facing hit. `rank` is negated for the same reason
 * `searchToolCatalog` negates it: `bm25()` returns a cost where more-negative is better, and every
 * ranked surface in this codebase reports "higher is better". */
function toHit(row: PostSearchRow): PostSearchHit {
  return {
    id: row.id as UUID,
    kind: row.kind as PostKind,
    title: row.title,
    slug: row.slug,
    status: row.status as PostStatus,
    updatedAt: row.updated_at,
    snippet: row.snippet,
    score: -row.rank,
  };
}

/**
 * The production `PostSearchPort`: FTS5 + BM25 over the durable `post_search_document` index in
 * `content.db`.
 *
 * Constructed by the SQLite composition root (`server/deps.ts`) against the same `ContentDb`
 * `SqlitePostRepo` writes through, so a post saved through the repo is findable through this on the
 * very next call — no reindex step, no eventual consistency window.
 */
export class SqlitePostSearchIndex implements PostSearchPort {
  private readonly sqlite: SqliteDatabase;

  constructor(db: ContentDb) {
    this.sqlite = db.$client;
  }

  async search(required: PostSearchQuery): Promise<PostSearchHit[]> {
    return searchPostIndex(this.sqlite, required);
  }
}
