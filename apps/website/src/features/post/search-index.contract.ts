import type { UUID } from "@jini-ai/core/primitives";
import type { ContentKernel } from "../../platform/db/content-kernel.js";
import type { PostKind, PostStatus } from "./post.js";
import type { PostSearchDocument, PostSearchHit, PostSearchQuery } from "./search.js";

/** Where a dialect keeps post search text. Written in the same transaction as the post. */
export interface PostSearchProjection {
  upsert(kernel: ContentKernel, document: PostSearchDocument): Promise<void>;
  remove(kernel: ContentKernel, postId: string): Promise<void>;
}

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

