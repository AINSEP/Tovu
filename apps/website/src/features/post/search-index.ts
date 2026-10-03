import type { UUID } from "@jini-ai/core/primitives";
import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import type { PostKind, PostStatus } from "./post.js";
import type { PostSearchProjection } from "./repo.js";
import { toPostSearchDocument, type PostSearchHit, type PostSearchPort, type PostSearchQuery } from "./search.js";
import { pgPostSearch } from "./search-index.postgres.js";
import { sqlitePostSearch } from "./search-index.sqlite.js";

/**
 * @file Post search over the storage kernel: ONE port, one implementation per dialect, picked by
 * `kernel.dialect` in {@link postSearchFor} (storage-adapter plan slice F1).
 *
 * Full-text search is the one place post storage is spelled per dialect, by design: SQLite's FTS5
 * (`search-index.sqlite.ts`) has no Postgres twin and Postgres's `tsvector` (`search-index.postgres.ts`)
 * has no SQLite one. Both run through `kernel.run`/`kernel.query` with `sql` fragments, never a raw
 * driver handle, and both keep the same projection table (`post_search_document`, keyed by post id),
 * the same query-time visibility filters against the live `posts` row, and the same OR-of-terms
 * semantics. Their agreement is gated by the eval set in `__tests__/search.eval.ts`.
 */

/** One dialect's post search: the repo's projection writes plus the ranked query. */
export interface PostSearchDialect extends PostSearchProjection {
  search(kernel: ContentKernel, query: PostSearchQuery): Promise<PostSearchHit[]>;
}

/** `post_search_document` as both dialects share it (the Postgres one adds a `search` tsvector). It
 *  is not in the generated `ContentDatabase` types: SQLite builds it in drizzle migration 0022,
 *  Postgres in migration step `0001_post_search`. */
export type SearchProjectionTables = {
  post_search_document: { post_id: string; title: string; slug: string; body_text: string };
};

/** One ranked row, before projection into a {@link PostSearchHit}. */
export interface PostSearchRow {
  id: string;
  kind: string;
  title: string;
  slug: string;
  status: string;
  updated_at: string;
  snippet: string;
  /** Higher is better (each dialect converts its own scale). */
  score: number;
}

export function toPostSearchHit(row: PostSearchRow): PostSearchHit {
  return {
    id: row.id as UUID,
    kind: row.kind as PostKind,
    title: row.title,
    slug: row.slug,
    status: row.status as PostStatus,
    updatedAt: row.updated_at,
    snippet: row.snippet,
    score: Number(row.score),
  };
}

/** The post search for `kernel`'s dialect. */
export function postSearchFor(kernel: ContentKernel): PostSearchDialect {
  return kernel.dialect === "sqlite" ? sqlitePostSearch : pgPostSearch;
}

/**
 * The production `PostSearchPort` on any content database. Constructed by the composition root
 * against the same kernel the post repo writes through, so a saved post is findable on the next
 * call — no reindex step, no eventual-consistency window.
 */
export class PostSearchIndex implements PostSearchPort {
  protected readonly kernel: ContentKernel;
  private readonly ready: Promise<unknown> | undefined;

  /**
   * @param store - The content kernel, or the SQLite content db handle it is derived from.
   * @param optional.ready - Settles when the boot backfill is done; every search waits for it.
   */
  constructor(store: ContentKernel | ContentDb, optional: { ready?: Promise<unknown> } = {}) {
    this.kernel = contentKernel(store);
    this.ready = optional.ready;
  }

  async search(required: PostSearchQuery): Promise<PostSearchHit[]> {
    await this.ready;
    return postSearchFor(this.kernel).search(this.kernel, required);
  }
}

/**
 * The FTS5 `PostSearchPort` on a site's SQLite `content.db`: {@link PostSearchIndex} kept as a
 * named class so call sites that construct it from the content db handle stay as they are.
 */
export class SqlitePostSearchIndex extends PostSearchIndex {}

/**
 * The composition root's post search on `kernel`, whichever dialect: FTS5 on SQLite, the
 * `tsvector` index on Postgres/PGlite ({@link postSearchFor} picks per call).
 *
 * @param optional.ready - Settles when the boot backfill is done; every search waits for it.
 */
export function postSearchIndexFor(kernel: ContentKernel, optional: { ready?: Promise<unknown> } = {}): PostSearchPort {
  return new PostSearchIndex(kernel, optional);
}

/** Posts indexed per backfill transaction: one PGlite transaction blocks every other client. */
export const BACKFILL_BATCH_SIZE = 50;

/**
 * Indexes every post that has no projection yet, and returns how many it wrote.
 *
 * This is the answer to "existing posts must be searchable without an edit" — both for a database
 * that predates the index and for the demo content `seedContentDb` inserts straight into `posts`
 * without going near the repo. Anti-join rather than a rebuild: on a warm database it costs one
 * indexed `NOT EXISTS` scan and writes nothing, which is what makes it safe to run on every boot.
 *
 * NOT a repair pass. It fills gaps; it does not re-extract text for posts already indexed, because
 * the only thing that could make an existing projection wrong is a change to `extractPostPlainText`
 * itself — a code change, which is a migration's job to follow up, not a boot step's.
 *
 * Runs in small transactions of {@link BACKFILL_BATCH_SIZE} posts, each re-reading what is still
 * missing: a long single transaction would hold PGlite's one connection (every other client, the
 * agent daemon included, waits). A crash midway leaves whole batches indexed and the rest for the
 * next boot, which is what the anti-join already handles.
 *
 * @param store - The content kernel, or the SQLite content db handle it is derived from.
 * @param optional.batchSize - Posts per transaction (tests).
 * @returns The number of posts newly indexed.
 * @complexity O(m) in the number of UNINDEXED posts, plus one O(n) anti-join over `posts` per batch.
 * @overallScore 100
 */
export async function backfillPostSearchIndex(store: ContentKernel | ContentDb, optional: { batchSize?: number } = {}): Promise<number> {
  const kernel = contentKernel(store);
  const search = postSearchFor(kernel);
  const batchSize = optional.batchSize ?? BACKFILL_BATCH_SIZE;
  let indexed = 0;
  for (;;) {
    const written = await kernel.transaction(async () => {
      const missing = await kernel.run((db) =>
        db
          .withTables<SearchProjectionTables>()
          .selectFrom("posts as p")
          .select(["p.id", "p.title", "p.slug", "p.body_json"])
          .where(({ not, exists, selectFrom }) =>
            not(exists(selectFrom("post_search_document as d").select("d.post_id").whereRef("d.post_id", "=", "p.id")))
          )
          .orderBy("p.id")
          .limit(batchSize)
          .execute()
      );
      for (const row of missing) {
        await search.upsert(
          kernel,
          toPostSearchDocument({ id: row.id as UUID, title: row.title, slug: row.slug, bodyJson: parseBodyJson(row.body_json) })
        );
      }
      return missing.length;
    });
    indexed += written;
    if (written < batchSize) return indexed;
  }
}

/**
 * Tolerant `body_json` read for the backfill path (text on SQLite, already parsed on Postgres).
 *
 * The repo's `toRecord` parses the same column with a bare `JSON.parse`, and is right to: a read
 * that silently returns a post with no body would hide real corruption. This path is different —
 * it is a boot-time sweep over EVERY existing row, so one unparseable legacy body must not stop the
 * server from starting. The post still gets indexed by title and slug; only its body text is lost.
 */
function parseBodyJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
