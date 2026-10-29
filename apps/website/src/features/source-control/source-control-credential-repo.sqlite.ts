import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import { SqlSourceControlCredentialSetRepo } from "./source-control-credential-repo.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import type { SourceControlCredentialSetRepoPort } from "#src/features/source-control/types";
import type { CredentialProjectHalf } from "#src/features/vendor-credentials/project-scope";

/**
 * @file The source-control credential set repo on a site's SQLite `content.db`: {@link SqlSourceControlCredentialSetRepo} (the one Kysely
 * query body, `repos/source-control-credential-repo.ts`), kept as a named class so the call sites that build it
 * from the content db handle stay as they are.
 */
export class SqliteSourceControlCredentialSetRepo extends SqlSourceControlCredentialSetRepo {
  /** The connection's kernel, or the content db handle it is derived from; `optional.project` is the
   *  project store its rows fall back to (`features/source-control/types.ts`). */
  constructor(store: ContentKernel | ContentDb, optional: { project?: CredentialProjectHalf<SourceControlCredentialSetRepoPort> } = {}) {
    super(contentKernel(store), optional);
  }
}
