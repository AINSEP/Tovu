import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { SqlChangeSetRepo } from "../repos/change-set-repo.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file The change-set repo on a site's SQLite `content.db`: {@link SqlChangeSetRepo} (the one
 * Kysely query body, `repos/change-set-repo.ts`), kept as a named class so the composition root
 * that builds it from the content db handle stays as it is.
 */
export class SqliteChangeSetRepo extends SqlChangeSetRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
