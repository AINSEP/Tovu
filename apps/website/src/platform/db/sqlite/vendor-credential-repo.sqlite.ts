import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { SqlVendorCredentialSetRepo } from "../repos/vendor-credential-repo.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file The vendor credential set repo on a site's SQLite `content.db`: {@link SqlVendorCredentialSetRepo} (the one Kysely
 * query body, `repos/vendor-credential-repo.ts`), kept as a named class so the call sites that build it
 * from the content db handle stay as they are.
 */
export class SqliteVendorCredentialSetRepo extends SqlVendorCredentialSetRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
