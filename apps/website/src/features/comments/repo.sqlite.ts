import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { SqliteConnectionSource } from "../../platform/db/kernel/index.js";
import { SqlCommentRepo } from "./repo.js";

/**
 * @file The comments repo on a site's SQLite `content.db`: {@link SqlCommentRepo} (the one Kysely
 * query body, `repo.ts`) behind its historical name, so the composition root's construction site
 * stays as it is; new code calls `commentRepoFor`.
 */
export class SqliteCommentRepo extends SqlCommentRepo {
  /** The connection's kernel, the content db handle it derives from, or the raw client. */
  constructor(store: ContentKernel | SqliteConnectionSource) {
    super(contentKernel(store));
  }
}
