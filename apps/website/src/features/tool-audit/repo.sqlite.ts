import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlToolAttemptAuditSink, type SqlToolAttemptAuditSinkOptions } from "./repo.js";

export { MAX_ROWS_PER_WORKSPACE } from "./repo.js";
export type { SqlToolAttemptAuditSinkOptions as SqliteToolAttemptAuditSinkOptions } from "./repo.js";

/**
 * @file The tool-attempt audit sink on a site's SQLite `content.db`: {@link SqlToolAttemptAuditSink}
 * (the one Kysely query body, `repo.ts`), kept as a named class so the composition root that builds
 * it from the content db handle stays as it is.
 */
export class SqliteToolAttemptAuditSink extends SqlToolAttemptAuditSink {
  /** @param store - The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb, options: SqlToolAttemptAuditSinkOptions = {}) {
    super(contentKernel(store), options);
  }
}
