import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import { SqlVendorCredentialSetRepo } from "./vendor-credential-repo.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";
import type { VendorCredentialProjectScope } from "#src/features/vendor-credentials/types";

/**
 * @file The vendor credential set repo on a site's SQLite `content.db`: {@link SqlVendorCredentialSetRepo} (the one Kysely
 * query body, `repos/vendor-credential-repo.ts`), kept as a named class so the call sites that build it
 * from the content db handle stay as they are.
 */
export class SqliteVendorCredentialSetRepo extends SqlVendorCredentialSetRepo {
  /** The connection's kernel, or the content db handle it is derived from; `optional.project` is the
   *  project store its rows fall back to (`features/vendor-credentials/types.ts`). */
  constructor(store: ContentKernel | ContentDb, optional: { project?: VendorCredentialProjectScope } = {}) {
    super(contentKernel(store), optional);
  }
}
