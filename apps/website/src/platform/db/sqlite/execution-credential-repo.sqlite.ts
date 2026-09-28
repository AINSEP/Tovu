import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { SqlAdminExecutionCredentialRepo } from "../repos/execution-credential-repo.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file The admin execution credential repo on a site's SQLite `content.db`: {@link
 * SqlAdminExecutionCredentialRepo} (the one Kysely query body,
 * `repos/execution-credential-repo.ts`), kept as a named class so the call sites that build it from
 * the content db handle stay as they are.
 */
export class SqliteAdminExecutionCredentialRepo extends SqlAdminExecutionCredentialRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
