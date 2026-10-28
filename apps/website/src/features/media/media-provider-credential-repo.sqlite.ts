import { type ContentKernel, contentKernel } from "../../platform/db/content-kernel.js";
import { SqlMediaProviderCredentialRepo } from "./media-provider-credential-repo.js";
import type { ContentDb } from "../../platform/db/sqlite/content-db.js";

/**
 * @file The media provider credential repo on a site's SQLite `content.db`: {@link
 * SqlMediaProviderCredentialRepo} (the one Kysely query body,
 * `repos/media-provider-credential-repo.ts`), kept as a named class so the call sites that build it
 * from the content db handle stay as they are.
 */
export class SqliteMediaProviderCredentialRepo extends SqlMediaProviderCredentialRepo {
  /** The connection's kernel, or the content db handle it is derived from. */
  constructor(store: ContentKernel | ContentDb) {
    super(contentKernel(store));
  }
}
