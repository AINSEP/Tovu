import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { SqliteConnectionSource } from "../../platform/db/kernel/index.js";
import { SqlCommentRepo, type CommentSqlRequired } from "@jini-ai/cms/comments/sql";

/**
 * @file The comments repo on a site's SQLite `content.db`: Jini's SqlCommentRepo
 * (the one Kysely query body, Jini/packages/cms/src/comments/sql/repo.ts) behind its
 * historical name. Tovu supplies its connection and plugin table policy.
 */
export class SqliteCommentRepo extends SqlCommentRepo {
  /** Binds the connection's kernel, content db handle, or raw client to Tovu's tables.
   * @complexity O(1) connection wiring; opening errors propagate from contentKernel.
   * @example new SqliteCommentRepo({ store: kernel }, {})
   */
  constructor({ store }: { store: ContentKernel | SqliteConnectionSource }, optional: Record<string, never> = {}) {
    super({
      // Erase the host schema only: Jini adds the plugin tables with withTables on this same kernel.
      kernel: contentKernel(store) as unknown as CommentSqlRequired["kernel"],
      tables: { comments: "p_comments__comments", moderationLog: "p_comments__moderation_log" },
    }, optional);
  }
}
