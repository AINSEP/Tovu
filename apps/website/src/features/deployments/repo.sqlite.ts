import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import { SqlDeploymentsReadRepo } from "./repo.js";

/**
 * @file The deployments read repo on a site's SQLite `content.db`: {@link SqlDeploymentsReadRepo}
 * (the one Kysely query body, `repo.ts`), kept as a named class so the composition root that
 * builds it from the content db handle stays as it is; new code calls `deploymentsReadRepoFor`.
 */
export class SqliteDeploymentsReadRepo extends SqlDeploymentsReadRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
