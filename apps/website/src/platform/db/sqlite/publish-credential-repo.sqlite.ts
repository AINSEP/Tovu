import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { SqlPublishCredentialSetRepo } from "../repos/publish-credential-repo.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file The publish credential set repo on a site's SQLite `content.db`: {@link SqlPublishCredentialSetRepo} (the one Kysely
 * query body, `repos/publish-credential-repo.ts`), kept as a named class so the call sites that build it
 * from the content db handle stay as they are.
 */
export class SqlitePublishCredentialSetRepo extends SqlPublishCredentialSetRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
