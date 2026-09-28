import { type ContentKernel, contentKernel } from "../content-kernel.js";
import { SqlCustomCredentialSetRepo } from "../repos/custom-credential-repo.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file The custom credential set repo on a site's SQLite `content.db`: {@link
 * SqlCustomCredentialSetRepo} (the one Kysely query body, `repos/custom-credential-repo.ts`), kept
 * as a named class so the call sites that build it from the content db handle stay as they are.
 */
export class SqliteCustomCredentialSetRepo extends SqlCustomCredentialSetRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
